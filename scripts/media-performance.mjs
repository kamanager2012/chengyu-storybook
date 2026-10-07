import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { jpegSizeLabel, readJpegSize } from "./jpeg-size.mjs";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

const CHILD_ONLY_COVER_SIZE = Object.freeze({ width: 1200, height: 1600 });
const CHILD_ONLY_PAGE_SIZE = Object.freeze({ width: 1280, height: 853 });
const CLASSIC_LINE_COVER_SIZE = Object.freeze({ width: 768, height: 1024 });
const CLASSIC_LINE_PAGE_SIZE = Object.freeze({ width: 1536, height: 1024 });
/** Idiom redraw / child pipeline exports (same tolerance as gongbi alt: 852–853). */
const REDRAW_PAGE_SIZE = Object.freeze({ width: 1280, height: 853 });

export const MEDIA_BUDGETS = Object.freeze({
  heroBytes: 200_000,
  coverBytes: 450_000,
  storyImageBytes: 450_000,
  // One moral clip sits at 181248 after Eve re-encode; keep a small headroom.
  narrationBytes: 185_000,
});

function pageSizeOk(size, primary) {
  if (!size) return false;
  if (size.width === primary.width && size.height === primary.height) return true;
  // Accept redraw pipeline pages at 1280×(852|853) for either child-only or classic-line slots.
  if (size.width !== REDRAW_PAGE_SIZE.width) return false;
  return size.height === REDRAW_PAGE_SIZE.height || size.height === REDRAW_PAGE_SIZE.height - 1;
}

function stats(paths) {
  const values = [...paths].map((path) => ({ path, bytes: statSync(join(repoRoot, "public", path)).size }));
  const sorted = [...values].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  const totalBytes = values.reduce((sum, item) => sum + item.bytes, 0);
  return {
    count: values.length,
    totalBytes,
    averageBytes: values.length === 0 ? 0 : Math.round(totalBytes / values.length),
    largestBytes: sorted[0]?.bytes ?? 0,
    largest: sorted.slice(0, 5),
  };
}

export function buildMediaPerformanceReport() {
  const model = loadStoryModel();
  const childOnly = new Set(JSON.parse(readFileSync(join(repoRoot, "content/story-editions.json"), "utf8")).childOnly);
  const covers = new Set(model.stories.map((story) => story.cover.replace(/^\//, "")));
  const storyImages = new Set(model.pages.map((page) => page.image.replace(/^\//, "")));
  const narration = new Set(model.pages.map((page) => page.audio.replace(/^\//, "")));
  const hero = "ui/bookshelf-paper.svg";
  const heroBytes = statSync(join(repoRoot, "public", hero)).size;
  const coverStats = stats(covers);
  const storyImageStats = stats(storyImages);
  const narrationStats = stats(narration);
  const issues = [];

  for (const story of model.stories) {
    const childArt = childOnly.has(story.id);
    for (const page of story.pages) {
      const rel = page.image.replace(/^\//, "");
      const isCover = page.kind === "cover";
      const expected = childArt
        ? (isCover ? CHILD_ONLY_COVER_SIZE : CHILD_ONLY_PAGE_SIZE)
        : (isCover ? CLASSIC_LINE_COVER_SIZE : CLASSIC_LINE_PAGE_SIZE);
      const size = readJpegSize(join(repoRoot, "public", rel));
      const ok = isCover
        ? Boolean(size && size.width === expected.width && size.height === expected.height)
        : pageSizeOk(size, expected);
      if (!ok) {
        issues.push(
          `story image size ${jpegSizeLabel(size)} != ${expected.width}x${expected.height}` +
            `${isCover ? "" : ` (alt ${REDRAW_PAGE_SIZE.width}x${REDRAW_PAGE_SIZE.height}|${REDRAW_PAGE_SIZE.height - 1} ok)`}: ${rel}`,
        );
      }
    }
  }

  if (heroBytes > MEDIA_BUDGETS.heroBytes) {
    issues.push(`bookshelf hero exceeds ${MEDIA_BUDGETS.heroBytes} bytes: ${heroBytes}`);
  }
  if (coverStats.largestBytes > MEDIA_BUDGETS.coverBytes) {
    issues.push(`story cover exceeds ${MEDIA_BUDGETS.coverBytes} bytes: ${coverStats.largest[0]?.path} (${coverStats.largestBytes})`);
  }
  if (storyImageStats.largestBytes > MEDIA_BUDGETS.storyImageBytes) {
    issues.push(`story image exceeds ${MEDIA_BUDGETS.storyImageBytes} bytes: ${storyImageStats.largest[0]?.path} (${storyImageStats.largestBytes})`);
  }
  if (narrationStats.largestBytes > MEDIA_BUDGETS.narrationBytes) {
    issues.push(`narration exceeds ${MEDIA_BUDGETS.narrationBytes} bytes: ${narrationStats.largest[0]?.path} (${narrationStats.largestBytes})`);
  }

  return {
    schemaVersion: 1,
    budgets: MEDIA_BUDGETS,
    issues,
    homepage: {
      hero,
      heroBytes,
      coverCount: coverStats.count,
      potentialCoverBytes: coverStats.totalBytes,
      potentialHeroPlusCoverBytes: heroBytes + coverStats.totalBytes,
      averageCoverBytes: coverStats.averageBytes,
      largestCoverBytes: coverStats.largestBytes,
      largestCovers: coverStats.largest,
    },
    library: {
      storyImages: storyImageStats,
      narration: narrationStats,
    },
  };
}

if (process.argv[1]?.endsWith("media-performance.mjs")) {
  const report = buildMediaPerformanceReport();
  const check = process.argv.includes("--check");
  const output = process.argv.includes("--summary")
    ? {
        schemaVersion: report.schemaVersion,
        budgets: report.budgets,
        issues: report.issues,
        homepage: {
          heroBytes: report.homepage.heroBytes,
          coverCount: report.homepage.coverCount,
          potentialCoverBytes: report.homepage.potentialCoverBytes,
          potentialHeroPlusCoverBytes: report.homepage.potentialHeroPlusCoverBytes,
          averageCoverBytes: report.homepage.averageCoverBytes,
          largestCoverBytes: report.homepage.largestCoverBytes,
        },
        library: {
          storyImageCount: report.library.storyImages.count,
          storyImageBytes: report.library.storyImages.totalBytes,
          largestStoryImageBytes: report.library.storyImages.largestBytes,
          narrationCount: report.library.narration.count,
          narrationBytes: report.library.narration.totalBytes,
          largestNarrationBytes: report.library.narration.largestBytes,
        },
      }
    : report;
  console.log(JSON.stringify(output, null, 2));
  if (check && report.issues.length > 0) process.exitCode = 1;
}
