import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CURSOR_TERMS_EXCERPT_PATH, CURSOR_TERMS_URL } from "./child-overlay-rights.mjs";
import { GONGBI_SLOTS } from "./gongbi-classic.mjs";
import { GONGBI_JPEG_ORIGIN_PATH, assertGongbiJpegOrigin, buildGongbiJpegOrigin } from "./gongbi-origin.mjs";
import { EXPECTED_CHILD_ONLY_COUNT } from "./story-editions.mjs";
import { repoRoot } from "./story-model.mjs";

export const GONGBI_RIGHTS_PATH = "content/evidence/story-images/cursor-generate-image-gongbi-rights.json";
export const GONGBI_RIGHTS_SCOPE = "cursor-generate-image-classic-gongbi-jpegs";
export const GONGBI_SOURCE = "cursor-generate-image";

const EXPECTED_GONGBI_IMAGES = EXPECTED_CHILD_ONLY_COUNT * GONGBI_SLOTS.length;

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function readJson(path) {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
}

export function buildGongbiJpegRightsSet(origin = buildGongbiJpegOrigin()) {
  const fingerprintEntries = origin.entries.map(({ jpegPath, jpegSha256 }) => ({ jpegPath, jpegSha256 }));
  return {
    source: GONGBI_SOURCE,
    stories: origin.audit.childOnlyStories,
    images: origin.entries.length,
    digestSha256: sha256Buffer(Buffer.from(JSON.stringify(fingerprintEntries), "utf8")),
  };
}

function assertGongbiOriginForRights(origin) {
  if (origin.rightsClaimApplied !== false) {
    throw new Error("gongbi origin must stay technical-only");
  }
  if (origin.limitations?.noGeneratorLogs !== true) {
    throw new Error("gongbi rights claim expects JPEG-only origin without generator logs");
  }
  if (origin.limitations?.completeGeneratorLogBooks !== 0) {
    throw new Error(
      `gongbi rights claim expects no generator logs, got completeGeneratorLogBooks=${origin.limitations?.completeGeneratorLogBooks}`,
    );
  }
}

export function buildGongbiRightsDocument(origin = assertGongbiJpegOrigin()) {
  assertGongbiOriginForRights(origin);
  const gongbiSet = buildGongbiJpegRightsSet(origin);
  return {
    schemaVersion: 1,
    claim: "owned",
    rightsClaimApplied: true,
    scope: GONGBI_RIGHTS_SCOPE,
    retrievedAt: "2026-09-10",
    gongbiSet,
    origin: {
      evidence: GONGBI_JPEG_ORIGIN_PATH,
      mappingDigestSha256: origin.audit.mappingDigestSha256,
    },
    generatorLogs: {
      root: origin.limitations.generatorLogRoot ?? null,
      completeBooks: origin.limitations.completeGeneratorLogBooks,
    },
    providerRights: {
      provider: "Anysphere, Inc.",
      consumerTerms: {
        url: CURSOR_TERMS_URL,
        retrievedAt: "2026-09-09",
        localExcerpt: CURSOR_TERMS_EXCERPT_PATH,
        excerptSha256: sha256File(join(repoRoot, CURSOR_TERMS_EXCERPT_PATH)),
        summary:
          "Section 1.2 defines Suggestions as code, outputs, or other functions based on Inputs. Section 5.3 assigns Anysphere's right, title, and interest if any in Suggestions to the user. This claim treats committed classic-hall 工笔 JPEG release copies as Suggestions/outputs; PNG working masters and generator logs are not kept in the repository.",
      },
    },
    limitations: {
      copyrightability: "This evidence does not assert that every element of an AI-generated image is independently copyrightable in every jurisdiction.",
      thirdPartyRights:
        "Anysphere disclaims non-infringement warranties. Suggestions may be similar to outputs provided to other customers. This claim is not a warranty against every possible third-party copyright, trademark, likeness, or other rights claim.",
      notMergedIntoGrokPublicStoriesSet: true,
      notInStoryImageReleaseSet: true,
      claimMeaning:
        "The owned claim records the project's rights position as between the user and Anysphere for committed classic-hall 工笔 JPEGs; it is not a universal non-infringement certification. These files are a separate dual-hall inventory category and are not added to the 800-image Grok public/stories set or the children's overlay rights sets.",
    },
  };
}

