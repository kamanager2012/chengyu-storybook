import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  CHILD_DRAFTS_ROOT,
  CHILD_PAGE_FILES,
  CHILD_PUBLIC_ROOT,
  EXPECTED_CHILD_OVERLAY_IDS,
  childOverlayLogSource,
} from "./child-overlay.mjs";
import { repoRoot } from "./story-model.mjs";

export const CHILD_OVERLAY_ORIGIN_PATH = "content/evidence/story-images/cursor-child-overlay-origin.json";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function rel(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

export function buildChildOverlayOrigin(ids = EXPECTED_CHILD_OVERLAY_IDS, root = repoRoot) {
  const entries = [];
  const sources = {};
  for (const id of ids) {
    sources[id] = childOverlayLogSource(id, root);
    for (const name of CHILD_PAGE_FILES) {
      const sourcePath = join(root, CHILD_DRAFTS_ROOT, id, name);
      if (!existsSync(sourcePath)) throw new Error(`missing child overlay origin: ${rel(sourcePath)}`);
      entries.push({
        storyId: id,
        source: sources[id],
        sourcePath: rel(sourcePath),
        runtimePath: `${CHILD_PUBLIC_ROOT}/${id}/${name}`,
        sha256: sha256File(sourcePath),
        bytes: statSync(sourcePath).size,
      });
    }
  }
  const fingerprintEntries = entries.map(({ sourcePath, sha256 }) => ({ sourcePath, sha256 }));
  const mappingDigestSha256 = createHash("sha256").update(JSON.stringify(fingerprintEntries)).digest("hex");
  const sourceCounts = {};
  for (const source of Object.values(sources)) sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
  return {
    schemaVersion: 1,
    evidenceType: "child-overlay-draft-sha256-identity",
    rightsClaimApplied: false,
    scope: "technical-origin-only",
    sourceRoot: CHILD_DRAFTS_ROOT,
    runtimeRoot: CHILD_PUBLIC_ROOT,
    limitations: {
      notInStoryImageReleaseSet: true,
      claimMeaning:
        "This file records byte identity and generator tags for children's overlay JPEGs. It is not a distribution-rights claim and does not add these files to the 800-image Grok release set.",
    },
    audit: {
      matchKind: "sha256-identity",
      overlayStories: ids.length,
      overlayImages: entries.length,
      sourceCounts,
      mappingDigestSha256,
    },
    entries,
  };
}

export function assertChildOverlayOrigin(ids = EXPECTED_CHILD_OVERLAY_IDS, root = repoRoot) {
  const built = buildChildOverlayOrigin(ids, root);
  const path = join(root, CHILD_OVERLAY_ORIGIN_PATH);
  if (!existsSync(path)) throw new Error(`missing ${CHILD_OVERLAY_ORIGIN_PATH}`);
  const stored = JSON.parse(readFileSync(path, "utf8"));
  if (stored.rightsClaimApplied !== false) throw new Error("child overlay origin must not apply a rights claim");
  if (stored.audit?.mappingDigestSha256 !== built.audit.mappingDigestSha256) {
    throw new Error(`${CHILD_OVERLAY_ORIGIN_PATH} is stale; rebuild with scripts/child-overlay-origin.mjs --write`);
  }
  return built;
}

if (process.argv[1]?.endsWith("child-overlay-origin.mjs")) {
  const built = buildChildOverlayOrigin();
  if (process.argv.includes("--write")) {
    writeFileSync(join(repoRoot, CHILD_OVERLAY_ORIGIN_PATH), `${JSON.stringify(built, null, 2)}\n`);
  }
  if (process.argv.includes("--check")) assertChildOverlayOrigin();
  if (process.argv.includes("--summary") || process.argv.includes("--write") || process.argv.includes("--check")) {
    console.log(
      JSON.stringify(
        {
          schemaVersion: built.schemaVersion,
          rightsClaimApplied: built.rightsClaimApplied,
          overlayStories: built.audit.overlayStories,
          overlayImages: built.audit.overlayImages,
          sourceCounts: built.audit.sourceCounts,
          mappingDigestSha256: built.audit.mappingDigestSha256,
        },
        null,
        2,
      ),
    );
  }
}
