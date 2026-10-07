#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  CLASSIC_AUDIO_ROOT,
  CLASSIC_BODY_PAGE_IDS,
  CLASSIC_CANONICAL_SOURCE,
  CLASSIC_GENERATION_SET_EVIDENCE_PATH,
  CLASSIC_NARRATION_STATE_PATH,
  CLASSIC_RECEIPT_DIR,
  buildClassicHallGenerationSet,
  buildClassicStoryBatches,
  readClassicNarrationState,
  validateClassicHallReceipt,
} from "./classic-hall-narration.mjs";
import {
  EVE_GENERATOR,
  EVE_PROVIDER_LANGUAGE,
  EVE_PROVIDER_NAME,
  EVE_PROVIDER_PROFILE_ID,
  EVE_PROVIDER_PROFILE_PATH,
  EVE_PROVIDER_VOICE,
  inspectEveMp3,
} from "./generate-narration-stale-eve.mjs";
import {
  assertProtectedCurrentNarration,
  snapshotCurrentNarration,
} from "./generate-narration-pending-stories.mjs";
import { computeNarrationInputDigest } from "./narration-generation-set.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";
import { sha256Buffer } from "./narration-receipt.mjs";
import { repoRoot } from "./story-model.mjs";

export const CLASSIC_EVE_RIGHTS_EVIDENCE = Object.freeze([
  EVE_PROVIDER_PROFILE_PATH,
  CLASSIC_GENERATION_SET_EVIDENCE_PATH,
]);
export const CLASSIC_CHILD_GUARD_WORK_PATH = ".narration-work/classic-eve-child-guard.json";
export const CLASSIC_CHILD_GUARD_EVIDENCE_PATH = "content/evidence/narration/classic-eve-child-audio-guard.json";
export const CLASSIC_EVE_REFRESH_EVIDENCE_PATH = "content/evidence/narration/classic-eve-refresh.json";

const SYNTHESIZER = join(repoRoot, "scripts/generate-narration-grok-batch.py");
const WORK_ROOT = join(repoRoot, ".narration-work");
const CHILD_AUDIO_PREFIX = "public/audio/";

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

function assertClassicAudioPath(file) {
  if (!file.startsWith(`${CLASSIC_AUDIO_ROOT}/`) || file.startsWith(CHILD_AUDIO_PREFIX) || file.includes("public/audio-voices/")) {
    throw new Error(`Refusing non-classic audio path: ${file}`);
  }
  if (!/^public\/audio-classic\/[a-z0-9-]+\/p[1-7]\.mp3$/.test(file)) {
    throw new Error(`Classic Eve output must be p1-p7 under public/audio-classic: ${file}`);
  }
}

function readEveProviderBinding() {
  const bytes = readFileSync(join(repoRoot, EVE_PROVIDER_PROFILE_PATH));
  const profile = JSON.parse(bytes.toString("utf8"));
  if (profile.profileId !== EVE_PROVIDER_PROFILE_ID) {
    throw new Error(`Eve provider profile id drifted: ${profile.profileId}`);
  }
  if (profile.status !== "approved") throw new Error("Eve provider profile is not approved");
  if (profile.voice?.id !== EVE_PROVIDER_VOICE) throw new Error("Eve provider voice drifted");
  return { path: EVE_PROVIDER_PROFILE_PATH, sha256: sha256Buffer(bytes), profile };
}

export function snapshotChildCurrentNarration(plan = buildNarrationPlan()) {
  const snapshot = snapshotCurrentNarration(plan);
  if (snapshot.length !== 900) {
    throw new Error(`Refusing classic Eve refresh unless children's narration is 900 current, found ${snapshot.length}`);
  }
  if (plan.items.some((item) => item.status !== "current")) {
    throw new Error("Refusing classic Eve refresh while children's narration is not fully current");
  }
  return snapshot;
}