export function loadGongbiRightsEvidence() {
  const evidence = readJson(GONGBI_RIGHTS_PATH);
  if (
    evidence?.schemaVersion !== 1 ||
    evidence.claim !== "owned" ||
    evidence.scope !== GONGBI_RIGHTS_SCOPE ||
    evidence.gongbiSet?.source !== GONGBI_SOURCE ||
    evidence.gongbiSet?.stories !== EXPECTED_CHILD_ONLY_COUNT ||
    evidence.gongbiSet?.images !== EXPECTED_GONGBI_IMAGES ||
    typeof evidence.gongbiSet?.digestSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(evidence.gongbiSet.digestSha256) ||
    evidence.origin?.evidence !== GONGBI_JPEG_ORIGIN_PATH ||
    evidence.generatorLogs?.root !== null ||
    evidence.generatorLogs?.completeBooks !== 0 ||
    evidence.providerRights?.consumerTerms?.url !== CURSOR_TERMS_URL ||
    evidence.providerRights?.consumerTerms?.localExcerpt !== CURSOR_TERMS_EXCERPT_PATH ||
    evidence.limitations?.notMergedIntoGrokPublicStoriesSet !== true ||
    evidence.limitations?.notInStoryImageReleaseSet !== true ||
    evidence.rightsClaimApplied !== true
  ) {
    throw new Error(`${GONGBI_RIGHTS_PATH} is malformed or has changed rights semantics`);
  }
  if (!existsSync(join(repoRoot, CURSOR_TERMS_EXCERPT_PATH))) {
    throw new Error(`missing Cursor terms excerpt: ${CURSOR_TERMS_EXCERPT_PATH}`);
  }
  return evidence;
}

export function evaluateGongbiRightsEvidence(options = {}) {
  const origin = options.origin ?? assertGongbiJpegOrigin();
  const gongbiRights = options.gongbiRights ?? loadGongbiRightsEvidence();
  const gongbiSet = buildGongbiJpegRightsSet(origin);
  const issues = [];

  if (origin.rightsClaimApplied !== false) {
    issues.push("gongbi origin must not apply a rights claim");
  }
  if (origin.limitations?.noGeneratorLogs !== true) {
    issues.push("gongbi origin must record JPEG-only inventory without generator logs");
  }
  if (origin.limitations?.completeGeneratorLogBooks !== 0) {
    issues.push(
      `gongbi generator log count drift: expected 0 committed logs, got ${origin.limitations?.completeGeneratorLogBooks}`,
    );
  }
  if (origin.audit.mappingDigestSha256 !== gongbiRights.origin.mappingDigestSha256) {
    issues.push(
      `gongbi origin mapping drift: expected ${gongbiRights.origin.mappingDigestSha256}, got ${origin.audit.mappingDigestSha256}`,
    );
  }
  if (gongbiSet.digestSha256 !== gongbiRights.gongbiSet.digestSha256) {
    issues.push(`gongbi JPEG digest drift: expected ${gongbiRights.gongbiSet.digestSha256}, got ${gongbiSet.digestSha256}`);
  }
  if (gongbiSet.digestSha256 !== origin.audit.mappingDigestSha256) {
    issues.push("gongbi JPEG digest must match origin mappingDigestSha256");
  }
  if (sha256File(join(repoRoot, CURSOR_TERMS_EXCERPT_PATH)) !== gongbiRights.providerRights.consumerTerms.excerptSha256) {
    issues.push("Cursor terms excerpt fingerprint drift");
  }

  return { schemaVersion: 1, origin, gongbiSet, gongbiRights, issues: [...new Set(issues)].sort() };
}

export function buildGongbiProvenanceEntries(gongbiAssets, evaluation = evaluateGongbiRightsEvidence()) {
  const issues = [...evaluation.issues];
  const entries = {};
  const byPath = new Map(evaluation.origin.entries.map((item) => [item.jpegPath, item]));

  if (gongbiAssets.length !== evaluation.origin.entries.length) {
    issues.push(`gongbi inventory count drift: expected ${evaluation.origin.entries.length}, got ${gongbiAssets.length}`);
  }

  for (const asset of gongbiAssets) {
    const pinned = byPath.get(asset.path);
    if (!pinned) {
      issues.push(`gongbi rights evidence does not contain current asset path: ${asset.path}`);
      continue;
    }
    if (pinned.jpegSha256 !== asset.fingerprintSha256) {
      issues.push(`gongbi fingerprint drift: ${asset.path}`);
    }
  }

  const uniqueIssues = [...new Set(issues)].sort();
  if (uniqueIssues.length > 0) return { entries, issues: uniqueIssues };

  const evidence = [GONGBI_RIGHTS_PATH, GONGBI_JPEG_ORIGIN_PATH, CURSOR_TERMS_EXCERPT_PATH, CURSOR_TERMS_URL];
  for (const asset of gongbiAssets) {
    entries[asset.id] = {
      fingerprintSha256: asset.fingerprintSha256,
      claim: "owned",
      evidence,
    };
  }
  return { entries, issues: [] };
}

if (process.argv[1]?.endsWith("gongbi-rights.mjs")) {
  const origin = assertGongbiJpegOrigin();
  if (process.argv.includes("--write")) {
    writeFileSync(join(repoRoot, GONGBI_RIGHTS_PATH), `${JSON.stringify(buildGongbiRightsDocument(origin), null, 2)}\n`);
  }
  const evaluation = evaluateGongbiRightsEvidence({ origin });
  console.log(
    JSON.stringify(
      {
        rightsClaimApplied: evaluation.gongbiRights.rightsClaimApplied,
        stories: evaluation.gongbiSet.stories,
        images: evaluation.gongbiSet.images,
        digestSha256: evaluation.gongbiSet.digestSha256,
        issues: evaluation.issues,
      },
      null,
      2,
    ),
  );
  if (process.argv.includes("--check") && evaluation.issues.length > 0) process.exitCode = 1;
}
