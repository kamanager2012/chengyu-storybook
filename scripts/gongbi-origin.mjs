import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  CLASSIC_PUBLIC_ROOT,
  GONGBI_JPEG_ROOT,
  GONGBI_SLOTS,
  gongbiJpegFile,
} from "./gongbi-classic.mjs";
import { EXPECTED_CHILD_ONLY_COUNT, loadStoryEditions } from "./story-editions.mjs";
import { repoRoot } from "./story-model.mjs";

export const GONGBI_JPEG_ORIGIN_PATH = "content/evidence/story-images/gongbi-classic-jpeg-origin.json";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function rel(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

export function buildGongbiJpegOrigin(ids = loadStoryEditions({ skipChildOverlayInventory: true }).childOnly, root = repoRoot) {
  const entries = [];
  for (const id of ids) {
    for (const slot of GONGBI_SLOTS) {
      const jpegPath = gongbiJpegFile(id, slot, root);
      if (!existsSync(jpegPath)) throw new Error(`missing gongbi JPEG release: ${rel(jpegPath)}`);
      entries.push({
        storyId: id,
        slot,
        jpegPath: rel(jpegPath),
        runtimePath: `${CLASSIC_PUBLIC_ROOT}/${id}/${slot}.jpg`,
        jpegSha256: sha256File(jpegPath),
        jpegBytes: statSync(jpegPath).size,
      });
    }
  }
  const fingerprintEntries = entries.map(({ jpegPath, jpegSha256 }) => ({ jpegPath, jpegSha256 }));
  const mappingDigestSha256 = createHash("sha256").update(JSON.stringify(fingerprintEntries)).digest("hex");
  return {
    schemaVersion: 1,
    evidenceType: "gongbi-classic-jpeg-sha256-identity",
    rightsClaimApplied: false,
    scope: "technical-origin-only",
    sourceRoot: GONGBI_JPEG_ROOT,
    jpegRoot: GONGBI_JPEG_ROOT,
    runtimeRoot: CLASSIC_PUBLIC_ROOT,
    limitations: {
      notInStoryImageReleaseSet: true,
      noGeneratorLogs: true,
      generatorLogRoot: null,
      completeGeneratorLogBooks: 0,
      claimMeaning:
        "This file records byte identity for committed 工笔 JPEG release copies under content/imagine-gongbi-jpeg. PNG working masters are not kept in the repository. This origin file is not a distribution-rights claim.",
    },
    audit: {
      matchKind: "sha256-identity",
      childOnlyStories: ids.length,
      gongbiImages: entries.length,
      mappingDigestSha256,
    },
    entries,
  };
}

export function assertGongbiJpegOrigin(ids = loadStoryEditions({ skipChildOverlayInventory: true }).childOnly, root = repoRoot) {
  const built = buildGongbiJpegOrigin(ids, root);
  const path = join(root, GONGBI_JPEG_ORIGIN_PATH);
  if (!existsSync(path)) throw new Error(`missing ${GONGBI_JPEG_ORIGIN_PATH}`);
  const stored = JSON.parse(readFileSync(path, "utf8"));
  if (stored.rightsClaimApplied !== false) throw new Error("gongbi JPEG origin must not apply a rights claim");
  if (stored.scope !== "technical-origin-only") throw new Error("gongbi JPEG origin must stay technical-origin-only");
  if (stored.audit?.childOnlyStories !== EXPECTED_CHILD_ONLY_COUNT) {
    throw new Error(`gongbi JPEG origin must cover ${EXPECTED_CHILD_ONLY_COUNT} childOnly stories`);
  }
  if (stored.audit?.mappingDigestSha256 !== built.audit.mappingDigestSha256) {
    throw new Error(`${GONGBI_JPEG_ORIGIN_PATH} is stale; rebuild with scripts/gongbi-origin.mjs --write`);
  }
  if (JSON.stringify(stored.limitations) !== JSON.stringify(built.limitations)) {
    throw new Error(`${GONGBI_JPEG_ORIGIN_PATH} limitations are stale; rebuild with scripts/gongbi-origin.mjs --write`);
  }
  return built;
}

if (process.argv[1]?.endsWith("gongbi-origin.mjs")) {
  const built = buildGongbiJpegOrigin();
  if (process.argv.includes("--write")) {
    writeFileSync(join(repoRoot, GONGBI_JPEG_ORIGIN_PATH), `${JSON.stringify(built, null, 2)}\n`);
  }
  if (process.argv.includes("--check")) assertGongbiJpegOrigin();
  if (process.argv.includes("--summary") || process.argv.includes("--write") || process.argv.includes("--check")) {
    console.log(
      JSON.stringify(
        {
          schemaVersion: built.schemaVersion,
          rightsClaimApplied: built.rightsClaimApplied,
          childOnlyStories: built.audit.childOnlyStories,
          gongbiImages: built.audit.gongbiImages,
          noGeneratorLogs: built.limitations.noGeneratorLogs,
          completeGeneratorLogBooks: built.limitations.completeGeneratorLogBooks,
          mappingDigestSha256: built.audit.mappingDigestSha256,
        },
        null,
        2,
      ),
    );
  }
}
