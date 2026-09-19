import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { assertEveStaleRefreshAllowed, buildStaleItemStoryBatches } from "./generate-narration-stale-eve.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";
import { repoRoot } from "./story-model.mjs";

test("stale-item batches never include current keys", () => {
  const plan = buildNarrationPlan();
  const batches = buildStaleItemStoryBatches({ plan });
  const currentKeys = new Set(plan.items.filter((item) => item.status === "current").map((item) => item.key));
  for (const batch of batches.stories) {
    assert.ok(batch.staleItems.length > 0);
    for (const item of batch.staleItems) {
      assert.equal(currentKeys.has(item.key), false, item.key);
      assert.ok(["stale", "missing", "unverified"].includes(item.status));
    }
    for (const item of batch.currentItems) assert.equal(item.status, "current");
  }
  assert.equal(batches.protectedCurrentItemCount, currentKeys.size);
});

test("stale Eve refresh leaves cover/moral current and only queues body pages when copy-restore drift remains", () => {
  const batches = buildStaleItemStoryBatches();
  for (const batch of batches.stories) {
    assert.ok(batch.staleItems.every((item) => /^p[1-7]$/.test(item.pageId)));
    assert.ok(batch.currentItems.some((item) => item.pageId === "p0"));
    assert.ok(batch.currentItems.some((item) => item.pageId === "moral"));
  }
});

test("story filter scopes stale batches without pulling other ids", () => {
  const batches = buildStaleItemStoryBatches({ stories: ["ba-miao"] });
  assert.ok(batches.stories.every((story) => story.storyId === "ba-miao"));
});

test("Eve stale refresh is allowed while live shou-zhu body pages remain stale", () => {
  const allowed = assertEveStaleRefreshAllowed();
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.expansionApproved, true);
});

test("orchestrator forbids broad replacement and requires stale-only execute", () => {
  const source = readFileSync(join(repoRoot, "scripts/generate-narration-stale-eve.mjs"), "utf8");
  assert.match(source, /\["--all", "--replace", "--pending"\]/);
  assert.match(source, /Eve stale execute requires --stale-only/);
  assert.match(source, /--no-public-write/);
  assert.equal(source.includes("--all --replace"), false);
});
