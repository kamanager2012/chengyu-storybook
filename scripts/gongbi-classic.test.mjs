import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import {
  CLASSIC_PUBLIC_ROOT,
  GONGBI_SLOTS,
  assertGongbiClassicInventory,
  classicCoverPath,
  gongbiJpegFile,
  gongbiJpegReleasePaths,
  syncGongbiClassicPublic,
} from "./gongbi-classic.mjs";
import { EXPECTED_CHILD_ONLY_COUNT, loadStoryEditions } from "./story-editions.mjs";
import { loadStoryModel, repoRoot } from "./story-model.mjs";
import { join } from "node:path";

test("gongbi inventory covers every children's-art idiom with eight JPEG release copies", () => {
  const publishedIds = loadStoryModel().stories.map((story) => story.id);
  const editions = loadStoryEditions({ publishedIds });
  assert.equal(editions.childOnly.length, EXPECTED_CHILD_ONLY_COUNT);
  assertGongbiClassicInventory(editions.childOnly);
  assert.equal(classicCoverPath("shou-zhu"), "/classic-stories/shou-zhu/cover.jpg");
  for (const slot of GONGBI_SLOTS) {
    assert.equal(existsSync(gongbiJpegFile("yu-bang", slot)), true);
  }
  const jpegRelease = gongbiJpegReleasePaths();
  assert.equal(jpegRelease.length, EXPECTED_CHILD_ONLY_COUNT * GONGBI_SLOTS.length);
  assert.ok(jpegRelease.every((path) => path.includes("content/imagine-gongbi-jpeg/")));
});

test("gongbi sync maps JPEG release copies onto the classic runtime root without touching public/stories", () => {
  const ids = loadStoryEditions().childOnly;
  const result = syncGongbiClassicPublic({ ids });
  assert.equal(result.ids.length, EXPECTED_CHILD_ONLY_COUNT);
  assert.equal(result.count, EXPECTED_CHILD_ONLY_COUNT * GONGBI_SLOTS.length);
  assert.equal(existsSync(join(repoRoot, CLASSIC_PUBLIC_ROOT, "shou-zhu", "cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CLASSIC_PUBLIC_ROOT, "yu-bang", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CLASSIC_PUBLIC_ROOT, "shou-zhu", "cover.png")), false);
  assert.equal(existsSync(join(repoRoot, "public/stories/shou-zhu/cover.jpg")), true);
});
