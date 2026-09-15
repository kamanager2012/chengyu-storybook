#!/usr/bin/env node
/**
 * Listen-only candidate narration using a pending Kokoro provider profile.
 *
 * Does NOT promote APPROVED_KOKORO, does NOT write durable receipts, and does NOT
 * update narration-state. Overlays public/audio/<story> after backing up current MP3s
 * so the local reader can evaluate warmth before a formal cutover.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  KOKORO_MP3_BITRATE_KBPS,
  KOKORO_SAMPLE_RATE_HZ,
  readRuntimeCheckoutSnapshot,
  sha256AudioBuffer,
  validateApprovedGenerationSet,
  validateGeneratedMp3,
  validateKokoroRuntimeCheckouts,
} from "./kokoro-generation-contract.mjs";
import {
  validateKokoroLocalAssets,
} from "./kokoro-provider-profile.mjs";
import {
  KOKORO_RUNTIME_TORCH_VERSION,
  validateKokoroRuntimeHost,
} from "./kokoro-runtime-environment.mjs";
import { buildNarrationGenerationSet } from "./narration-generation-set.mjs";
import { repoRoot } from "./story-model.mjs";

const ENGINE_SCRIPT = join(repoRoot, "scripts/kokoro-synthesize.py");
const RUNTIME_SMOKE_SCRIPT = join(repoRoot, "scripts/kokoro-runtime-smoke.py");
const DEFAULT_PENDING_PROFILE = "content/evidence/narration/providers/kokoro-v1.1-zh-zf005.pending.json";
const WORK_ROOT = join(repoRoot, ".narration-work");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error(`Missing required argument ${name}`);
  return value;
}

function commandReport(command, args, label) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw new Error(`${label} is unavailable: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function commandJsonReport(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: options.env ?? process.env,
  });
  if (result.error) throw new Error(`${label} is unavailable: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  }
  try {
    return JSON.parse((result.stdout ?? "").trim());
  } catch (error) {
    throw new Error(`${label} did not return machine-readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function inspectFfmpeg(ffmpeg) {
  const versionOutput = commandReport(ffmpeg, ["-version"], "ffmpeg");
  const encoderOutput = commandReport(ffmpeg, ["-hide_banner", "-encoders"], "ffmpeg encoder inventory");
  if (!/\blibmp3lame\b/.test(encoderOutput)) {
    throw new Error("ffmpeg must expose the libmp3lame encoder");
  }
  return { version: versionOutput.split(/\r?\n/, 1)[0] };
}

function inspectPython(python) {
  const output = commandReport(python, ["--version"], "Python");
  const match = output.match(/Python\s+([^\s]+)/);
  if (!match) throw new Error(`Unable to parse Python version from: ${output}`);
  return { version: match[1] };
}

function encodeMp3(ffmpeg, wavPath, mp3Path) {
  mkdirSync(dirname(mp3Path), { recursive: true });
  execFileSync(ffmpeg, [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", wavPath,
    "-codec:a", "libmp3lame",
    "-b:a", `${KOKORO_MP3_BITRATE_KBPS}k`,
    "-ar", String(KOKORO_SAMPLE_RATE_HZ),
    "-ac", "1",
    mp3Path,
  ], { stdio: "inherit" });
}

function validatePendingCandidateProfile(profile) {
  const issues = [];
  if (profile?.schemaVersion !== 1) issues.push("schemaVersion must be 1");
  if (profile?.status !== "pending-approval") issues.push("status must be pending-approval");
  if (profile?.providerType !== "local-open-weight") issues.push("providerType must be local-open-weight");
  if (profile?.language !== "zh") issues.push("language must be zh");
  if (profile?.sampleRateHz !== 24000) issues.push("sampleRateHz must be 24000");
  if (profile?.generationPolicy?.voiceMode !== "bundled-profile") issues.push("voiceMode must be bundled-profile");
  if (profile?.generationPolicy?.referenceSpeakerAudio !== false) issues.push("referenceSpeakerAudio must be false");
  if (profile?.generationPolicy?.voiceCloning !== false) issues.push("voiceCloning must be false");
  if (profile?.generationPolicy?.networkRequiredAtSynthesis !== false) issues.push("networkRequiredAtSynthesis must be false");
  if (profile?.model?.voice?.id !== "zf_005") issues.push("candidate voice id must be zf_005");
  if (profile?.model?.voice?.file !== "voices/zf_005.pt") issues.push("candidate voice file must be voices/zf_005.pt");
  if (profile?.rights?.claimForGeneratedNarration !== "permission") issues.push("rights claim must be permission");
  const speed = profile?.generationPolicy?.storytellingSpeed;
  if (!speed || speed.mode !== "length-aware") issues.push("storytellingSpeed.mode must be length-aware");
  return { valid: issues.length === 0, issues };
}

function validateRuntimeSmoke(report, kokoroDir, misakiDir) {
  const problems = [];
  if (report?.schemaVersion !== 1) problems.push("runtime smoke schemaVersion must be 1");
  if (report?.runtime !== "kokoro-mandarin-minimal-v1") problems.push("runtime smoke identity drifted");
  const host = validateKokoroRuntimeHost({
    platform: report?.platform,
    arch: report?.arch,
    pythonVersion: report?.pythonVersion,
    torchVersion: report?.versions?.torch,
    device: report?.device,
  });
  problems.push(...host.issues);
  if (report?.versions?.torch !== KOKORO_RUNTIME_TORCH_VERSION) {
    problems.push(`runtime smoke torch must be ${KOKORO_RUNTIME_TORCH_VERSION}`);
  }
  for (const [label, modulePath, checkout] of [
    ["kokoro", report?.kokoroModulePath, kokoroDir],
    ["misaki", report?.misakiModulePath, misakiDir],
  ]) {
    if (typeof modulePath !== "string") {
      problems.push(`${label} smoke module path is missing`);
      continue;
    }
    const rel = relative(resolve(checkout), resolve(modulePath)).replaceAll("\\", "/");
    if (rel === ".." || rel.startsWith("../") || rel.startsWith("/")) {
      problems.push(`${label} smoke module resolved outside pinned checkout`);
    }
  }
  return { valid: problems.length === 0, problems: [...new Set(problems)].sort() };
}

async function main() {
  const story = requiredArg("--story");
  const assetsDir = resolve(requiredArg("--assets-dir"));
  const kokoroSrcDir = resolve(requiredArg("--kokoro-src-dir"));
  const misakiSrcDir = resolve(requiredArg("--misaki-src-dir"));
  const profilePath = resolve(argValue("--profile") ?? join(repoRoot, DEFAULT_PENDING_PROFILE));
  const python = argValue("--python") ?? join(repoRoot, "scripts/narration-runtime/.venv/bin/python");
  const ffmpeg = argValue("--ffmpeg") ?? "ffmpeg";
  const dryRun = process.argv.includes("--dry-run");
  const noOverlay = process.argv.includes("--no-overlay");

  const profile = JSON.parse(readFileSync(profilePath, "utf8"));
  const profileValidation = validatePendingCandidateProfile(profile);
  if (!profileValidation.valid) {
    throw new Error(`Candidate provider profile is invalid:\n${profileValidation.issues.join("\n")}`);
  }

  const localAssets = validateKokoroLocalAssets(profile, assetsDir);
  if (!localAssets.valid) {
    throw new Error(`Pinned Kokoro local assets are invalid:\n${localAssets.issues.join("\n")}`);
  }

  const runtimeCheckouts = {
    kokoro: readRuntimeCheckoutSnapshot(kokoroSrcDir),
    misaki: readRuntimeCheckoutSnapshot(misakiSrcDir),
  };
  const runtimeValidation = validateKokoroRuntimeCheckouts(runtimeCheckouts);
  if (!runtimeValidation.valid) {
    throw new Error(`Pinned Kokoro runtime checkout is invalid:\n${runtimeValidation.problems.join("\n")}`);
  }

  const generationSet = buildNarrationGenerationSet({ story });
  const generationValidation = validateApprovedGenerationSet(generationSet);
  if (!generationValidation.valid) {
    throw new Error(`Narration generation input set is not approved:\n${generationValidation.problems.join("\n")}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const workDir = join(WORK_ROOT, `candidate-${profile.model.voice.id}-${story}-${stamp}`);
  const summary = {
    schemaVersion: 1,
    mode: dryRun ? "dry-run" : "candidate-listen",
    warning: "Listen-only. Does not promote APPROVED_KOKORO, write receipts, or update narration-state.",
    story,
    profileId: profile.profileId,
    profilePath: relative(repoRoot, profilePath).replaceAll("\\", "/"),
    voice: profile.model.voice.id,
    speedPolicy: profile.generationPolicy.storytellingSpeed,
    inputItemCount: generationSet.count,
    inputDigestSha256: generationSet.inputDigestSha256,
    workDir: relative(repoRoot, workDir).replaceAll("\\", "/"),
    overlayPublicAudio: !noOverlay,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (dryRun) return;

  const pythonInfo = inspectPython(python);
  const hostPreflight = validateKokoroRuntimeHost({
    platform: process.platform,
    arch: process.arch,
    pythonVersion: pythonInfo.version,
    device: "cpu",
  });
  if (!hostPreflight.valid) throw new Error(`Narration host preflight failed:\n${hostPreflight.issues.join("\n")}`);

  const offlineEnv = {
    ...process.env,
    PYTHONPATH: [join(repoRoot, "scripts"), process.env.PYTHONPATH].filter(Boolean).join(":"),
    PYTHONDONTWRITEBYTECODE: "1",
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
  };
  const runtimeSmoke = commandJsonReport(python, [
    RUNTIME_SMOKE_SCRIPT,
    "--kokoro-src-dir", kokoroSrcDir,
    "--misaki-src-dir", misakiSrcDir,
  ], "Kokoro locked runtime smoke", { env: offlineEnv });
  const smokeValidation = validateRuntimeSmoke(runtimeSmoke, kokoroSrcDir, misakiSrcDir);
  if (!smokeValidation.valid) {
    throw new Error(`Kokoro locked runtime smoke is invalid:\n${smokeValidation.problems.join("\n")}`);
  }

  inspectFfmpeg(ffmpeg);
  mkdirSync(workDir, { recursive: true });

  const wavRoot = join(workDir, "wav");
  const mp3Root = join(workDir, "mp3");
  const backupRoot = join(workDir, "backup-public");
  const manifestPath = join(workDir, "manifest.json");
  const manifest = {
    schemaVersion: 1,
    mode: "candidate-listen",
    profileId: profile.profileId,
    voice: profile.model.voice.id,
    speedPolicy: profile.generationPolicy.storytellingSpeed,
    inputItemCount: generationSet.count,
    inputDigestSha256: generationSet.inputDigestSha256,
    entries: generationSet.entries.map((entry) => ({
      key: entry.key,
      text: entry.text,
      textSha256: entry.textSha256,
      file: entry.file,
      wavPath: join(wavRoot, `${entry.key}.wav`),
    })),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });

  const engineStdout = execFileSync(python, [
    ENGINE_SCRIPT,
    "--manifest", manifestPath,
    "--assets-dir", assetsDir,
    "--kokoro-src-dir", kokoroSrcDir,
    "--misaki-src-dir", misakiSrcDir,
    "--voice-file", profile.model.voice.file,
    "--device", "cpu",
  ], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    env: offlineEnv,
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
  const engineReport = JSON.parse(engineStdout);
  writeFileSync(join(workDir, "engine-report.json"), `${JSON.stringify(engineReport, null, 2)}\n`, { flag: "wx" });
  writeFileSync(join(workDir, "runtime-smoke.json"), `${JSON.stringify(runtimeSmoke, null, 2)}\n`, { flag: "wx" });

  const engineByKey = new Map(engineReport.items.map((item) => [item.key, item]));
  const outputs = [];
  for (const entry of generationSet.entries) {
    const engineItem = engineByKey.get(entry.key);
    if (!engineItem) throw new Error(`${entry.key}: engine output missing`);
    const stagedPath = join(mp3Root, `${entry.key}.mp3`);
    encodeMp3(ffmpeg, engineItem.wavPath, stagedPath);
    const audio = readFileSync(stagedPath);
    const mp3Validation = validateGeneratedMp3(audio);
    if (!mp3Validation.valid) {
      throw new Error(`${entry.key}: generated MP3 is invalid:\n${mp3Validation.problems.join("\n")}`);
    }
    outputs.push({
      key: entry.key,
      file: entry.file,
      stagedPath,
      bytes: audio.length,
      audioSha256: sha256AudioBuffer(audio),
      durationSeconds: engineItem.durationSeconds,
    });
  }

  const overlay = [];
  if (!noOverlay) {
    for (const output of outputs) {
      const publicPath = join(repoRoot, output.file);
      if (!existsSync(publicPath)) throw new Error(`Public audio missing for overlay: ${output.file}`);
      const backupPath = join(backupRoot, output.file);
      mkdirSync(dirname(backupPath), { recursive: true });
      copyFileSync(publicPath, backupPath);
      const tempPath = `${publicPath}.candidate-tmp`;
      copyFileSync(output.stagedPath, tempPath);
      renameSync(tempPath, publicPath);
      overlay.push({
        file: output.file,
        audioSha256: output.audioSha256,
        bytes: output.bytes,
        backup: relative(repoRoot, backupPath).replaceAll("\\", "/"),
      });
    }
  }

  const report = {
    schemaVersion: 1,
    mode: "candidate-listen",
    durableReceipt: false,
    narrationStateUpdated: false,
    approvedProfileUnchanged: true,
    story,
    profileId: profile.profileId,
    voice: profile.model.voice.id,
    speedPolicy: profile.generationPolicy.storytellingSpeed,
    appliedSpeedMin: engineReport.appliedSpeedMin,
    appliedSpeedMax: engineReport.appliedSpeedMax,
    inputItemCount: generationSet.count,
    inputDigestSha256: generationSet.inputDigestSha256,
    workDir: relative(repoRoot, workDir).replaceAll("\\", "/"),
    listen: {
      storyPath: `/story/${story}`,
      note: "Open the local reader and play shou-zhu. This overlays public/audio only; restore from backup before any provenance gate.",
      restoreHint: `cp -a ${relative(repoRoot, backupRoot).replaceAll("\\", "/")}/public/audio/${story}/. public/audio/${story}/`,
    },
    outputs,
    overlay,
  };
  writeFileSync(join(workDir, "listen-report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
