import assert from "node:assert/strict";
import test from "node:test";
import { buildStoryImageReleaseSet } from "./story-image-release-set.mjs";

const EXPECTED_DIGEST = "4627862af33f63d1e5843e434bd2a0eae69ec5873601acb7a066e28decfe398f";
const releaseSet = buildStoryImageReleaseSet();

test("story image release set is complete and byte-pinned", () => {
  assert.equal(releaseSet.schemaVersion, 1);
  assert.equal(releaseSet.count, 800);
  assert.equal(releaseSet.entries.length, 800);
  assert.equal(new Set(releaseSet.entries.map((entry) => entry.path)).size, 800);
  for (const entry of releaseSet.entries) {
    assert.match(entry.path, /^public\/stories\/[a-z0-9-]+\/(?:cover|p[1-7])\.jpg$/);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(entry.bytes > 0);
  }
  assert.equal(releaseSet.digestSha256, EXPECTED_DIGEST);
});