export function writeChildAudioGuard(snapshot, path = CLASSIC_CHILD_GUARD_WORK_PATH) {
  const payload = {
    schemaVersion: 1,
    evidenceType: "classic-eve-child-audio-guard",
    capturedAt: new Date().toISOString(),
    canonicalSource: "content/published-stories.json",
    audioRoot: "public/audio",
    protectedItemCount: snapshot.length,
    items: snapshot,
  };
  const absolute = safeRepositoryPath(repoRoot, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export function assertChildAudioUnchanged(snapshot, plan = buildNarrationPlan()) {
  assertProtectedCurrentNarration(snapshot, plan);
  if (plan.items.length !== 900 || snapshot.length !== 900) {
    throw new Error("Children's narration count drifted during classic Eve refresh");
  }
  return true;
}

function assertCredentialsPresent() {
  if (process.env.XAI_API_KEY && process.env.XAI_API_KEY.trim()) return { source: "XAI_API_KEY" };
  const authPath = join(process.env.HOME ?? "", ".grok/auth.json");
  if (existsSync(authPath)) {
    const auth = JSON.parse(readFileSync(authPath, "utf8"));
    const entry = auth[Object.keys(auth)[0]];
    if (entry?.refresh_token && entry?.oidc_client_id) return { source: "grok-oauth-refresh" };
  }
  throw new Error("Missing XAI_API_KEY and ~/.grok/auth.json OAuth credentials; stopping classic Eve refresh");
}

function synthesizeClassicItems(entries, stageDir, concurrency) {
  mkdirSync(stageDir, { recursive: true });
  for (const entry of entries) {
    assertClassicAudioPath(entry.file);
    if (!CLASSIC_BODY_PAGE_IDS.includes(entry.pageId)) throw new Error(`${entry.key}: not a classic body page`);
  }
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
    throw new Error(`Eve TTS failed for classic staged batch (${result.status}): ${(result.stderr || result.stdout || "").trim().slice(0, 800)}`);
  }
  const reportPath = join(stageDir, "batch-report.json");
  if (!existsSync(reportPath)) throw new Error(`Eve TTS did not write ${repoRel(reportPath)}`);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (report.publicWrite === true) throw new Error("Classic Eve synthesizer must not write public/audio");
  if (report.voiceMirror === true) throw new Error("Classic Eve synthesizer must not mirror audio-voices");
  if (Array.isArray(report.failures) && report.failures.length > 0) {
    throw new Error(`Eve TTS reported failures:\n${report.failures.map((item) => `${item.key}: ${item.error}`).join("\n")}`);
  }
  return report;
}

function buildClassicReceipt({ storyId, items, createdAt, providerBinding }) {
  const sorted = [...items].sort((left, right) => left.pageId.localeCompare(right.pageId));
  if (sorted.map((item) => item.pageId).join(",") !== CLASSIC_BODY_PAGE_IDS.join(",")) {
    throw new Error(`${storyId}: receipt items must be complete p1-p7`);
  }
  const inputDigestSha256 = computeNarrationInputDigest(sorted);
  const stamp = createdAt.toISOString().replace(/[-:.]/g, "").toLowerCase();
  const batchId = `eve-classic-${stamp}-${storyId}-${inputDigestSha256.slice(0, 12)}`;
  if (batchId.length > 80) throw new Error(`batchId exceeds 80 characters: ${batchId}`);
  const receipt = {
    schemaVersion: 1,
    batchId,
    canonicalSource: CLASSIC_CANONICAL_SOURCE,
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
      evidence: [...CLASSIC_EVE_RIGHTS_EVIDENCE],
    },
    execution: {
      api: {
        endpoint: "https://api.x.ai/v1/tts",
        voiceId: EVE_PROVIDER_VOICE,
        language: EVE_PROVIDER_LANGUAGE,
      },
      scope: { type: "classic-hall-body", storyId, pages: [...CLASSIC_BODY_PAGE_IDS] },
      synthesizedKeys: sorted.map((item) => item.key),
      publicAudioWrite: false,
      childNarrationStateUpdated: false,
    },
    items: sorted.map((item) => ({
      key: item.key,
      file: item.file,
      textSha256: item.textSha256,
      audioSha256: item.audioSha256,
    })),
  };
  const validation = validateClassicHallReceipt(receipt);
  if (!validation.valid) throw new Error(`Refusing invalid classic Eve receipt:\n${validation.problems.join("\n")}`);
  return { receipt, receiptPath: `${CLASSIC_RECEIPT_DIR}/${batchId}.json` };
}

