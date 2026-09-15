import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CURSOR_TERMS_EXCERPT_PATH } from "./child-overlay-rights.mjs";
import { GONGBI_JPEG_ORIGIN_PATH, assertGongbiJpegOrigin } from "./gongbi-origin.mjs";
import {
  GONGBI_RIGHTS_PATH,
  GONGBI_RIGHTS_SCOPE,
  buildGongbiJpegRightsSet,
  buildGongbiProvenanceEntries,
  evaluateGongbiRightsEvidence,
  loadGongbiRightsEvidence,
} from "./gongbi-rights.mjs";
import { EXPECTED_CHILD_ONLY_COUNT } from "./story-editions.mjs";
import { repoRoot } from "./story-model.mjs";

const origin = assertGongbiJpegOrigin();
const gongbiSet = buildGongbiJpegRightsSet(origin);
const gongbiRights = loadGongbiRightsEvidence();
const evaluation = evaluateGongbiRightsEvidence({ origin, gongbiRights });
const gongbiAssets = origin.entries.map((entry) => ({
  id: `image:${entry.jpegPath}`,
  category: "gongbi-classic-image",
  path: entry.jpegPath,
  fingerprintSha256: entry.jpegSha256,
}));

test("gongbi origin stays technical-only while the Cursor 工笔 rights claim is applied", () => {
  const storedOrigin = JSON.parse(readFileSync(join(repoRoot, GONGBI_JPEG_ORIGIN_PATH), "utf8"));
  const storedRights = JSON.parse(readFileSync(join(repoRoot, GONGBI_RIGHTS_PATH), "utf8"));
  assert.equal(storedOrigin.rightsClaimApplied, false);
  assert.equal(origin.rightsClaimApplied, false);
  assert.equal(gongbiRights.rightsClaimApplied, true);
  assert.equal(gongbiRights.claim, "owned");
  assert.equal(gongbiRights.scope, GONGBI_RIGHTS_SCOPE);
  assert.equal(storedRights.limitations.notMergedIntoGrokPublicStoriesSet, true);
  assert.equal(storedRights.limitations.notInStoryImageReleaseSet, true);
  assert.match(storedRights.limitations.claimMeaning, /separate dual-hall inventory category/);
  assert.deepEqual(evaluation.issues, []);
});

test("gongbi rights pin the JPEG digest, origin mapping, no committed logs, and Cursor terms", () => {
  assert.equal(gongbiSet.stories, EXPECTED_CHILD_ONLY_COUNT);
  assert.equal(gongbiSet.images, EXPECTED_CHILD_ONLY_COUNT * 8);
  assert.equal(gongbiRights.gongbiSet.digestSha256, gongbiSet.digestSha256);
  assert.equal(gongbiRights.gongbiSet.digestSha256, origin.audit.mappingDigestSha256);
  assert.equal(gongbiRights.origin.mappingDigestSha256, origin.audit.mappingDigestSha256);
  assert.equal(gongbiRights.origin.evidence, GONGBI_JPEG_ORIGIN_PATH);
  assert.equal(gongbiRights.generatorLogs.root, null);
  assert.equal(gongbiRights.generatorLogs.completeBooks, 0);
  assert.equal(gongbiRights.providerRights.consumerTerms.localExcerpt, CURSOR_TERMS_EXCERPT_PATH);

  const generated = buildGongbiProvenanceEntries(gongbiAssets, evaluation);
  assert.deepEqual(generated.issues, []);
  assert.equal(Object.keys(generated.entries).length, EXPECTED_CHILD_ONLY_COUNT * 8);
  const sample = generated.entries["image:content/imagine-gongbi-jpeg/shou-zhu/cover.jpg"];
  assert.ok(sample);
  assert.equal(sample.claim, "owned");
  assert.equal(sample.evidence.includes(GONGBI_RIGHTS_PATH), true);
  assert.equal(sample.evidence.includes(GONGBI_JPEG_ORIGIN_PATH), true);
  assert.equal(sample.evidence.includes(CURSOR_TERMS_EXCERPT_PATH), true);
  assert.equal(sample.evidence.includes("https://cursor.com/terms-of-service"), true);
  assert.equal(sample.evidence.includes("https://x.ai/legal/terms-of-service"), false);
});

test("gongbi origin mapping drift revokes the 工笔 rights evaluation", () => {
  const drifted = evaluateGongbiRightsEvidence({
    origin: { ...origin, audit: { ...origin.audit, mappingDigestSha256: "0".repeat(64) } },
    gongbiRights,
  });
  assert.ok(drifted.issues.some((issue) => issue.includes("origin mapping drift")));
  const generated = buildGongbiProvenanceEntries(gongbiAssets, drifted);
  assert.equal(Object.keys(generated.entries).length, 0);
});
