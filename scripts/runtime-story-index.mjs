import { loadDraftStoryCatalog } from "./draft-story-catalog.mjs";
import { childCoverPath, syncChildOverlayPublic } from "./child-overlay.mjs";
import { classicCoverPath, syncGongbiClassicPublic } from "./gongbi-classic.mjs";
import { EXPECTED_CHILD_SHELF_COUNT, EXPECTED_CLASSIC_SHELF_COUNT, EXPECTED_SHELF_CARD_COUNT, loadStoryEditions, runtimeStoryEditions } from "./story-editions.mjs";
import { loadStoryModel } from "./story-model.mjs";

const EXPECTED_PUBLISHED_MEDIA_COUNT = 100;
const EXPECTED_DRAFT_MEDIA_COUNT = 0;
const EXPECTED_TEXT_COUNT = 0;

/**
 * @param {{ base?: string }} [options]
 */
export function buildRuntimeStoryIndex(options = {}) {
  const base = typeof options.base === "string" && options.base.length > 0 ? options.base : "/";
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  const publishedStories = loadStoryModel().stories;
  const editions = loadStoryEditions({ publishedIds: publishedStories.map((story) => story.id) });
  syncGongbiClassicPublic({ ids: editions.gongbiClassicIds });
  syncChildOverlayPublic({ ids: editions.childOverlay });
  const childOnlyIds = new Set(editions.childOnly);
  const childOverlayIds = new Set(editions.childOverlay);
  const childShelfIds = new Set([...editions.childOnly, ...editions.childOverlay]);

  function publishedItem(story, hall, cover) {
    return {
      kind: "media",
      id: story.id,
      title: story.title,
      pinyin: story.pinyin,
      tagline: story.tagline,
      tone: story.tone,
      hall,
      cover: `${prefix}${cover}`,
    };
  }

  const childCards = publishedStories
    .filter((story) => childShelfIds.has(story.id))
    .map((story) => publishedItem(story, "child", childOverlayIds.has(story.id) ? childCoverPath(story.id) : story.cover));

  const classicCards = publishedStories.map((story) =>
    publishedItem(story, "classic", childOnlyIds.has(story.id) ? classicCoverPath(story.id) : story.cover),
  );

  const drafts = loadDraftStoryCatalog().stories.map((story) => ({
    kind: "media",
    id: story.id,
    title: story.title,
    pinyin: story.pinyin,
    tagline: story.tagline,
    tone: story.tone,
    hall: "classic",
    cover: `${prefix}/draft-stories/${story.id}/cover.jpg`,
  }));

  if (publishedStories.length !== EXPECTED_PUBLISHED_MEDIA_COUNT) {
    throw new Error(`expected ${EXPECTED_PUBLISHED_MEDIA_COUNT} published media stories, found ${publishedStories.length}`);
  }
  if (childCards.length !== EXPECTED_CHILD_SHELF_COUNT) {
    throw new Error(`expected ${EXPECTED_CHILD_SHELF_COUNT} child-hall cards, found ${childCards.length}`);
  }
  if (classicCards.length !== EXPECTED_CLASSIC_SHELF_COUNT) {
    throw new Error(`expected ${EXPECTED_CLASSIC_SHELF_COUNT} classic-hall cards, found ${classicCards.length}`);
  }
  if (drafts.length !== EXPECTED_DRAFT_MEDIA_COUNT) {
    throw new Error(`expected ${EXPECTED_DRAFT_MEDIA_COUNT} draft media stories, found ${drafts.length}`);
  }

  const index = [...childCards, ...classicCards, ...drafts];
  if (index.length !== EXPECTED_SHELF_CARD_COUNT + EXPECTED_DRAFT_MEDIA_COUNT) {
    throw new Error(`expected ${EXPECTED_SHELF_CARD_COUNT} runtime story index entries, found ${index.length}`);
  }
  if (index.filter((item) => item.kind === "text").length !== EXPECTED_TEXT_COUNT) {
    throw new Error(`expected ${EXPECTED_TEXT_COUNT} text stories, found ${index.filter((item) => item.kind === "text").length}`);
  }

  const keys = new Set();
  const ids = new Set();
  for (const item of index) {
    const key = `${item.id}:${item.hall}`;
    if (keys.has(key)) throw new Error(`duplicate runtime story index card: ${key}`);
    keys.add(key);
    ids.add(item.id);
  }
  if (ids.size !== EXPECTED_PUBLISHED_MEDIA_COUNT) {
    throw new Error(`expected ${EXPECTED_PUBLISHED_MEDIA_COUNT} unique idiom ids, found ${ids.size}`);
  }

  return index;
}

export function buildRuntimeStoryEditions() {
  const publishedStories = loadStoryModel().stories;
  return runtimeStoryEditions(loadStoryEditions({ publishedIds: publishedStories.map((story) => story.id) }));
}
