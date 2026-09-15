import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CHILD_PAGE_FILES, EXPECTED_CHILD_OVERLAY_IDS } from "./child-overlay.mjs";
import { CHILD_OVERLAY_ORIGIN_PATH } from "./child-overlay-origin.mjs";
import { loadCursorOverlayRightsEvidence, loadGrokChildOverlayRightsEvidence } from "./child-overlay-rights.mjs";
import { GONGBI_SLOTS } from "./gongbi-classic.mjs";
import { GONGBI_JPEG_ORIGIN_PATH } from "./gongbi-origin.mjs";
import { evaluateGongbiRightsEvidence, loadGongbiRightsEvidence } from "./gongbi-rights.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";
import { EXPECTED_CHILD_ONLY_COUNT } from "./story-editions.mjs";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

function rel(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function imageKind(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

function looksLikeMp3(buffer) {
  if (buffer.length >= 3 && buffer.subarray(0, 3).toString("ascii") === "ID3") return true;
  return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

function normalizeText(text) {
  return text.replace(/\s+/g, "").trim();
}

export function buildContentReport() {
  const model = loadStoryModel();
  const referencedImages = new Set();
  const referencedAudio = new Set();
  const issues = [];
  const warnings = [];
  const seenStoryIds = new Set();
  const seenTitles = new Set();
  const seenText = new Map();

  const stories = model.stories.map((story) => {
    if (seenStoryIds.has(story.id)) issues.push(`duplicate story id: ${story.id}`);
    if (seenTitles.has(story.title)) issues.push(`duplicate story title: ${story.title}`);
    seenStoryIds.add(story.id);
    seenTitles.add(story.title);

    let imageBytes = 0;
    let audioBytes = 0;
    const pages = story.pages.map((page) => {
      const imagePath = join(repoRoot, "public", page.image);
      const audioPath = join(repoRoot, "public", page.audio);
      const imageRel = rel(imagePath);
      const audioRel = rel(audioPath);
      referencedImages.add(imageRel);
      referencedAudio.add(audioRel);

      const imageExists = existsSync(imagePath);
      const audioExists = existsSync(audioPath);
      const imageSize = imageExists ? statSync(imagePath).size : 0;
      const audioSize = audioExists ? statSync(audioPath).size : 0;
      imageBytes += imageSize;
      audioBytes += audioSize;

      let imageFormat = null;
      let audioValid = false;
      if (imageExists && imageSize > 0) imageFormat = imageKind(readFileSync(imagePath).subarray(0, 16));
      if (audioExists && audioSize > 0) audioValid = looksLikeMp3(readFileSync(audioPath).subarray(0, 16));

      if (!imageExists) issues.push(`missing image: ${imageRel}`);
      else if (!imageFormat) issues.push(`invalid image signature: ${imageRel}`);
      if (!audioExists) issues.push(`missing narration: ${audioRel}`);
      else if (!audioValid) issues.push(`invalid MP3 signature: ${audioRel}`);

      if (page.kind === "story") {
        const key = normalizeText(page.text);
        const previous = seenText.get(key);
        if (previous && previous !== `${story.id}/${page.id}`) {
          warnings.push(`duplicate story-page text: ${previous} and ${story.id}/${page.id}`);
        } else if (key) {
          seenText.set(key, `${story.id}/${page.id}`);
        }
      }

      return {
        id: page.id,
        kind: page.kind,
        textChars: [...page.text].length,
        image: imageRel,
        imageBytes: imageSize,
        imageFormat,
        imageSha256: imageExists ? sha256(imagePath) : null,
        audio: audioRel,
        audioBytes: audioSize,
        audioValid,
        audioSha256: audioExists ? sha256(audioPath) : null,
      };
    });

    return {
      id: story.id,
      title: story.title,
      pageCount: pages.length,
      storyPageCount: pages.filter((page) => page.kind === "story").length,
      imageBytes,
      audioBytes,
      pages,
    };
  });

  const draftPlan = buildNarrationPlan({ draftsOnly: true });
  for (const item of draftPlan.items) referencedAudio.add(item.output);

  const actualImages = walk(join(repoRoot, "public/stories")).map(rel);
  const actualAudio = walk(join(repoRoot, "public/audio")).map(rel);
  const orphanImages = actualImages.filter((path) => !referencedImages.has(path));
  const orphanAudio = actualAudio.filter((path) => !referencedAudio.has(path));
  for (const path of orphanImages) issues.push(`orphan story asset: ${path}`);
  for (const path of orphanAudio) issues.push(`orphan narration asset: ${path}`);

  const narrationPlan = buildNarrationPlan({ includeDrafts: true });
  const narration = Object.fromEntries(
    ["current", "stale", "unverified", "missing"].map((status) => [
      status,
      narrationPlan.items.filter((item) => item.status === status).length,
    ]),
  );
  const overlayOrigin = JSON.parse(readFileSync(join(repoRoot, CHILD_OVERLAY_ORIGIN_PATH), "utf8"));
  const gongbiOrigin = JSON.parse(readFileSync(join(repoRoot, GONGBI_JPEG_ORIGIN_PATH), "utf8"));
  let overlayReleaseClaimApplied = false;
  try {
    const cursorRights = loadCursorOverlayRightsEvidence();
    const grokOverlayRights = loadGrokChildOverlayRightsEvidence();
    overlayReleaseClaimApplied = cursorRights.rightsClaimApplied === true && grokOverlayRights.rightsClaimApplied === true;
  } catch {
    overlayReleaseClaimApplied = false;
  }
  let gongbiRightsClaimApplied = false;
  try {
    const gongbiRights = loadGongbiRightsEvidence();
    const gongbiEvaluation = evaluateGongbiRightsEvidence({ origin: gongbiOrigin, gongbiRights });
    for (const issue of gongbiEvaluation.issues) issues.push(issue);
    gongbiRightsClaimApplied = gongbiRights.rightsClaimApplied === true && gongbiEvaluation.issues.length === 0;
  } catch {
    gongbiRightsClaimApplied = false;
  }

  return {
    schemaVersion: 1,
    canonicalSource: "content/published-stories.json",
    totals: {
      stories: stories.length,
      pages: stories.reduce((sum, story) => sum + story.pageCount, 0),
      storyPages: stories.reduce((sum, story) => sum + story.storyPageCount, 0),
      imageBytes: stories.reduce((sum, story) => sum + story.imageBytes, 0),
      audioBytes: stories.reduce((sum, story) => sum + story.audioBytes, 0),
    },
    dualHall: {
      releaseStoryImages: stories.length * 8,
      childOverlayImages: EXPECTED_CHILD_OVERLAY_IDS.length * CHILD_PAGE_FILES.length,
      gongbiJpegImages: EXPECTED_CHILD_ONLY_COUNT * GONGBI_SLOTS.length,
      overlayRightsClaimApplied: overlayOrigin.rightsClaimApplied === false ? false : overlayOrigin.rightsClaimApplied,
      overlayReleaseClaimApplied,
      overlayInReleaseSet: overlayReleaseClaimApplied,
      gongbiRightsClaimApplied,
      gongbiInReleaseSet: gongbiRightsClaimApplied,
      productReady: overlayReleaseClaimApplied === true && gongbiRightsClaimApplied === true,
    },
    narration,
    issues: [...new Set(issues)].sort(),
    warnings: [...new Set(warnings)].sort(),
    stories,
  };
}

const isCli = Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  const report = buildContentReport();
  const check = process.argv.includes("--check");
  const summaryOnly = process.argv.includes("--summary");
  if (summaryOnly) {
    console.log(JSON.stringify({ schemaVersion: report.schemaVersion, canonicalSource: report.canonicalSource, totals: report.totals, dualHall: report.dualHall, narration: report.narration, issues: report.issues, warnings: report.warnings }, null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  if (check && report.issues.length > 0) process.exitCode = 1;
}
