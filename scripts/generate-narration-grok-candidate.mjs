#!/usr/bin/env node
/**
 * Listen-only Grok / xAI cloud TTS candidate.
 *
 * Does NOT touch APPROVED Kokoro contracts, receipts, or narration-state.
 * Auth: XAI_API_KEY, or refreshed OAuth token from ~/.grok/auth.json.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { homedir } from "node:os";
import { buildNarrationGenerationSet } from "./narration-generation-set.mjs";
import { validateApprovedGenerationSet } from "./kokoro-generation-contract.mjs";
import { repoRoot } from "./story-model.mjs";

const TTS_URL = "https://api.x.ai/v1/tts";
const VOICES_URL = "https://api.x.ai/v1/tts/voices";
const OAUTH_TOKEN_URL = "https://auth.x.ai/oauth2/token";
const DEFAULT_VOICE = "ara";
const DEFAULT_LANGUAGE = "zh";
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

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function refreshGrokAuth() {
  const authPath = join(homedir(), ".grok/auth.json");
  if (!existsSync(authPath)) return null;
  const auth = JSON.parse(readFileSync(authPath, "utf8"));
  const key = Object.keys(auth)[0];
  const entry = auth[key];
  if (!entry?.refresh_token || !entry?.oidc_client_id) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: entry.refresh_token,
    client_id: entry.oidc_client_id,
  });
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Grok OAuth refresh failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  const payload = await response.json();
  const access = payload.access_token;
  if (typeof access !== "string" || !access) throw new Error("OAuth refresh returned no access_token");
  entry.key = access;
  if (typeof payload.refresh_token === "string" && payload.refresh_token) entry.refresh_token = payload.refresh_token;
  const expiresIn = Number(payload.expires_in) || 3600;
  entry.expires_at = new Date(Date.now() + expiresIn * 1000).toISOString();
  auth[key] = entry;
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
  return { token: access, source: "grok-oauth-refresh" };
}

async function resolveAuth() {
  if (process.env.XAI_API_KEY) {
    return { token: process.env.XAI_API_KEY, source: "XAI_API_KEY" };
  }
  const refreshed = await refreshGrokAuth();
  if (refreshed) return refreshed;
  throw new Error("No XAI_API_KEY and no usable ~/.grok/auth.json refresh token");
}

async function synthesizeMp3(token, { text, voiceId, language }) {
  const response = await fetch(TTS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      language,
    }),
  });
  if (!response.ok) {
    throw new Error(`TTS failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1000 || buffer[0] !== 0xff) {
    throw new Error(`TTS returned unexpected audio (${buffer.length} bytes)`);
  }
  return buffer;
}

async function main() {
  const story = requiredArg("--story");
  const voiceId = argValue("--voice") ?? DEFAULT_VOICE;
  const language = argValue("--language") ?? DEFAULT_LANGUAGE;
  const dryRun = process.argv.includes("--dry-run");
  const noOverlay = process.argv.includes("--no-overlay");

  const generationSet = buildNarrationGenerationSet({ story });
  const generationValidation = validateApprovedGenerationSet(generationSet);
  if (!generationValidation.valid) {
    throw new Error(`Narration generation input set is not approved:\n${generationValidation.problems.join("\n")}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const workDir = join(WORK_ROOT, `candidate-grok-tts-${voiceId}-${story}-${stamp}`);
  const summary = {
    schemaVersion: 1,
    mode: dryRun ? "dry-run" : "candidate-listen",
    warning: "Listen-only Grok cloud TTS. Does not promote provider, write receipts, or update narration-state.",
    story,
    provider: "xai-grok-tts",
    voiceId,
    language,
    inputItemCount: generationSet.count,
    inputDigestSha256: generationSet.inputDigestSha256,
    workDir: relative(repoRoot, workDir).replaceAll("\\", "/"),
    overlayPublicAudio: !noOverlay,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (dryRun) return;

  const auth = await resolveAuth();
  const voicesProbe = await fetch(VOICES_URL, { headers: { authorization: `Bearer ${auth.token}` } });
  if (!voicesProbe.ok) {
    throw new Error(`Unable to list TTS voices (${voicesProbe.status}): ${(await voicesProbe.text()).slice(0, 300)}`);
  }
  const voicesPayload = await voicesProbe.json();
  const voices = Array.isArray(voicesPayload?.voices) ? voicesPayload.voices : [];
  if (!voices.some((voice) => voice?.voice_id === voiceId)) {
    throw new Error(`Voice ${voiceId} is not in the current TTS voice catalog`);
  }

  mkdirSync(workDir, { recursive: true });
  const mp3Root = join(workDir, "mp3");
  const backupRoot = join(workDir, "backup-public");
  const outputs = [];

  for (const entry of generationSet.entries) {
    const audio = await synthesizeMp3(auth.token, {
      text: entry.text,
      voiceId,
      language,
    });
    const stagedPath = join(mp3Root, `${entry.key}.mp3`);
    mkdirSync(dirname(stagedPath), { recursive: true });
    writeFileSync(stagedPath, audio, { flag: "wx" });
    outputs.push({
      key: entry.key,
      file: entry.file,
      textSha256: entry.textSha256,
      stagedPath,
      bytes: audio.length,
      audioSha256: sha256(audio),
    });
    console.error(`synthesized ${entry.key} (${audio.length} bytes)`);
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
    approvedKokoroUnchanged: true,
    authSource: auth.source,
    story,
    provider: "xai-grok-tts",
    voiceId,
    language,
    endpoint: TTS_URL,
    inputItemCount: generationSet.count,
    inputDigestSha256: generationSet.inputDigestSha256,
    workDir: relative(repoRoot, workDir).replaceAll("\\", "/"),
    listen: {
      storyPath: `/story/${story}`,
      note: "Hard-refresh the local reader. This overlays public/audio only.",
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
