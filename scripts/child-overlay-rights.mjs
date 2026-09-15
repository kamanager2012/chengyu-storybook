import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CURSOR_CHILD_OVERLAY_SOURCE,
  EXPECTED_CURSOR_CHILD_OVERLAY_COUNT,
  EXPECTED_GROK_CHILD_OVERLAY_COUNT,
  GROK_CHILD_OVERLAY_SOURCE,
} from "./child-overlay.mjs";
import { CHILD_OVERLAY_ORIGIN_PATH, assertChildOverlayOrigin, buildChildOverlayOrigin } from "./child-overlay-origin.mjs";
import { repoRoot } from "./story-model.mjs";

export const CURSOR_OVERLAY_RIGHTS_PATH = "content/evidence/story-images/cursor-generate-image-rights.json";
export const GROK_CHILD_OVERLAY_RIGHTS_PATH = "content/evidence/story-images/grok-imagine-child-overlay-rights.json";
export const CURSOR_TERMS_EXCERPT_PATH = "licenses/cursor/Anysphere-Terms-excerpt-2026-09-09.txt";
export const CURSOR_TERMS_URL = "https://cursor.com/terms-of-service";
const XAI_TERMS_URL = "https://x.ai/legal/terms-of-service";
const XAI_FAQ_URL = "https://x.ai/legal/faq";
const XAI_BRAND_URL = "https://x.ai/legal/brand-guidelines";

const CURSOR_SOURCE = CURSOR_CHILD_OVERLAY_SOURCE;
const GROK_SOURCE = GROK_CHILD_OVERLAY_SOURCE;
const EXPECTED_CURSOR_STORIES = EXPECTED_CURSOR_CHILD_OVERLAY_COUNT;
const EXPECTED_GROK_STORIES = EXPECTED_GROK_CHILD_OVERLAY_COUNT;

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function readJson(path) {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
}

function subset(origin, source) {
  const entries = origin.entries.filter((entry) => entry.source === source);
  const stories = new Set(entries.map((entry) => entry.storyId));
  const fingerprintEntries = entries.map(({ sourcePath, sha256 }) => ({ sourcePath, sha256 }));
  return {
    source,
    stories: stories.size,
    images: entries.length,
    digestSha256: sha256Buffer(Buffer.from(JSON.stringify(fingerprintEntries), "utf8")),
    entries,
  };
}

export function buildChildOverlayRightsSets(origin = buildChildOverlayOrigin()) {
  return {
    cursor: subset(origin, CURSOR_SOURCE),
    grok: subset(origin, GROK_SOURCE),
  };
}

export function loadCursorOverlayRightsEvidence() {
  const evidence = readJson(CURSOR_OVERLAY_RIGHTS_PATH);
  if (
    evidence?.schemaVersion !== 1 ||
    evidence.claim !== "owned" ||
    evidence.scope !== "cursor-generate-image-child-overlay-jpegs" ||
    evidence.overlaySet?.source !== CURSOR_SOURCE ||
    evidence.overlaySet?.stories !== EXPECTED_CURSOR_STORIES ||
    evidence.overlaySet?.images !== EXPECTED_CURSOR_STORIES * 8 ||
    typeof evidence.overlaySet?.digestSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(evidence.overlaySet.digestSha256) ||
    evidence.origin?.evidence !== CHILD_OVERLAY_ORIGIN_PATH ||
    evidence.providerRights?.consumerTerms?.url !== CURSOR_TERMS_URL ||
    evidence.providerRights?.consumerTerms?.localExcerpt !== CURSOR_TERMS_EXCERPT_PATH ||
    evidence.rightsClaimApplied !== true
  ) {
    throw new Error(`${CURSOR_OVERLAY_RIGHTS_PATH} is malformed or has changed rights semantics`);
  }
  if (!existsSync(join(repoRoot, CURSOR_TERMS_EXCERPT_PATH))) {
    throw new Error(`missing Cursor terms excerpt: ${CURSOR_TERMS_EXCERPT_PATH}`);
  }
  return evidence;
}

export function loadGrokChildOverlayRightsEvidence() {
  const evidence = readJson(GROK_CHILD_OVERLAY_RIGHTS_PATH);
  if (
    evidence?.schemaVersion !== 1 ||
    evidence.claim !== "owned" ||
    evidence.scope !== "grok-imagine-child-overlay-jpegs" ||
    evidence.overlaySet?.source !== GROK_SOURCE ||
    evidence.overlaySet?.stories !== EXPECTED_GROK_STORIES ||
    evidence.overlaySet?.images !== EXPECTED_GROK_STORIES * 8 ||
    typeof evidence.overlaySet?.digestSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(evidence.overlaySet.digestSha256) ||
    evidence.origin?.evidence !== CHILD_OVERLAY_ORIGIN_PATH ||
    evidence.providerRights?.consumerTerms?.url !== XAI_TERMS_URL ||
    evidence.providerRights?.brandGuidelines?.attribution !== "Created with Grok" ||
    evidence.rightsClaimApplied !== true
  ) {
    throw new Error(`${GROK_CHILD_OVERLAY_RIGHTS_PATH} is malformed or has changed rights semantics`);
  }
  return evidence;
}

