import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CLASSIC_AUDIO_ROOT,
  CLASSIC_BODY_PAGE_IDS,
  CLASSIC_CANONICAL_SOURCE,
  CLASSIC_GENERATION_SET_EVIDENCE_PATH,
  buildClassicHallGenerationSet,
  buildClassicHallNarrationPlan,
  buildClassicStoryBatches,
  loadClassicHallSections,
  validateClassicHallReceipt,
} from "./classic-hall-narration.mjs";
import {
  CLASSIC_EVE_RIGHTS_EVIDENCE,
  snapshotChildCurrentNarration,
} from "./generate-narration-classic-eve.mjs";
import { buildNarrationGenerationSet, computeNarrationInputDigest } from "./narration-generation-set.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

test("classic-hall generation set is 700 p1-p7 tracks under public/audio-classic", () => {
  const classic = loadClassicHallSections();
  const set = buildClassicHallGenerationSet();
  const evidence = JSON.parse(readFileSync(join(repoRoot, CLASSIC_GENERATION_SET_EVIDENCE_PATH), "utf8"));
  const published = loadStoryModel();

  assert.equal(set.schemaVersion, 1);
  assert.equal(set.canonicalSource, CLASSIC_CANONICAL_SOURCE);
  assert.equal(set.count, 700);
  assert.equal(set.entries.length, 700);
  assert.equal(new Set(set.entries.map((entry) => entry.storyId)).size, 100);
  assert.equal(new Set(set.entries.map((entry) => entry.key)).size, 700);
  assert.deepEqual([...new Set(set.entries.map((entry) => entry.pageId))], [...CLASSIC_BODY_PAGE_IDS]);
  assert.equal(set.entries.some((entry) => entry.pageId === "p0" || entry.pageId === "moral"), false);
  assert.ok(set.entries.every((entry) => entry.file.startsWith(`${CLASSIC_AUDIO_ROOT}/`)));
  assert.equal(set.entries.some((entry) => entry.file.startsWith("public/audio/")), false);

  const byId = new Map(classic.stories.map((story) => [story.id, story]));
  for (const entry of set.entries) {
    const index = Number(entry.pageId.slice(1)) - 1;
    const expected = byId.get(entry.storyId).sections[index];
    assert.equal(entry.text, expected, entry.key);
    assert.equal(entry.textSha256, sha256Text(expected));
    assert.equal(entry.file, `${CLASSIC_AUDIO_ROOT}/${entry.storyId}/${entry.pageId}.mp3`);
  }

  assert.equal(set.inputDigestSha256, computeNarrationInputDigest(set.entries));
  assert.equal(set.inputDigestSha256, "9bfbb5e96e3155997d9b034cf68a54642dafa54efaefad8d93b5fc35455900ba");
  assert.equal(evidence.inputItemCount, 700);
  assert.equal(evidence.inputDigestSha256, set.inputDigestSha256);
  assert.equal(evidence.canonicalSource, CLASSIC_CANONICAL_SOURCE);
  assert.equal(published.stories.length, 100);
});

test("classic body text is sourced from classic-hall-sections, not published cover/moral", () => {
  const classic = loadClassicHallSections();
  const published = Object.fromEntries(loadStoryModel().stories.map((story) => [story.id, story]));
  const set = buildClassicHallGenerationSet({ story: "shou-zhu" });
  const child = published["shou-zhu"];
  const classicShouZhu = classic.stories.find((story) => story.id === "shou-zhu");
  assert.equal(set.count, 7);
  assert.equal(set.entries[0].pageId, "p1");
  assert.equal(set.entries.at(-1).pageId, "p7");
  assert.equal(set.entries[5].text, classicShouZhu.sections[5]);
  assert.equal(set.entries[5].pageId, "p6");
  assert.notEqual(set.entries[5].text, child.pages[6].text);
  assert.notEqual(set.entries[0].text, child.pages[0].text);
  assert.notEqual(set.entries.at(-1).text, child.pages.at(-1).text);
});

test("classic story batches are complete p1-p7 books and skip current stories", () => {
  const plan = buildClassicHallNarrationPlan();
  const batches = buildClassicStoryBatches({ plan });
  assert.equal(batches.audioRoot, CLASSIC_AUDIO_ROOT);
  assert.equal(batches.pendingStoryCount + batches.currentStoryCount, 100);
  assert.ok(batches.pending.every((story) => story.items.length === 7));
  assert.ok(batches.pending.every((story) => story.items.map((item) => item.pageId).join(",") === CLASSIC_BODY_PAGE_IDS.join(",")));
  assert.equal(plan.items.filter((item) => item.status === "current").length, batches.currentItemCount);
});

