import assert from "node:assert/strict";
import test from "node:test";
import { buildStoryImageReleaseSet } from "./story-image-release-set.mjs";

const EXPECTED_DIGEST = "bf71ab75aa0b9dad9b4dfeab26bd781631f1c60ef03ce2f8ecc8666f46955b0d";
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
