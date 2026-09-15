import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDraftLineageEntries,
  buildDraftProvenanceEntries,
  evaluateDraftRightsEvidence,
  loadDraftRightsEvidence,
} from "./draft-story-rights.mjs";
import { loadDraftStoryCatalog } from "./draft-story-catalog.mjs";

const catalog = loadDraftStoryCatalog();
const evidence = loadDraftRightsEvidence();
const evaluation = evaluateDraftRightsEvidence({ catalog, evidence });

test("live draft catalog is retired after promotion into published stories", () => {
  assert.equal(catalog.publishedCount, 100);
  assert.equal(catalog.draftCount, 0);
  assert.equal(catalog.totalCount, 100);
  assert.equal(catalog.stories.length, 0);
  assert.equal(evidence.sourceBundles.length, 0);
  assert.deepEqual(evaluation.issues, []);
});

test("retired draft catalog generates no separate text provenance", () => {
  const provenance = buildDraftProvenanceEntries(evaluation);
  const lineage = buildDraftLineageEntries(evaluation, "a".repeat(40));
  assert.deepEqual(provenance.entries, {});
  assert.deepEqual(lineage.entries, {});
});
