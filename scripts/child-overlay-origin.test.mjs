import assert from "node:assert/strict";
import test from "node:test";
import { EXPECTED_CHILD_OVERLAY_COUNT, EXPECTED_CHILD_OVERLAY_IDS } from "./child-overlay.mjs";
import { assertChildOverlayOrigin, buildChildOverlayOrigin } from "./child-overlay-origin.mjs";

test("child overlay origin evidence is technical-only and matches on-disk JPEGs", () => {
  const built = buildChildOverlayOrigin();
  assert.equal(built.rightsClaimApplied, false);
  assert.equal(built.scope, "technical-origin-only");
  assert.equal(built.audit.overlayStories, EXPECTED_CHILD_OVERLAY_COUNT);
  assert.equal(built.audit.overlayImages, EXPECTED_CHILD_OVERLAY_IDS.length * 8);
  assert.equal(built.entries.length, EXPECTED_CHILD_OVERLAY_IDS.length * 8);
  assert.equal(built.limitations.notInStoryImageReleaseSet, true);
  const checked = assertChildOverlayOrigin();
  assert.equal(checked.audit.mappingDigestSha256, built.audit.mappingDigestSha256);
});
