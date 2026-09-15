import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CHILD_OVERLAY_ORIGIN_PATH, assertChildOverlayOrigin } from "./child-overlay-origin.mjs";
import {
  CURSOR_OVERLAY_RIGHTS_PATH,
  CURSOR_TERMS_EXCERPT_PATH,
  GROK_CHILD_OVERLAY_RIGHTS_PATH,
  buildChildOverlayProvenanceEntries,
  buildChildOverlayRightsSets,
  evaluateChildOverlayRightsEvidence,
  loadCursorOverlayRightsEvidence,
  loadGrokChildOverlayRightsEvidence,
} from "./child-overlay-rights.mjs";
import { repoRoot } from "./story-model.mjs";

const origin = assertChildOverlayOrigin();
const sets = buildChildOverlayRightsSets(origin);
const cursorRights = loadCursorOverlayRightsEvidence();
const grokRights = loadGrokChildOverlayRightsEvidence();
const evaluation = evaluateChildOverlayRightsEvidence({ origin, cursorRights, grokRights });
const overlayAssets = origin.entries.map((entry) => ({
  id: `image:${entry.sourcePath}`,
  category: "child-overlay-image",
  path: entry.sourcePath,
  fingerprintSha256: entry.sha256,
}));

test("child overlay origin stays technical-only while split release claims are applied", () => {
  const stored = JSON.parse(readFileSync(join(repoRoot, CHILD_OVERLAY_ORIGIN_PATH), "utf8"));
  assert.equal(stored.rightsClaimApplied, false);
  assert.equal(stored.limitations.notInStoryImageReleaseSet, true);
  assert.equal(cursorRights.rightsClaimApplied, true);
  assert.equal(grokRights.rightsClaimApplied, true);
  assert.equal(cursorRights.limitations.notMergedIntoGrokPublicStoriesSet, true);
  assert.equal(grokRights.limitations.notMergedIntoGrokPublicStoriesSet, true);
  assert.deepEqual(evaluation.issues, []);
});

test("Cursor and Grok overlay claims pin separate subsets of the same origin digest", () => {
  assert.equal(sets.cursor.stories, 65);
  assert.equal(sets.cursor.images, 520);
  assert.equal(sets.grok.stories, 11);
  assert.equal(sets.grok.images, 88);
  assert.equal(cursorRights.overlaySet.digestSha256, sets.cursor.digestSha256);
  assert.equal(grokRights.overlaySet.digestSha256, sets.grok.digestSha256);
  assert.notEqual(cursorRights.overlaySet.digestSha256, grokRights.overlaySet.digestSha256);
  assert.equal(cursorRights.origin.mappingDigestSha256, origin.audit.mappingDigestSha256);
  assert.equal(grokRights.origin.mappingDigestSha256, origin.audit.mappingDigestSha256);
  assert.equal(cursorRights.providerRights.consumerTerms.localExcerpt, CURSOR_TERMS_EXCERPT_PATH);
  assert.equal(grokRights.providerRights.brandGuidelines.attribution, "Created with Grok");
});

test("all 608 overlay JPEGs receive fingerprint-backed owned provenance split by generator", () => {
  const generated = buildChildOverlayProvenanceEntries(overlayAssets, evaluation);
  assert.deepEqual(generated.issues, []);
  assert.equal(Object.keys(generated.entries).length, 608);
  const cursorId = "image:content/imagine-child-drafts/wei-bian-san-jue/cover.jpg";
  const grokId = "image:content/imagine-child-drafts/xiong-you-cheng-zhu/cover.jpg";
  assert.equal(generated.entries[cursorId].claim, "owned");
  assert.equal(generated.entries[cursorId].evidence.includes(CURSOR_OVERLAY_RIGHTS_PATH), true);
  assert.equal(generated.entries[cursorId].evidence.includes(CURSOR_TERMS_EXCERPT_PATH), true);
  assert.equal(generated.entries[cursorId].evidence.includes("https://x.ai/legal/terms-of-service"), false);
  assert.equal(generated.entries[grokId].claim, "owned");
  assert.equal(generated.entries[grokId].evidence.includes(GROK_CHILD_OVERLAY_RIGHTS_PATH), true);
  assert.equal(generated.entries[grokId].evidence.includes("https://x.ai/legal/terms-of-service"), true);
  assert.equal(generated.entries[grokId].evidence.includes(CURSOR_TERMS_EXCERPT_PATH), false);
});

test("overlay origin mapping drift revokes all overlay claims", () => {
  const drifted = evaluateChildOverlayRightsEvidence({
    origin: { ...origin, audit: { ...origin.audit, mappingDigestSha256: "0".repeat(64) } },
    cursorRights,
    grokRights,
  });
  assert.ok(drifted.issues.some((issue) => issue.includes("origin mapping drift")));
  const generated = buildChildOverlayProvenanceEntries(overlayAssets, drifted);
  assert.equal(Object.keys(generated.entries).length, 0);
});