export function evaluateChildOverlayRightsEvidence(options = {}) {
  const origin = options.origin ?? assertChildOverlayOrigin();
  const sets = buildChildOverlayRightsSets(origin);
  const cursorRights = options.cursorRights ?? loadCursorOverlayRightsEvidence();
  const grokRights = options.grokRights ?? loadGrokChildOverlayRightsEvidence();
  const issues = [];

  if (origin.audit.mappingDigestSha256 !== cursorRights.origin.mappingDigestSha256) {
    issues.push(`cursor overlay origin mapping drift: expected ${cursorRights.origin.mappingDigestSha256}, got ${origin.audit.mappingDigestSha256}`);
  }
  if (origin.audit.mappingDigestSha256 !== grokRights.origin.mappingDigestSha256) {
    issues.push(`grok child overlay origin mapping drift: expected ${grokRights.origin.mappingDigestSha256}, got ${origin.audit.mappingDigestSha256}`);
  }
  if (sets.cursor.digestSha256 !== cursorRights.overlaySet.digestSha256) {
    issues.push(`cursor overlay digest drift: expected ${cursorRights.overlaySet.digestSha256}, got ${sets.cursor.digestSha256}`);
  }
  if (sets.grok.digestSha256 !== grokRights.overlaySet.digestSha256) {
    issues.push(`grok child overlay digest drift: expected ${grokRights.overlaySet.digestSha256}, got ${sets.grok.digestSha256}`);
  }
  if (sets.cursor.stories !== EXPECTED_CURSOR_STORIES || sets.grok.stories !== EXPECTED_GROK_STORIES) {
    issues.push(`child overlay source split drift: cursor ${sets.cursor.stories}, grok ${sets.grok.stories}`);
  }
  if (sha256File(join(repoRoot, CURSOR_TERMS_EXCERPT_PATH)) !== cursorRights.providerRights.consumerTerms.excerptSha256) {
    issues.push("Cursor terms excerpt fingerprint drift");
  }

  return { schemaVersion: 1, origin, sets, cursorRights, grokRights, issues: [...new Set(issues)].sort() };
}

export function buildChildOverlayProvenanceEntries(overlayAssets, evaluation = evaluateChildOverlayRightsEvidence()) {
  const issues = [...evaluation.issues];
  const entries = {};
  const byPath = new Map(evaluation.origin.entries.map((item) => [item.sourcePath, item]));

  if (overlayAssets.length !== evaluation.origin.entries.length) {
    issues.push(`child overlay inventory count drift: expected ${evaluation.origin.entries.length}, got ${overlayAssets.length}`);
  }

  for (const asset of overlayAssets) {
    const pinned = byPath.get(asset.path);
    if (!pinned) {
      issues.push(`child overlay rights evidence does not contain current asset path: ${asset.path}`);
      continue;
    }
    if (pinned.sha256 !== asset.fingerprintSha256) {
      issues.push(`child overlay fingerprint drift: ${asset.path}`);
    }
  }

  const uniqueIssues = [...new Set(issues)].sort();
  if (uniqueIssues.length > 0) return { entries, issues: uniqueIssues };

  const cursorEvidence = [
    CURSOR_OVERLAY_RIGHTS_PATH,
    CHILD_OVERLAY_ORIGIN_PATH,
    CURSOR_TERMS_EXCERPT_PATH,
    CURSOR_TERMS_URL,
  ];
  const grokEvidence = [
    GROK_CHILD_OVERLAY_RIGHTS_PATH,
    CHILD_OVERLAY_ORIGIN_PATH,
    XAI_TERMS_URL,
    XAI_FAQ_URL,
    XAI_BRAND_URL,
  ];

  for (const asset of overlayAssets) {
    const pinned = byPath.get(asset.path);
    entries[asset.id] = {
      fingerprintSha256: asset.fingerprintSha256,
      claim: "owned",
      evidence: pinned.source === CURSOR_SOURCE ? cursorEvidence : grokEvidence,
    };
  }
  return { entries, issues: [] };
}

