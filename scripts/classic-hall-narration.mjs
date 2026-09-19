#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { computeNarrationInputDigest } from "./narration-generation-set.mjs";
import { evaluateNarrationStatus } from "./narration-plan.mjs";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

export const CLASSIC_HALL_SECTIONS_PATH = "content/classic-hall-sections.json";
export const CLASSIC_NARRATION_STATE_PATH = "content/classic-narration-state.json";
export const CLASSIC_RECEIPT_DIR = "content/evidence/narration/classic-receipts";
export const CLASSIC_GENERATION_SET_EVIDENCE_PATH = "content/evidence/narration/classic-eve-generation-set.json";
export const CLASSIC_BODY_PAGE_IDS = Object.freeze(["p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
export const CLASSIC_AUDIO_ROOT = "public/audio-classic";
export const CLASSIC_CANONICAL_SOURCE = CLASSIC_HALL_SECTIONS_PATH;

function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function classicAudioFile(storyId, pageId) {
  return `${CLASSIC_AUDIO_ROOT}/${storyId}/${pageId}.mp3`;
}

export function loadClassicHallSections(options = {}) {
  const root = options.root ?? repoRoot;
  const sourcePath = join(root, CLASSIC_HALL_SECTIONS_PATH);
  const parsed = JSON.parse(readFileSync(sourcePath, "utf8"));
  if (parsed?.schemaVersion !== 1 || !parsed.stories || typeof parsed.stories !== "object" || Array.isArray(parsed.stories)) {
    throw new Error("content/classic-hall-sections.json must use schemaVersion 1 with a stories object");
  }

  const published = loadStoryModel({ root });
  const publishedIds = published.stories.map((story) => story.id);
  const classicIds = Object.keys(parsed.stories);
  if (classicIds.length !== publishedIds.length) {
    throw new Error(`classic-hall sections must cover ${publishedIds.length} published stories, found ${classicIds.length}`);
  }
  const publishedSet = new Set(publishedIds);
  const missing = classicIds.filter((id) => !publishedSet.has(id)).sort();
  const unpublished = publishedIds.filter((id) => !parsed.stories[id]);
  if (missing.length > 0 || unpublished.length > 0) {
    throw new Error(`classic-hall section ids drifted: extra=${missing.join(",") || "none"} missing=${unpublished.join(",") || "none"}`);
  }

  const stories = [];
  for (const id of [...classicIds].sort((left, right) => left.localeCompare(right))) {
    const entry = parsed.stories[id];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${id}: classic-hall entry must be an object`);
    }
    if (!Array.isArray(entry.sections) || entry.sections.length !== 7 || entry.sections.some((text) => !nonEmpty(text))) {
      throw new Error(`${id}: classic-hall sections must contain exactly seven non-empty pages`);
    }
    stories.push({
      id,
      title: nonEmpty(entry.title) ? entry.title : published.stories.find((story) => story.id === id)?.title ?? id,
      sections: entry.sections.map((text) => text.trim()),
    });
  }

  return {
    schemaVersion: 1,
    canonicalSource: CLASSIC_CANONICAL_SOURCE,
    stories,
  };
}

export function readClassicNarrationState(options = {}) {
  const root = options.root ?? repoRoot;
  const path = join(root, CLASSIC_NARRATION_STATE_PATH);
  if (!existsSync(path)) return { schemaVersion: 1, entries: {} };
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (
    parsed?.schemaVersion !== 1 ||
    typeof parsed.entries !== "object" ||
    parsed.entries == null ||
    Array.isArray(parsed.entries)
  ) {
    throw new Error("content/classic-narration-state.json must use schemaVersion 1 with an entries object");
  }
  return parsed;
}

export function buildClassicHallNarrationPlan(options = {}) {
  const root = options.root ?? repoRoot;
  const classic = options.classic ?? loadClassicHallSections({ root });
  const state = options.state ?? readClassicNarrationState({ root });
  const storyFilter = options.story ?? null;
  const items = [];

  for (const story of classic.stories) {
    if (storyFilter && story.id !== storyFilter) continue;
    for (const [index, text] of story.sections.entries()) {
      const pageId = CLASSIC_BODY_PAGE_IDS[index];
      const key = `${story.id}/${pageId}`;
      const output = classicAudioFile(story.id, pageId);
      const outputPath = join(root, output);
      const textSha256 = sha256Text(text);
      const entry = state.entries[key] ?? null;
      const exists = existsSync(outputPath);
      const audioSha256 = exists ? sha256File(outputPath) : null;
      const status = evaluateNarrationStatus({ exists, textSha256, audioSha256, entry });
      items.push({
        key,
        storyId: story.id,
        storyTitle: story.title,
        pageId,
        kind: "story",
        text,
        textSha256,
        output,
        audioSha256,
        status,
        provenance: entry,
      });
    }
  }

  if (storyFilter && items.length === 0) throw new Error(`Unknown classic-hall story id: ${storyFilter}`);
  return {
    schemaVersion: 1,
    canonicalSource: CLASSIC_CANONICAL_SOURCE,
    items,
  };
}

export function buildClassicHallGenerationSet(options = {}) {
  const story = options.story ?? null;
  const plan = options.plan ?? buildClassicHallNarrationPlan({ story, root: options.root, classic: options.classic, state: options.state });
  const entries = plan.items
    .map((item) => ({
      key: item.key,
      storyId: item.storyId,
      pageId: item.pageId,
      kind: item.kind,
      text: item.text,
      textSha256: item.textSha256,
      file: item.output,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));

  if (entries.some((entry) => !CLASSIC_BODY_PAGE_IDS.includes(entry.pageId))) {
    throw new Error("classic-hall generation set may only include p1-p7");
  }
  if (entries.some((entry) => !entry.file.startsWith(`${CLASSIC_AUDIO_ROOT}/`))) {
    throw new Error("classic-hall generation set may only target public/audio-classic");
  }

  return {
    schemaVersion: 1,
    canonicalSource: CLASSIC_CANONICAL_SOURCE,
    scope: story ? { type: "story", storyId: story } : { type: "all-classic-body" },
    count: entries.length,
    inputDigestSha256: computeNarrationInputDigest(entries),
    entries,
  };
}

export function buildClassicStoryBatches(options = {}) {
  const plan = options.plan ?? buildClassicHallNarrationPlan({
    story: options.stories?.length === 1 ? options.stories[0] : undefined,
    root: options.root,
  });
  const storyFilter = options.stories?.length ? new Set(options.stories) : null;
  const byStory = new Map();
  for (const item of plan.items) {
    if (storyFilter && !storyFilter.has(item.storyId)) continue;
    const bucket = byStory.get(item.storyId) ?? [];
    bucket.push(item);
    byStory.set(item.storyId, bucket);
  }

  const pending = [];
  const current = [];
  const problems = [];
  for (const [storyId, items] of [...byStory.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const sorted = [...items].sort((left, right) => left.pageId.localeCompare(right.pageId));
    if (sorted.length !== 7) {
      problems.push(`${storyId}: expected exactly 7 classic body pages, found ${sorted.length}`);
      continue;
    }
    const pageIds = sorted.map((item) => item.pageId);
    if (pageIds.join(",") !== CLASSIC_BODY_PAGE_IDS.join(",")) {
      problems.push(`${storyId}: classic body pages drifted: ${pageIds.join(",")}`);
      continue;
    }
    const statuses = new Set(sorted.map((item) => item.status));
    const unknown = [...statuses].filter((status) => !["current", "stale", "missing", "unverified"].includes(status));
    if (unknown.length > 0) {
      problems.push(`${storyId}: unsupported classic narration statuses: ${unknown.sort().join(", ")}`);
      continue;
    }
    if (statuses.size === 1 && statuses.has("current")) {
      current.push({ storyId, items: sorted, keys: sorted.map((item) => item.key) });
      continue;
    }
    pending.push({
      storyId,
      items: sorted,
      keys: sorted.map((item) => item.key),
      statuses: [...statuses].sort(),
    });
  }

  if (problems.length > 0) throw new Error(`Classic Eve narration plan is unsafe:\n${problems.sort().join("\n")}`);

  return {
    schemaVersion: 1,
    scope: "classic-hall-body-p1-p7",
    canonicalSource: CLASSIC_CANONICAL_SOURCE,
    audioRoot: CLASSIC_AUDIO_ROOT,
    storyCount: byStory.size,
    pendingStoryCount: pending.length,
    pendingItemCount: pending.reduce((sum, story) => sum + story.items.length, 0),
    currentStoryCount: current.length,
    currentItemCount: current.reduce((sum, story) => sum + story.items.length, 0),
    pending,
    current,
  };
}

export function validateClassicHallReceipt(receipt) {
  const problems = [];
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    return { valid: false, problems: ["receipt must be an object"] };
  }
  if (receipt.schemaVersion !== 1) problems.push("receipt schemaVersion must be 1");
  if (!nonEmpty(receipt.batchId) || !/^[a-z0-9][a-z0-9._-]{2,79}$/i.test(receipt.batchId)) {
    problems.push("batchId must be a stable 3-80 character identifier");
  }
  if (receipt.canonicalSource !== CLASSIC_CANONICAL_SOURCE) {
    problems.push(`canonicalSource must be ${CLASSIC_CANONICAL_SOURCE}`);
  }
  if (!nonEmpty(receipt.createdAt) || Number.isNaN(Date.parse(receipt.createdAt))) {
    problems.push("createdAt must be an ISO-compatible timestamp");
  }
  if (!Number.isInteger(receipt.inputItemCount) || receipt.inputItemCount !== 7) {
    problems.push("classic receipt inputItemCount must be 7 (p1-p7)");
  }
  if (!isSha256(receipt.inputDigestSha256)) problems.push("inputDigestSha256 must be lowercase SHA-256");

  const provider = receipt.provider;
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
    problems.push("provider must be an object");
  } else {
    if (provider.name !== "xai-grok-tts") problems.push("provider.name must be xai-grok-tts");
    if (provider.voice !== "eve") problems.push("provider.voice must be eve");
    if (provider.language !== "zh") problems.push("provider.language must be zh");
    if (provider.generator !== "xai-grok-tts-batch-v1") problems.push("provider.generator must be xai-grok-tts-batch-v1");
    if (provider.profile?.id !== "xai-grok-tts-eve-v1") problems.push("provider.profile.id must be xai-grok-tts-eve-v1");
  }

  if (receipt.rights?.claim !== "permission") problems.push("rights.claim must be permission");
  if (!Array.isArray(receipt.rights?.evidence) || receipt.rights.evidence.length === 0) {
    problems.push("rights.evidence must contain at least one reference");
  }

  if (!Array.isArray(receipt.items) || receipt.items.length !== 7) {
    problems.push("classic receipt must contain exactly 7 items");
  } else {
    const keys = new Set();
    const files = new Set();
    const pageIds = [];
    for (const [index, item] of receipt.items.entries()) {
      const prefix = `items[${index}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        problems.push(`${prefix} must be an object`);
        continue;
      }
      if (!nonEmpty(item.key) || !/^[a-z0-9-]+\/p[1-7]$/.test(item.key)) {
        problems.push(`${prefix}.key must be a classic body page`);
      } else if (keys.has(item.key)) {
        problems.push(`${prefix}.key duplicates ${item.key}`);
      } else {
        keys.add(item.key);
        pageIds.push(item.key.split("/")[1]);
      }
      if (!nonEmpty(item.file) || !/^public\/audio-classic\/[a-z0-9-]+\/p[1-7]\.mp3$/.test(item.file)) {
        problems.push(`${prefix}.file must be a public/audio-classic p1-p7 MP3`);
      } else if (item.file.startsWith("public/audio/")) {
        problems.push(`${prefix}.file must not write children's public/audio`);
      } else if (files.has(item.file)) {
        problems.push(`${prefix}.file duplicates ${item.file}`);
      } else {
        files.add(item.file);
      }
      if (!isSha256(item.textSha256)) problems.push(`${prefix}.textSha256 must be lowercase SHA-256`);
      if (!isSha256(item.audioSha256)) problems.push(`${prefix}.audioSha256 must be lowercase SHA-256`);
    }
    if (pageIds.join(",") !== CLASSIC_BODY_PAGE_IDS.join(",")) {
      problems.push("classic receipt items must be p1-p7 in order");
    }
    if (receipt.inputItemCount === receipt.items.length) {
      const digest = computeNarrationInputDigest(receipt.items);
      if (receipt.inputDigestSha256 !== digest) problems.push("inputDigestSha256 does not match classic receipt items");
    }
  }

  return { valid: problems.length === 0, problems: [...new Set(problems)].sort() };
}

function argValue(name, argv = process.argv.slice(2)) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

if (process.argv[1]?.endsWith("classic-hall-narration.mjs")) {
  const story = argValue("--story");
  const plan = buildClassicHallNarrationPlan({ story });
  const counts = Object.fromEntries(
    ["current", "stale", "unverified", "missing"].map((status) => [
      status,
      plan.items.filter((item) => item.status === status).length,
    ]),
  );
  const batches = buildClassicStoryBatches({ plan, stories: story ? [story] : undefined });
  if (process.argv.includes("--summary")) {
    console.log(JSON.stringify({
      schemaVersion: plan.schemaVersion,
      canonicalSource: plan.canonicalSource,
      audioRoot: CLASSIC_AUDIO_ROOT,
      total: plan.items.length,
      counts,
      pendingStoryCount: batches.pendingStoryCount,
      currentStoryCount: batches.currentStoryCount,
    }, null, 2));
  } else {
    console.log(JSON.stringify({ ...plan, counts, batches: { pendingStoryCount: batches.pendingStoryCount, currentStoryCount: batches.currentStoryCount } }, null, 2));
  }
}
