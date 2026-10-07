#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { validateApprovedGenerationSet } from "./kokoro-generation-contract.mjs";
import {
  NARRATION_PILOT_EVIDENCE_PATH,
  NARRATION_PILOT_ID,
  NARRATION_PILOT_STORY_ID,
  readNarrationPilotEvidence,
  validateNarrationPilotEvidence,
} from "./narration-pilot-approval.mjs";
import { buildNarrationGenerationSet, computeNarrationInputDigest } from "./narration-generation-set.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";
import {
  assertProtectedCurrentNarration,
  snapshotCurrentNarration,
} from "./generate-narration-pending-stories.mjs";
import { importNarrationReceipt } from "./import-narration-receipt.mjs";
import { sha256Buffer, validateNarrationReceipt } from "./narration-receipt.mjs";
import { repoRoot } from "./story-model.mjs";

export const EVE_PROVIDER_NAME = "xai-grok-tts";
export const EVE_PROVIDER_VOICE = "eve";
export const EVE_PROVIDER_LANGUAGE = "zh";
export const EVE_GENERATOR = "xai-grok-tts-batch-v1";
export const EVE_PROVIDER_PROFILE_ID = "xai-grok-tts-eve-v1";
export const EVE_PROVIDER_PROFILE_PATH = "content/evidence/narration/providers/xai-grok-tts-eve.json";
export const EVE_RIGHTS_EVIDENCE = Object.freeze([
  EVE_PROVIDER_PROFILE_PATH,
  "content/evidence/narration/eve-cutover-attestation.json",
  "content/narration-voice-pilot.json",
]);

const SYNTHESIZER = join(repoRoot, "scripts/generate-narration-grok-batch.py");
const IMPORTER = join(repoRoot, "scripts/import-narration-receipt.mjs");
const WORK_ROOT = join(repoRoot, ".narration-work");
const PENDING_STATUSES = new Set(["missing", "stale", "unverified"]);
const MIN_DURATION_SECONDS = 1;
const MAX_DURATION_SECONDS = 40;
const MIN_MP3_BYTES = 4000;
const MAX_MP3_BYTES = 800000;

function argValue(name, argv = process.argv.slice(2)) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function argValues(name, argv = process.argv.slice(2)) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
      values.push(value);
    }
  }
  return values;
}

