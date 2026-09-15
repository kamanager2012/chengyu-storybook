import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_CHILD_OVERLAY_COUNT,
  EXPECTED_CHILD_OVERLAY_IDS,
  EXPECTED_GROK_CHILD_OVERLAY_COUNT,
  assertChildOverlayInventory,
  grokChildOverlayIds,
} from "./child-overlay.mjs";

export const STORY_EDITIONS_PATH = "content/story-editions.json";
export const EXPECTED_CHILD_ONLY_COUNT = 24;
export const EXPECTED_CLASSIC_ONLY_COUNT = 76;
export const EXPECTED_CLASSIC_SHELF_COUNT = 100;
export { EXPECTED_CHILD_OVERLAY_COUNT };
export const EXPECTED_CHILD_SHELF_COUNT = EXPECTED_CHILD_ONLY_COUNT + EXPECTED_CHILD_OVERLAY_COUNT;
export const EXPECTED_SHELF_CARD_COUNT = EXPECTED_CHILD_SHELF_COUNT + EXPECTED_CLASSIC_SHELF_COUNT;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function nonEmptyId(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function loadStoryEditions(options = {}) {
  const root = options.root ? resolve(options.root) : repoRoot;
  const sourcePath = join(root, STORY_EDITIONS_PATH);
  const parsed = JSON.parse(readFileSync(sourcePath, "utf8"));
  const errors = [];

  if (parsed?.schemaVersion !== 1) errors.push("story editions must use schemaVersion 1");
  if (!Array.isArray(parsed?.childOnly)) errors.push("story editions must include a childOnly array");

  const childOnly = [];
  const seen = new Set();
  for (const [index, value] of (Array.isArray(parsed?.childOnly) ? parsed.childOnly : []).entries()) {
    if (!nonEmptyId(value)) {
      errors.push(`childOnly[${index}] is not a valid story id`);
      continue;
    }
    if (seen.has(value)) {
      errors.push(`duplicate childOnly id: ${value}`);
      continue;
    }
    seen.add(value);
    childOnly.push(value);
  }

  if (childOnly.length !== EXPECTED_CHILD_ONLY_COUNT) {
    errors.push(`childOnly must contain exactly ${EXPECTED_CHILD_ONLY_COUNT} ids, got ${childOnly.length}`);
  }

  const publishedIds = Array.isArray(options.publishedIds) ? options.publishedIds : null;
  const hallById = new Map();
  if (publishedIds) {
    const published = new Set(publishedIds);
    for (const id of childOnly) {
      if (!published.has(id)) errors.push(`childOnly id is not in the published catalog: ${id}`);
    }
    for (const id of publishedIds) {
      hallById.set(id, seen.has(id) ? "child" : "classic");
    }
    const classicOnlyCount = [...hallById.values()].filter((hall) => hall === "classic").length;
    if (classicOnlyCount !== EXPECTED_CLASSIC_ONLY_COUNT) {
      errors.push(`public/stories classic-only set must contain exactly ${EXPECTED_CLASSIC_ONLY_COUNT} stories, got ${classicOnlyCount}`);
    }
    for (const id of EXPECTED_CHILD_OVERLAY_IDS) {
      if (!published.has(id)) errors.push(`child overlay id is not in the published catalog: ${id}`);
      if (seen.has(id)) errors.push(`child overlay id must not also be childOnly: ${id}`);
    }
  }

  if (!options.skipChildOverlayInventory) {
    try {
      assertChildOverlayInventory(EXPECTED_CHILD_OVERLAY_IDS, root);
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid story editions:\n${errors.join("\n")}`);
  }

  const classicCount = publishedIds ? publishedIds.length - childOnly.length : EXPECTED_CLASSIC_ONLY_COUNT;
  const classicShelfCount = publishedIds ? publishedIds.length : EXPECTED_CLASSIC_SHELF_COUNT;
  const childOverlay = [...EXPECTED_CHILD_OVERLAY_IDS];
  const childShelfCount = childOnly.length + childOverlay.length;

  return {
    schemaVersion: 1,
    sourcePath,
    childOnly,
    childOverlay,
    gongbiClassicIds: childOnly,
    hallById,
    childCount: childOnly.length,
    childShelfCount,
    classicCount,
    classicShelfCount,
    shelfCardCount: childShelfCount + classicShelfCount,
  };
}

export function hallForStoryId(id, editions) {
  if (editions?.hallById?.has(id)) return editions.hallById.get(id);
  return editions?.childOnly?.includes(id) ? "child" : "classic";
}

export function shelfHallsForStoryId(id, editions) {
  if (editions?.childOnly?.includes(id) || editions?.childOverlay?.includes(id)) return ["child", "classic"];
  return ["classic"];
}

export function runtimeStoryEditions(editions) {
  const grokOverlayIds = grokChildOverlayIds(editions.childOverlay ?? EXPECTED_CHILD_OVERLAY_IDS);
  if (grokOverlayIds.length !== EXPECTED_GROK_CHILD_OVERLAY_COUNT) {
    throw new Error(
      `runtime editions expected ${EXPECTED_GROK_CHILD_OVERLAY_COUNT} Grok Imagine child overlays, got ${grokOverlayIds.length}`,
    );
  }
  return {
    childIds: editions.childOnly,
    childOverlayIds: editions.childOverlay ?? [],
    gongbiClassicIds: editions.gongbiClassicIds ?? editions.childOnly,
    grokChildOverlayIds: grokOverlayIds,
  };
}