test("live classic-hall Eve body pages are fully current after refresh", () => {
  const plan = buildClassicHallNarrationPlan();
  const batches = buildClassicStoryBatches({ plan });
  assert.equal(plan.items.length, 700);
  assert.equal(plan.items.filter((item) => item.status === "current").length, 700);
  assert.equal(batches.pendingStoryCount, 0);
  assert.equal(batches.currentStoryCount, 100);
  assert.ok(plan.items.every((item) => item.provenance?.voice === "eve"));
  assert.ok(plan.items.every((item) => item.provenance?.provider === "xai-grok-tts"));
  assert.ok(plan.items.every((item) => item.output.startsWith(`${CLASSIC_AUDIO_ROOT}/`)));
});

test("children's narration remains a separate 900-current public/audio set", () => {
  const childPlan = buildNarrationPlan();
  const childSet = buildNarrationGenerationSet();
  const snapshot = snapshotChildCurrentNarration(childPlan);
  assert.equal(childPlan.items.length, 900);
  assert.equal(childSet.count, 900);
  assert.equal(snapshot.length, 900);
  assert.ok(childSet.entries.every((entry) => entry.file.startsWith("public/audio/")));
  assert.equal(childSet.entries.some((entry) => entry.file.includes("audio-classic")), false);
  assert.equal(childSet.inputDigestSha256, "2232621cc097c0ec03b23df0f82d9d6ff2062eba878a94db68b309a98054ab56");
});

test("classic Eve orchestrator forbids children's replacement flags and writes only audio-classic", () => {
  const source = readFileSync(join(repoRoot, "scripts/generate-narration-classic-eve.mjs"), "utf8");
  assert.match(source, /\["--all", "--replace", "--pending"\]/);
  assert.match(source, /Classic Eve execute requires --classic-only/);
  assert.match(source, /--no-public-write/);
  assert.match(source, /--no-voice-mirror/);
  assert.match(source, /public\/audio-classic/);
  assert.equal(source.includes("--all --replace"), false);
  assert.match(source, /childNarrationStateUpdated: false/);
  assert.deepEqual([...CLASSIC_EVE_RIGHTS_EVIDENCE], [
    "content/evidence/narration/providers/xai-grok-tts-eve.json",
    CLASSIC_GENERATION_SET_EVIDENCE_PATH,
  ]);
});

test("classic receipt validator accepts audio-classic p1-p7 and rejects children's public/audio", () => {
  const set = buildClassicHallGenerationSet({ story: "shou-zhu" });
  const items = set.entries.map((entry) => ({
    key: entry.key,
    file: entry.file,
    textSha256: entry.textSha256,
    audioSha256: "a".repeat(64),
  }));
  const receipt = {
    schemaVersion: 1,
    batchId: "eve-classic-test-shou-zhu-aaaaaaaaaaaa",
    canonicalSource: CLASSIC_CANONICAL_SOURCE,
    createdAt: "2026-09-19T00:00:00.000Z",
    inputItemCount: 7,
    inputDigestSha256: computeNarrationInputDigest(items),
    provider: {
      name: "xai-grok-tts",
      voice: "eve",
      language: "zh",
      generator: "xai-grok-tts-batch-v1",
      profile: { id: "xai-grok-tts-eve-v1" },
    },
    rights: { claim: "permission", evidence: [...CLASSIC_EVE_RIGHTS_EVIDENCE] },
    items,
  };
  const ok = validateClassicHallReceipt(receipt);
  assert.equal(ok.valid, true, ok.problems.join("; "));

  const rejected = validateClassicHallReceipt({
    ...receipt,
    items: items.map((item) => ({ ...item, file: item.file.replace("public/audio-classic/", "public/audio/") })),
  });
  assert.equal(rejected.valid, false);
  assert.ok(rejected.problems.some((problem) => /public\/audio-classic/.test(problem)));
});

test("reader classic remap only rewrites pages that have classicText", () => {
  const source = readFileSync(join(repoRoot, "src/data/story-editions.ts"), "utf8");
  assert.match(source, /function remapOverlayClassicCopy/);
  assert.match(source, /const toAudio = `\/audio-classic\/\$\{story\.id\}\/`;/);
  assert.match(source, /if \(!classicText\) return page;/);
  assert.match(source, /textByPage\.get\(page\.id\)/);
  assert.match(source, /`p\$\{index \+ 1\}`/);
});