function commitClassicBatch({ outputs, receipt, receiptPath, workDir, root = repoRoot }) {
  const validation = validateClassicHallReceipt(receipt);
  if (!validation.valid) throw new Error(`Refusing to commit invalid classic receipt:\n${validation.problems.join("\n")}`);
  if (outputs.length !== 7) throw new Error("Classic Eve commit requires a complete p1-p7 story");
  const receiptTarget = safeRepositoryPath(root, receiptPath);
  if (existsSync(receiptTarget)) throw new Error(`Classic receipt already exists: ${receiptPath}`);

  const backupRoot = join(workDir, "backup");
  const movedBackups = [];
  const installed = [];
  let receiptInstalled = false;
  const receiptTemp = `${receiptTarget}.tmp-${process.pid}`;

  for (const output of outputs) {
    assertClassicAudioPath(output.file);
    if (!existsSync(output.stagedPath)) throw new Error(`${output.key}: staged MP3 is missing before classic commit`);
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
    throw new Error(`Classic narration commit failed: ${original}${suffix}`);
  }

  rmSync(backupRoot, { recursive: true, force: true });
  return { receiptPath, installed: outputs.length };
}

function writeClassicStateFromReceipt({ receipt, receiptPath, receiptSha256, root = repoRoot }) {
  const state = readClassicNarrationState({ root });
  const nextEntries = { ...state.entries };
  for (const item of receipt.items) {
    nextEntries[item.key] = {
      provider: receipt.provider.name,
      voice: receipt.provider.voice,
      language: receipt.provider.language,
      generator: receipt.provider.generator,
      providerProfileId: receipt.provider.profile.id,
      providerProfilePath: receipt.provider.profile.evidence,
      providerProfileSha256: receipt.provider.profile.sha256,
      textSha256: item.textSha256,
      audioSha256: item.audioSha256,
      generatedAt: receipt.createdAt,
      batchId: receipt.batchId,
      inputItemCount: receipt.inputItemCount,
      inputDigestSha256: receipt.inputDigestSha256,
      receiptPath,
      receiptSha256,
      rightsClaim: receipt.rights.claim,
      rightsEvidence: [...receipt.rights.evidence],
    };
  }
  const sortedEntries = Object.fromEntries(Object.entries(nextEntries).sort(([left], [right]) => left.localeCompare(right)));
  const next = { schemaVersion: 1, canonicalSource: CLASSIC_CANONICAL_SOURCE, entries: sortedEntries };
  const target = join(root, CLASSIC_NARRATION_STATE_PATH);
  const temp = `${target}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(temp, target);
  return next;
}

function currentStoryEvidence(batches) {
  return batches.current.map((story) => ({
    storyId: story.storyId,
    generated: story.items.length,
    receiptPath: story.items[0]?.provenance?.receiptPath ?? null,
  }));
}

function writeRefreshEvidence({ childGuard, completed, remaining, generationSet }) {
  const installed = currentStoryEvidence(remaining);
  const payload = {
    schemaVersion: 1,
    evidenceType: "classic-eve-refresh",
    canonicalSource: CLASSIC_CANONICAL_SOURCE,
    audioRoot: CLASSIC_AUDIO_ROOT,
    provider: EVE_PROVIDER_NAME,
    voice: EVE_PROVIDER_VOICE,
    pages: [...CLASSIC_BODY_PAGE_IDS],
    inputItemCount: generationSet.count,
    inputDigestSha256: generationSet.inputDigestSha256,
    generatedStoryCount: installed.length,
    generatedItemCount: remaining.currentItemCount,
    thisRunStoryCount: completed.length,
    thisRunItemCount: completed.reduce((sum, item) => sum + item.generated, 0),
    remainingStoryCount: remaining.pendingStoryCount,
    remainingItemCount: remaining.pendingItemCount,
    childProtectedItemCount: childGuard.protectedItemCount,
    childAudioUnchanged: true,
    childNarrationStateUpdated: false,
    publicAudioWrite: false,
    completed: installed,
    thisRun: completed,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(repoRoot, CLASSIC_EVE_REFRESH_EVIDENCE_PATH), `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(join(repoRoot, CLASSIC_CHILD_GUARD_EVIDENCE_PATH), `${JSON.stringify({
    schemaVersion: 1,
    evidenceType: "classic-eve-child-audio-guard",
    capturedAt: childGuard.capturedAt,
    canonicalSource: "content/published-stories.json",
    audioRoot: "public/audio",
    protectedItemCount: childGuard.protectedItemCount,
    note: "Children's public/audio SHA-256 pins taken before classic Eve refresh; classic generation must not change these bytes or content/narration-state.json.",
    items: childGuard.items,
  }, null, 2)}\n`);
  return payload;
}