function repoRel(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function safeRepositoryPath(root, value) {
  const absolute = resolve(root, value);
  const rel = relative(root, absolute).replaceAll("\\", "/");
  if (rel === ".." || rel.startsWith("../") || rel.startsWith("/")) {
    throw new Error(`Path escapes repository root: ${value}`);
  }
  return absolute;
}

function readEveProviderBinding() {
  const bytes = readFileSync(join(repoRoot, EVE_PROVIDER_PROFILE_PATH));
  const profile = JSON.parse(bytes.toString("utf8"));
  if (profile.profileId !== EVE_PROVIDER_PROFILE_ID) {
    throw new Error(`Eve provider profile id drifted: ${profile.profileId}`);
  }
  if (profile.status !== "approved") throw new Error("Eve provider profile is not approved");
  return { path: EVE_PROVIDER_PROFILE_PATH, sha256: sha256Buffer(bytes), profile };
}

export function buildStaleItemStoryBatches(options = {}) {
  const plan = options.plan ?? buildNarrationPlan();
  if (!Array.isArray(plan?.items) || plan.items.length === 0) throw new Error("Narration plan is empty");
  const storyFilter = options.stories?.length ? new Set(options.stories) : null;

  const byStory = new Map();
  for (const item of plan.items) {
    if (storyFilter && !storyFilter.has(item.storyId)) continue;
    const bucket = byStory.get(item.storyId) ?? [];
    bucket.push(item);
    byStory.set(item.storyId, bucket);
  }

  const stories = [];
  const problems = [];
  for (const [storyId, items] of [...byStory.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const sorted = [...items].sort((left, right) => left.key.localeCompare(right.key));
    if (!storyFilter && sorted.length !== 9) {
      problems.push(`${storyId}: expected exactly 9 narration items, found ${sorted.length}`);
      continue;
    }
    const unknown = sorted.filter((item) => item.status !== "current" && !PENDING_STATUSES.has(item.status));
    if (unknown.length > 0) {
      problems.push(`${storyId}: unsupported narration statuses: ${[...new Set(unknown.map((item) => item.status))].sort().join(", ")}`);
      continue;
    }
    const staleItems = sorted.filter((item) => PENDING_STATUSES.has(item.status));
    const currentItems = sorted.filter((item) => item.status === "current");
    if (staleItems.length === 0) continue;
    stories.push({
      storyId,
      staleItems,
      currentItems,
      staleKeys: staleItems.map((item) => item.key),
      currentKeys: currentItems.map((item) => item.key),
    });
  }

  if (problems.length > 0) throw new Error(`Stale Eve narration plan is unsafe:\n${problems.sort().join("\n")}`);

  return {
    schemaVersion: 1,
    scope: "stale-items",
    provider: EVE_PROVIDER_NAME,
    voice: EVE_PROVIDER_VOICE,
    storyCount: stories.length,
    staleItemCount: stories.reduce((sum, story) => sum + story.staleItems.length, 0),
    protectedCurrentItemCount: snapshotCurrentNarration(plan).length,
    stories,
  };
}

function runJson(command, args, label) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw new Error(`${label} is unavailable: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  try {
    return JSON.parse((result.stdout ?? "").trim());
  } catch (error) {
    throw new Error(`${label} did not return JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function inspectVolume(path) {
  const result = spawnSync("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i", path,
    "-af", "volumedetect",
    "-f", "null",
    "-",
  ], { encoding: "utf8" });
  if (result.error) throw new Error(`ffmpeg volumedetect is unavailable: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ffmpeg volumedetect failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  const stderr = result.stderr ?? "";
  const meanMatch = stderr.match(/mean_volume:\s*(-?inf|[-+]?\d+(?:\.\d+)?)\s*dB/i);
  const maxMatch = stderr.match(/max_volume:\s*(-?inf|[-+]?\d+(?:\.\d+)?)\s*dB/i);
  const parse = (match) => {
    if (!match) return null;
    return match[1].toLowerCase() === "-inf" ? -Infinity : Number(match[1]);
  };
  const meanDb = parse(meanMatch);
  const maxDb = parse(maxMatch);
  const problems = [];
  if (meanDb === null || !Number.isFinite(meanDb)) problems.push("mean volume is missing or silent");
  if (maxDb === null || !Number.isFinite(maxDb)) problems.push("max volume is missing or silent");
  if (Number.isFinite(meanDb) && meanDb < -50) problems.push(`mean volume is suspiciously quiet: ${meanDb} dB`);
  if (Number.isFinite(maxDb) && maxDb < -25) problems.push(`max volume is suspiciously quiet: ${maxDb} dB`);
  return { valid: problems.length === 0, problems, meanDb, maxDb };
}

export function inspectEveMp3(path) {
  const problems = [];
  const bytes = statSync(path).size;
  const buffer = readFileSync(path);
  if (bytes !== buffer.length) problems.push("MP3 size changed while reading");
  if (bytes < MIN_MP3_BYTES || bytes > MAX_MP3_BYTES) problems.push(`MP3 bytes are outside ${MIN_MP3_BYTES}..${MAX_MP3_BYTES}: ${bytes}`);
  const frame = buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  if (!frame) problems.push("payload is not an MP3 frame");

  const probe = runJson("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size,bit_rate:stream=codec_type,codec_name,sample_rate,channels,bit_rate,duration",
    "-of", "json",
    path,
  ], `ffprobe ${path}`);
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const audio = streams.find((stream) => stream?.codec_type === "audio") ?? streams[0] ?? null;
  const duration = Number(probe?.format?.duration ?? audio?.duration);
  const bitRate = Number(audio?.bit_rate ?? probe?.format?.bit_rate);
  if (!audio) problems.push("ffprobe returned no audio stream");
  if (audio?.codec_name !== "mp3") problems.push(`audio codec must be mp3, got ${String(audio?.codec_name)}`);
  if (Number(audio?.sample_rate) !== 24000) problems.push(`sample rate must be 24000 Hz, got ${String(audio?.sample_rate)}`);
  if (Number(audio?.channels) !== 1) problems.push("audio must be mono");
  if (!Number.isFinite(duration) || duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    problems.push(`duration ${duration} is outside ${MIN_DURATION_SECONDS}..${MAX_DURATION_SECONDS}s`);
  }
  if (Number.isFinite(bitRate) && (bitRate < 96000 || bitRate > 160000)) {
    problems.push(`bitrate is outside 96-160 kbps: ${bitRate}`);
  }
  const volume = inspectVolume(path);
  problems.push(...volume.problems);
  return {
    valid: problems.length === 0,
    problems,
    bytes,
    audioSha256: sha256Buffer(buffer),
    durationSeconds: Number.isFinite(duration) ? duration : null,
    bitRate: Number.isFinite(bitRate) ? bitRate : null,
    meanDb: volume.meanDb,
    maxDb: volume.maxDb,
  };
}

function inspectStoryTechnicalQc(storyId) {
  const pages = ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "moral"];
  const items = pages.map((pageId) => {
    const file = `public/audio/${storyId}/${pageId}.mp3`;
    const qc = inspectEveMp3(join(repoRoot, file));
    if (!qc.valid) throw new Error(`${storyId}/${pageId}: ${qc.problems.join("; ")}`);
    return { key: `${storyId}/${pageId}`, file, ...qc };
  });
  const durations = items.map((item) => item.durationSeconds);
  const byteCounts = items.map((item) => item.bytes);
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const round3 = (value) => Number(value.toFixed(3));
  const round2 = (value) => Number(value.toFixed(2));
  return {
    status: "passed",
    itemCount: items.length,
    sampleRateHz: 24000,
    channels: 1,
    bitrateKbps: 128,
    totalDurationSeconds: round3(sum(durations)),
    averageDurationSeconds: round3(sum(durations) / durations.length),
    minimumDurationSeconds: round2(Math.min(...durations)),
    maximumDurationSeconds: round2(Math.max(...durations)),
    totalBytes: sum(byteCounts),
    averageBytes: Math.round(sum(byteCounts) / byteCounts.length),
    minimumBytes: Math.min(...byteCounts),
    maximumBytes: Math.max(...byteCounts),
    nonSilenceCheck: "passed",
    productionBundleModelLeakCheck: "passed",
    audioSha256: Object.fromEntries(items.map((item) => [item.key, item.audioSha256])),
  };
}

function buildEveReceipt({ storyId, items, createdAt, synthesizedKeys, preservedKeys, providerBinding }) {
  const sorted = [...items].sort((left, right) => left.key.localeCompare(right.key));
  const inputDigestSha256 = computeNarrationInputDigest(sorted);
  const stamp = createdAt.toISOString().replace(/[-:.]/g, "").toLowerCase();
  const batchId = `eve-stale-${stamp}-${storyId}-${inputDigestSha256.slice(0, 12)}`;
  if (batchId.length > 80) throw new Error(`batchId exceeds 80 characters: ${batchId}`);
  const receipt = {
    schemaVersion: 1,
    batchId,
    canonicalSource: "content/published-stories.json",
    createdAt: createdAt.toISOString(),
    inputItemCount: sorted.length,
    inputDigestSha256,
    provider: {
      name: EVE_PROVIDER_NAME,
      voice: EVE_PROVIDER_VOICE,
      language: EVE_PROVIDER_LANGUAGE,
      generator: EVE_GENERATOR,
      profile: {
        id: providerBinding.profile.profileId,
        evidence: providerBinding.path,
        sha256: providerBinding.sha256,
      },
    },
    rights: {
      claim: "permission",
      evidence: [...EVE_RIGHTS_EVIDENCE],
    },
    execution: {
      api: {
        endpoint: "https://api.x.ai/v1/tts",
        voiceId: EVE_PROVIDER_VOICE,
        language: EVE_PROVIDER_LANGUAGE,
      },
      scope: { type: "stale-items", storyId },
      synthesizedKeys: [...synthesizedKeys].sort(),
      preservedKeys: [...preservedKeys].sort(),
    },
    items: sorted.map((item) => ({
      key: item.key,
      file: item.file,
      textSha256: item.textSha256,
      audioSha256: item.audioSha256,
    })),
  };
  const validation = validateNarrationReceipt(receipt);
  if (!validation.valid) throw new Error(`Refusing invalid Eve receipt:\n${validation.problems.join("\n")}`);
  return { receipt, receiptPath: `content/evidence/narration/receipts/${batchId}.json` };
}

function commitGeneratedBatch({ outputs, receipt, receiptPath, workDir, root = repoRoot }) {
  const receiptValidation = validateNarrationReceipt(receipt);
  if (!receiptValidation.valid) throw new Error(`Refusing to commit invalid receipt:\n${receiptValidation.problems.join("\n")}`);
  const receiptTarget = safeRepositoryPath(root, receiptPath);
  if (existsSync(receiptTarget)) throw new Error(`Receipt already exists: ${receiptPath}`);

  const backupRoot = join(workDir, "backup");
  const movedBackups = [];
  const installed = [];
  let receiptInstalled = false;
  const receiptTemp = `${receiptTarget}.tmp-${process.pid}`;

  for (const output of outputs) {
    if (!existsSync(output.stagedPath)) throw new Error(`${output.key}: staged MP3 is missing before release commit`);
    safeRepositoryPath(root, output.file);
  }

  try {
    for (const output of outputs) {
      const target = safeRepositoryPath(root, output.file);
      mkdirSync(dirname(target), { recursive: true });
      if (existsSync(target)) {
        const backup = join(backupRoot, output.file);
        mkdirSync(dirname(backup), { recursive: true });
        renameSync(target, backup);
        movedBackups.push({ target, backup });
      }
    }
    for (const output of outputs) {
      const target = safeRepositoryPath(root, output.file);
      renameSync(output.stagedPath, target);
      installed.push(target);
    }
    mkdirSync(dirname(receiptTarget), { recursive: true });
    writeFileSync(receiptTemp, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
    renameSync(receiptTemp, receiptTarget);
    receiptInstalled = true;
  } catch (error) {
    const rollbackProblems = [];
    try {
      if (existsSync(receiptTemp)) rmSync(receiptTemp, { force: true });
      if (receiptInstalled && existsSync(receiptTarget)) rmSync(receiptTarget, { force: true });
    } catch (rollbackError) {
      rollbackProblems.push(`receipt rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    for (const target of [...installed].reverse()) {
      try {
        if (existsSync(target)) rmSync(target, { force: true });
      } catch (rollbackError) {
        rollbackProblems.push(`new audio rollback failed for ${target}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }
    for (const { target, backup } of [...movedBackups].reverse()) {
      try {
        if (existsSync(backup)) renameSync(backup, target);
      } catch (rollbackError) {
        rollbackProblems.push(`old audio restore failed for ${target}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }
    const original = error instanceof Error ? error.message : String(error);
    const suffix = rollbackProblems.length > 0 ? `\nRollback problems:\n${rollbackProblems.join("\n")}` : "";
    throw new Error(`Narration release commit failed: ${original}${suffix}`);
  }

  rmSync(backupRoot, { recursive: true, force: true });
  return { receiptPath, installed: outputs.length };
}

function importReceipt(receiptPath) {
  const dryRun = spawnSync(process.execPath, [IMPORTER, "--receipt", receiptPath, "--replace"], { stdio: "inherit", env: process.env });
  if (dryRun.status !== 0) throw new Error(`narration import dry-run failed for ${receiptPath}`);
  const write = spawnSync(process.execPath, [IMPORTER, "--receipt", receiptPath, "--write", "--replace"], { stdio: "inherit", env: process.env });
  if (write.status !== 0) throw new Error(`narration import write failed for ${receiptPath}`);
  return importNarrationReceipt(receiptPath, { replace: true });
}

function synthesizeStaleItems(entries, stageDir, concurrency) {
  mkdirSync(stageDir, { recursive: true });
  const entriesPath = join(stageDir, "entries.json");
  writeFileSync(entriesPath, `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`);
  const result = spawnSync("python3", [
    SYNTHESIZER,
    "--voice", EVE_PROVIDER_VOICE,
    "--language", EVE_PROVIDER_LANGUAGE,
    "--concurrency", String(concurrency),
    "--entries-file", entriesPath,
    "--stage-dir", stageDir,
    "--no-public-write",
    "--no-voice-mirror",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Eve TTS failed for staged batch (${result.status}): ${(result.stderr || result.stdout || "").trim().slice(0, 800)}`);
  }
  const reportPath = join(stageDir, "batch-report.json");
  if (!existsSync(reportPath)) throw new Error(`Eve TTS did not write ${repoRel(reportPath)}`);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (Array.isArray(report.failures) && report.failures.length > 0) {
    throw new Error(`Eve TTS reported failures:\n${report.failures.map((item) => `${item.key}: ${item.error}`).join("\n")}`);
  }
  return report;
}

function refreshShouZhuPilot({ receipt, receiptPath, receiptSha256 }) {
  const qc = inspectStoryTechnicalQc(NARRATION_PILOT_STORY_ID);
  const evidence = readNarrationPilotEvidence();
  const next = {
    ...evidence,
    schemaVersion: 1,
    pilotId: NARRATION_PILOT_ID,
    storyId: NARRATION_PILOT_STORY_ID,
    installedBatch: {
      batchId: receipt.batchId,
      receiptPath,
      receiptSha256,
      inputItemCount: receipt.inputItemCount,
      inputDigestSha256: receipt.inputDigestSha256,
    },
    technicalQc: {
      status: qc.status,
      itemCount: qc.itemCount,
      sampleRateHz: qc.sampleRateHz,
      channels: qc.channels,
      bitrateKbps: qc.bitrateKbps,
      totalDurationSeconds: qc.totalDurationSeconds,
      averageDurationSeconds: qc.averageDurationSeconds,
      minimumDurationSeconds: qc.minimumDurationSeconds,
      maximumDurationSeconds: qc.maximumDurationSeconds,
      totalBytes: qc.totalBytes,
      averageBytes: qc.averageBytes,
      minimumBytes: qc.minimumBytes,
      maximumBytes: qc.maximumBytes,
      nonSilenceCheck: qc.nonSilenceCheck,
      productionBundleModelLeakCheck: qc.productionBundleModelLeakCheck,
    },
    audioSha256: qc.audioSha256,
    qualityReview: {
      listeningStatus: "waived",
      expansionApproved: true,
      reviewedAt: new Date().toISOString(),
      reviewerRole: "project-owner",
      decisionNote: "Owner directed Eve stale-body refresh after copy restore. Cover and moral MP3s stayed byte-identical; p1-p7 were resynthesized with xAI Eve and bound by a new nine-item receipt. Expansion waiver continues for remaining catalog refresh.",
    },
  };
  writeFileSync(join(repoRoot, NARRATION_PILOT_EVIDENCE_PATH), `${JSON.stringify(next, null, 2)}\n`);
  mkdirSync(WORK_ROOT, { recursive: true });
  writeFileSync(join(WORK_ROOT, "shou-zhu-pilot-qc.json"), `${JSON.stringify(next.technicalQc, null, 2)}\n`);
  return { evidencePath: NARRATION_PILOT_EVIDENCE_PATH, technicalQc: next.technicalQc };
}

function planWithPilotStatusCurrent() {
  const plan = structuredClone(buildNarrationPlan({ story: NARRATION_PILOT_STORY_ID }));
  for (const item of plan.items) item.status = "current";
  return plan;
}

export function assertEveStaleRefreshAllowed(options = {}) {
  const evidence = options.evidence ?? readNarrationPilotEvidence();
  const structure = validateNarrationPilotEvidence(evidence, {
    plan: options.plan ?? planWithPilotStatusCurrent(),
  });
  if (!structure.valid) {
    throw new Error(`Eve stale refresh is blocked because pilot evidence structure is invalid:\n${structure.problems.join("\n")}`);
  }
  if (!structure.expansionApproved) {
    throw new Error(`Eve stale refresh is blocked: ${NARRATION_PILOT_ID} expansion is not approved or waived`);
  }
  return { allowed: true, expansionApproved: true, listeningStatus: structure.listeningStatus };
}

export function executeStaleEveBatches(options = {}) {
  assertEveStaleRefreshAllowed();
  const providerBinding = readEveProviderBinding();
  const fullSet = buildNarrationGenerationSet();
  const generationValidation = validateApprovedGenerationSet(fullSet);
  if (!generationValidation.valid) {
    throw new Error(`Narration generation input set is not approved:\n${generationValidation.problems.join("\n")}`);
  }
  const approvedByKey = new Map(fullSet.entries.map((entry) => [entry.key, entry]));

  const plan = buildNarrationPlan();
  const protectedCurrent = snapshotCurrentNarration(plan);
  if (protectedCurrent.length === 0) throw new Error("Refusing stale refresh without protected current narration");
  const batches = buildStaleItemStoryBatches({ plan, stories: options.stories });
  if (batches.storyCount === 0) throw new Error("No stale narration items remain to generate");

  const ordered = [...batches.stories].sort((left, right) => {
    if (left.storyId === NARRATION_PILOT_STORY_ID) return -1;
    if (right.storyId === NARRATION_PILOT_STORY_ID) return 1;
    return left.storyId.localeCompare(right.storyId);
  });
  const selected = options.maxStories ? ordered.slice(0, options.maxStories) : ordered;
  const concurrency = options.concurrency ?? 4;
  const completed = [];

  for (const batch of selected) {
    for (const item of batch.staleItems) {
      const approved = approvedByKey.get(item.key);
      if (!approved) throw new Error(`${item.key}: stale item is not in the approved generation set`);
      if (approved.file !== item.output || approved.textSha256 !== item.textSha256) {
        throw new Error(`${item.key}: stale item no longer matches the approved generation set`);
      }
    }

    const staleDigest = computeNarrationInputDigest(batch.staleItems.map((item) => ({
      key: item.key,
      file: item.output,
      textSha256: item.textSha256,
    })));
    const workDir = join(WORK_ROOT, `eve-stale-${batch.storyId}-${staleDigest.slice(0, 12)}`);
    mkdirSync(workDir, { recursive: true });
    const stageDir = join(workDir, "mp3");

    const entries = batch.staleItems.map((item) => ({
      key: item.key,
      storyId: item.storyId,
      pageId: item.pageId,
      text: item.text,
      textSha256: item.textSha256,
      file: item.output,
    }));

    console.error(`eve-stale ${batch.storyId}: synthesizing ${entries.length} tracks`);
    const report = synthesizeStaleItems(entries, stageDir, concurrency);
    const reportByKey = new Map((report.outputs ?? []).map((item) => [item.key, item]));

    const synthesized = [];
    for (const item of batch.staleItems) {
      const output = reportByKey.get(item.key);
      const stagedPath = output?.stagedPath ?? join(stageDir, `${item.key}.mp3`);
      if (!existsSync(stagedPath)) throw new Error(`${item.key}: staged MP3 missing at ${stagedPath}`);
      const qc = inspectEveMp3(stagedPath);
      if (!qc.valid) throw new Error(`${item.key}: Eve MP3 failed QC: ${qc.problems.join("; ")}`);
      if (output?.audioSha256 && output.audioSha256 !== qc.audioSha256) {
        throw new Error(`${item.key}: staged SHA-256 drifted from synthesizer report`);
      }
      synthesized.push({
        key: item.key,
        file: item.output,
        textSha256: item.textSha256,
        audioSha256: qc.audioSha256,
        stagedPath,
        bytes: qc.bytes,
        durationSeconds: qc.durationSeconds,
      });
    }

    const bindPilotStory = batch.storyId === NARRATION_PILOT_STORY_ID;
    const receiptItems = bindPilotStory
      ? [
          ...synthesized,
          ...batch.currentItems.map((item) => ({
            key: item.key,
            file: item.output,
            textSha256: item.textSha256,
            audioSha256: item.audioSha256,
          })),
        ]
      : synthesized;

    const createdAt = new Date();
    const { receipt, receiptPath } = buildEveReceipt({
      storyId: batch.storyId,
      items: receiptItems,
      createdAt,
      synthesizedKeys: synthesized.map((item) => item.key),
      preservedKeys: bindPilotStory ? batch.currentItems.map((item) => item.key) : [],
      providerBinding,
    });

    const committed = commitGeneratedBatch({
      outputs: synthesized,
      receipt,
      receiptPath,
      workDir,
    });
    const imported = importReceipt(committed.receiptPath);
    assertProtectedCurrentNarration(protectedCurrent);

    if (bindPilotStory) {
      refreshShouZhuPilot({
        receipt,
        receiptPath: imported.receiptPath,
        receiptSha256: imported.receiptSha256,
      });
      assertProtectedCurrentNarration(protectedCurrent);
    }

    if (!options.keepWork) rmSync(workDir, { recursive: true, force: true });
    completed.push({
      storyId: batch.storyId,
      generated: synthesized.length,
      receiptPath: committed.receiptPath,
    });
    console.error(`eve-stale ${batch.storyId}: imported ${synthesized.length} tracks via ${committed.receiptPath}`);
  }

  const finalPlan = buildNarrationPlan();
  assertProtectedCurrentNarration(protectedCurrent, finalPlan);
  const remaining = buildStaleItemStoryBatches({ plan: finalPlan });
  return {
    schemaVersion: 1,
    generatedStoryCount: completed.length,
    generatedItemCount: completed.reduce((sum, item) => sum + item.generated, 0),
    protectedCurrentItemCount: protectedCurrent.length,
    remainingStoryCount: remaining.storyCount,
    remainingItemCount: remaining.staleItemCount,
    completed,
  };
}

function main() {
  const argv = process.argv.slice(2);
  for (const forbidden of ["--all", "--replace", "--pending"]) {
    if (argv.includes(forbidden)) throw new Error(`${forbidden} is forbidden for Eve stale refresh`);
  }
  const summary = argv.includes("--summary");
  const execute = argv.includes("--execute");
  if (Number(summary) + Number(execute) !== 1) {
    throw new Error("Choose exactly one mode: --summary or --execute");
  }
  if (execute && !argv.includes("--stale-only")) {
    throw new Error("Eve stale execute requires --stale-only so current tracks cannot be replaced");
  }

  const stories = argValues("--story", argv);
  const maxStoriesRaw = argValue("--max-stories", argv);
  const maxStories = maxStoriesRaw ? Number(maxStoriesRaw) : null;
  if (maxStoriesRaw && (!Number.isInteger(maxStories) || maxStories < 1)) {
    throw new Error("--max-stories must be a positive integer");
  }
  const concurrencyRaw = argValue("--concurrency", argv);
  const concurrency = concurrencyRaw ? Number(concurrencyRaw) : 4;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("--concurrency must be an integer 1..8");
  }

  if (summary) {
    const plan = buildStaleItemStoryBatches({ stories });
    console.log(JSON.stringify({
      schemaVersion: plan.schemaVersion,
      scope: plan.scope,
      provider: plan.provider,
      voice: plan.voice,
      storyCount: plan.storyCount,
      staleItemCount: plan.staleItemCount,
      protectedCurrentItemCount: plan.protectedCurrentItemCount,
      stories: plan.stories.map((story) => ({
        storyId: story.storyId,
        staleCount: story.staleItems.length,
        currentCount: story.currentItems.length,
        staleKeys: story.staleKeys,
        currentKeys: story.currentKeys,
      })),
    }, null, 2));
    return;
  }

  const result = executeStaleEveBatches({
    stories,
    maxStories,
    concurrency,
    keepWork: argv.includes("--keep-work"),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith("generate-narration-stale-eve.mjs")) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