export function buildCursorOverlayRightsDocument(origin = buildChildOverlayOrigin()) {
  const { cursor } = buildChildOverlayRightsSets(origin);
  return {
    schemaVersion: 1,
    claim: "owned",
    rightsClaimApplied: true,
    scope: "cursor-generate-image-child-overlay-jpegs",
    retrievedAt: "2026-09-09",
    overlaySet: {
      source: CURSOR_SOURCE,
      stories: cursor.stories,
      images: cursor.images,
      digestSha256: cursor.digestSha256,
    },
    origin: {
      evidence: CHILD_OVERLAY_ORIGIN_PATH,
      mappingDigestSha256: origin.audit.mappingDigestSha256,
    },
    providerRights: {
      provider: "Anysphere, Inc.",
      consumerTerms: {
        url: CURSOR_TERMS_URL,
        retrievedAt: "2026-09-09",
        localExcerpt: CURSOR_TERMS_EXCERPT_PATH,
        excerptSha256: sha256File(join(repoRoot, CURSOR_TERMS_EXCERPT_PATH)),
        summary:
          "Section 1.2 defines Suggestions as code, outputs, or other functions based on Inputs. Section 5.3 assigns Anysphere's right, title, and interest if any in Suggestions to the user. This claim treats Cursor GenerateImage JPEGs recorded in child-overlay logs as Suggestions/outputs.",
      },
    },
    limitations: {
      copyrightability: "This evidence does not assert that every element of an AI-generated image is independently copyrightable in every jurisdiction.",
      thirdPartyRights:
        "Anysphere disclaims non-infringement warranties. Suggestions may be similar to outputs provided to other customers. This claim is not a warranty against every possible third-party copyright, trademark, likeness, or other rights claim.",
      notMergedIntoGrokPublicStoriesSet: true,
      claimMeaning:
        "The owned claim records the project's rights position as between the user and Anysphere for the logged Cursor GenerateImage children's overlay JPEGs; it is not a universal non-infringement certification and does not add these files to the 800-image Grok public/stories set.",
    },
  };
}

export function buildGrokChildOverlayRightsDocument(origin = buildChildOverlayOrigin()) {
  const { grok } = buildChildOverlayRightsSets(origin);
  return {
    schemaVersion: 1,
    claim: "owned",
    rightsClaimApplied: true,
    scope: "grok-imagine-child-overlay-jpegs",
    retrievedAt: "2026-09-09",
    overlaySet: {
      source: GROK_SOURCE,
      stories: grok.stories,
      images: grok.images,
      digestSha256: grok.digestSha256,
    },
    origin: {
      evidence: CHILD_OVERLAY_ORIGIN_PATH,
      mappingDigestSha256: origin.audit.mappingDigestSha256,
    },
    providerRights: {
      provider: "X.AI LLC",
      consumerTerms: {
        url: XAI_TERMS_URL,
        effectiveDate: "2026-06-26",
        summary:
          "The Consumer Terms define Grok Output as User Content and state that, to the extent permitted by applicable law and as between the user and xAI, the user retains ownership rights to User Content.",
      },
      consumerFaq: {
        url: XAI_FAQ_URL,
        summary: "The Consumer FAQ states that users own Grok Inputs and Outputs, including generated images, and may use Grok Outputs as they wish, including commercially.",
      },
      brandGuidelines: {
        url: XAI_BRAND_URL,
        attribution: "Created with Grok",
        summary: "xAI asks that Grok-generated images be attributed using the phrase Created with Grok.",
      },
    },
    limitations: {
      copyrightability: "This evidence does not assert that every element of an AI-generated image is independently copyrightable in every jurisdiction.",
      thirdPartyRights:
        "xAI states that outputs may not be unique and disclaims warranties including non-infringement. This claim therefore does not represent a warranty against every possible third-party copyright, trademark, likeness, or other rights claim.",
      notMergedIntoGrokPublicStoriesSet: true,
      claimMeaning:
        "The owned claim records the project's rights position as between the user and xAI for the logged Grok Imagine children's overlay JPEGs; it is not a universal non-infringement certification and does not add these files to the 800-image public/stories Grok set.",
    },
  };
}

if (process.argv[1]?.endsWith("child-overlay-rights.mjs")) {
  const origin = buildChildOverlayOrigin();
  if (process.argv.includes("--write")) {
    writeFileSync(join(repoRoot, CURSOR_OVERLAY_RIGHTS_PATH), `${JSON.stringify(buildCursorOverlayRightsDocument(origin), null, 2)}\n`);
    writeFileSync(join(repoRoot, GROK_CHILD_OVERLAY_RIGHTS_PATH), `${JSON.stringify(buildGrokChildOverlayRightsDocument(origin), null, 2)}\n`);
  }
  const evaluation = evaluateChildOverlayRightsEvidence({ origin });
  console.log(
    JSON.stringify(
      {
        cursorStories: evaluation.sets.cursor.stories,
        cursorImages: evaluation.sets.cursor.images,
        grokStories: evaluation.sets.grok.stories,
        grokImages: evaluation.sets.grok.images,
        issues: evaluation.issues,
      },
      null,
      2,
    ),
  );
  if (process.argv.includes("--check") && evaluation.issues.length > 0) process.exitCode = 1;
}