export function executeClassicEveBatches(options = {}) {
  const credentials = assertCredentialsPresent();
  const providerBinding = readEveProviderBinding();
  const childPlan = buildNarrationPlan();
  const childGuardItems = snapshotChildCurrentNarration(childPlan);
  const childGuard = writeChildAudioGuard(childGuardItems);
  const generationSet = buildClassicHallGenerationSet();
  if (generationSet.count !== 700) {
    throw new Error(`Classic Eve generation set must be 100 stories × p1-p7, found ${generationSet.count}`);
  }
  const approvedByKey = new Map(generationSet.entries.map((entry) => [entry.key, entry]));
  const batches = buildClassicStoryBatches({ stories: options.stories });
  if (batches.pendingStoryCount === 0) {
    writeRefreshEvidence({ childGuard, completed: [], remaining: batches, generationSet });
    return {
      schemaVersion: 1,
      generatedStoryCount: 0,
      generatedItemCount: 0,
      remainingStoryCount: 0,
      remainingItemCount: 0,
      protectedChildItemCount: childGuard.protectedItemCount,
      authSource: credentials.source,
      completed: [],
    };
  }

  const selected = options.maxStories ? batches.pending.slice(0, options.maxStories) : batches.pending;
  const concurrency = options.concurrency ?? 4;
  const completed = [];

  for (const batch of selected) {
    for (const item of batch.items) {
      const approved = approvedByKey.get(item.key);
      if (!approved) throw new Error(`${item.key}: classic item is not in the generation set`);
      if (approved.file !== item.output || approved.textSha256 !== item.textSha256 || approved.text !== item.text) {
        throw new Error(`${item.key}: classic item no longer matches the generation set`);
      }
      assertClassicAudioPath(item.output);
    }

    const digest = computeNarrationInputDigest(batch.items);
    const workDir = join(WORK_ROOT, `eve-classic-${batch.storyId}-${digest.slice(0, 12)}`);
    mkdirSync(workDir, { recursive: true });
    const stageDir = join(workDir, "mp3");
    const entries = batch.items.map((item) => ({
      key: item.key,
      storyId: item.storyId,
      pageId: item.pageId,
      text: item.text,
      textSha256: item.textSha256,
      file: item.output,
    }));

    console.error(`eve-classic ${batch.storyId}: synthesizing ${entries.length} tracks (${credentials.source})`);
    let report;
    try {
      report = synthesizeClassicItems(entries, stageDir, concurrency);
    } catch (error) {
      writeRefreshEvidence({
        childGuard,
        completed,
        remaining: buildClassicStoryBatches(),
        generationSet,
      });
      throw error;
    }
    const reportByKey = new Map((report.outputs ?? []).map((item) => [item.key, item]));
    const synthesized = [];
    try {
      for (const item of batch.items) {
        const output = reportByKey.get(item.key);
        const stagedPath = output?.stagedPath ?? join(stageDir, `${item.key}.mp3`);
        if (!existsSync(stagedPath)) throw new Error(`${item.key}: staged MP3 missing at ${stagedPath}`);
        const qc = inspectEveMp3(stagedPath);
        if (!qc.valid) throw new Error(`${item.key}: Eve MP3 failed QC: ${qc.problems.join("; ")}`);
        if (qc.durationSeconds != null && (qc.durationSeconds < 0.8 || qc.durationSeconds > 30)) {
          throw new Error(`${item.key}: duration ${qc.durationSeconds}s is outside 0.8-30s`);
        }
        if (output?.audioSha256 && output.audioSha256 !== qc.audioSha256) {
          throw new Error(`${item.key}: staged SHA-256 drifted from synthesizer report`);
        }
        synthesized.push({
          key: item.key,
          pageId: item.pageId,
          file: item.output,
          textSha256: item.textSha256,
          audioSha256: qc.audioSha256,
          stagedPath,
          bytes: qc.bytes,
          durationSeconds: qc.durationSeconds,
        });
      }
    } catch (error) {
      writeRefreshEvidence({
        childGuard,
        completed,
        remaining: buildClassicStoryBatches(),
        generationSet,
      });
      throw error;
    }

    if (synthesized.length !== 7) {
      throw new Error(`${batch.storyId}: refusing partial classic story (${synthesized.length}/7)`);
    }

    const createdAt = new Date();
    const { receipt, receiptPath } = buildClassicReceipt({
      storyId: batch.storyId,
      items: synthesized,
      createdAt,
      providerBinding,
    });
    const committed = commitClassicBatch({
      outputs: synthesized,
      receipt,
      receiptPath,
      workDir,
    });
    const receiptBytes = readFileSync(join(repoRoot, committed.receiptPath));
    writeClassicStateFromReceipt({
      receipt,
      receiptPath: committed.receiptPath,
      receiptSha256: sha256Buffer(receiptBytes),
    });
    assertChildAudioUnchanged(childGuardItems);
    if (!options.keepWork) rmSync(workDir, { recursive: true, force: true });
    completed.push({
      storyId: batch.storyId,
      generated: synthesized.length,
      receiptPath: committed.receiptPath,
      durations: Object.fromEntries(synthesized.map((item) => [item.pageId, item.durationSeconds])),
    });
    console.error(`eve-classic ${batch.storyId}: installed ${synthesized.length} tracks via ${committed.receiptPath}`);
  }

  assertChildAudioUnchanged(childGuardItems);
  const remaining = buildClassicStoryBatches();
  writeRefreshEvidence({ childGuard, completed, remaining, generationSet });
  return {
    schemaVersion: 1,
    generatedStoryCount: completed.length,
    generatedItemCount: completed.reduce((sum, item) => sum + item.generated, 0),
    remainingStoryCount: remaining.pendingStoryCount,
    remainingItemCount: remaining.pendingItemCount,
    protectedChildItemCount: childGuard.protectedItemCount,
    authSource: credentials.source,
    completed,
  };
}

