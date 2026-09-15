import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { EXPECTED_CHILD_ONLY_COUNT } from "./story-editions.mjs";
import { GONGBI_JPEG_ORIGIN_PATH, assertGongbiJpegOrigin, buildGongbiJpegOrigin } from "./gongbi-origin.mjs";
import { GONGBI_SLOTS } from "./gongbi-classic.mjs";
import { repoRoot } from "./story-model.mjs";

test("gongbi JPEG origin is technical-only and is not a distribution-rights claim", () => {
  const built = buildGongbiJpegOrigin();
  const stored = JSON.parse(readFileSync(join(repoRoot, GONGBI_JPEG_ORIGIN_PATH), "utf8"));
  assert.equal(built.rightsClaimApplied, false);
  assert.equal(stored.rightsClaimApplied, false);
  assert.equal(built.scope, "technical-origin-only");
  assert.equal(built.limitations.notInStoryImageReleaseSet, true);
  assert.equal(built.limitations.noGeneratorLogs, true);
  assert.equal(built.limitations.completeGeneratorLogBooks, 0);
  assert.equal(stored.limitations.noGeneratorLogs, true);
  assert.match(built.limitations.claimMeaning, /not a distribution-rights claim/);
  assert.equal(built.audit.childOnlyStories, EXPECTED_CHILD_ONLY_COUNT);
  assert.equal(built.audit.gongbiImages, EXPECTED_CHILD_ONLY_COUNT * GONGBI_SLOTS.length);
  assert.equal(built.entries.length, 192);
  const checked = assertGongbiJpegOrigin();
  assert.equal(checked.audit.mappingDigestSha256, built.audit.mappingDigestSha256);
  assert.equal(stored.audit.mappingDigestSha256, built.audit.mappingDigestSha256);
});