function main() {
  const argv = process.argv.slice(2);
  for (const forbidden of ["--all", "--replace", "--pending"]) {
    if (argv.includes(forbidden)) throw new Error(`${forbidden} is forbidden for classic Eve refresh`);
  }
  const summary = argv.includes("--summary");
  const execute = argv.includes("--execute");
  if (Number(summary) + Number(execute) !== 1) {
    throw new Error("Choose exactly one mode: --summary or --execute");
  }
  if (execute && !argv.includes("--classic-only")) {
    throw new Error("Classic Eve execute requires --classic-only so children's public/audio cannot be replaced");
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
    const child = snapshotChildCurrentNarration();
    const set = buildClassicHallGenerationSet();
    const batches = buildClassicStoryBatches({ stories });
    console.log(JSON.stringify({
      schemaVersion: 1,
      scope: batches.scope,
      provider: EVE_PROVIDER_NAME,
      voice: EVE_PROVIDER_VOICE,
      canonicalSource: CLASSIC_CANONICAL_SOURCE,
      audioRoot: CLASSIC_AUDIO_ROOT,
      pages: [...CLASSIC_BODY_PAGE_IDS],
      generationCount: set.count,
      inputDigestSha256: set.inputDigestSha256,
      pendingStoryCount: batches.pendingStoryCount,
      pendingItemCount: batches.pendingItemCount,
      currentStoryCount: batches.currentStoryCount,
      currentItemCount: batches.currentItemCount,
      protectedChildItemCount: child.length,
      stories: batches.pending.map((story) => ({
        storyId: story.storyId,
        keys: story.keys,
        statuses: story.statuses,
      })),
    }, null, 2));
    return;
  }

  const result = executeClassicEveBatches({
    stories,
    maxStories,
    concurrency,
    keepWork: argv.includes("--keep-work"),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith("generate-narration-classic-eve.mjs")) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
