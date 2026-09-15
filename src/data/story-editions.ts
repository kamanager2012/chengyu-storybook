import classicHallSource from "../../content/classic-hall-sections.json";
import type { Story } from "./stories";
import type { StoryHall } from "./story-index";

type StoryEditions = {
  childIds: string[];
  childOverlayIds: string[];
  gongbiClassicIds: string[];
  grokChildOverlayIds: string[];
};

type ClassicHallSource = {
  schemaVersion: 1;
  stories: Record<string, { sections: string[]; title?: string }>;
};

declare const __STORY_EDITIONS__: StoryEditions;

export const storyEditions = __STORY_EDITIONS__;

const childIdSet = new Set(storyEditions.childIds);
const childOverlayIdSet = new Set(storyEditions.childOverlayIds);
const gongbiClassicIdSet = new Set(storyEditions.gongbiClassicIds);
const grokChildOverlayIdSet = new Set(storyEditions.grokChildOverlayIds);

const classicHallSections = classicHallSource as ClassicHallSource;
const classicSectionsById = new Map(
  Object.entries(classicHallSections.stories ?? {}).map(([id, entry]) => [id, entry.sections]),
);

export function hasGongbiClassic(id: string): boolean {
  return gongbiClassicIdSet.has(id);
}

export function hasChildOverlay(id: string): boolean {
  return childOverlayIdSet.has(id);
}

export function hasGrokChildOverlay(id: string): boolean {
  return grokChildOverlayIdSet.has(id);
}

export function resolveStoryHall(id: string, hall?: StoryHall): StoryHall {
  if (hall === "child" || hall === "classic") return hall;
  return childIdSet.has(id) ? "child" : "classic";
}

function remapStoryImages(story: Story, fromDir: string, toDir: string, ext?: { from: RegExp; to: string }): Story {
  const from = `/${fromDir}/${story.id}/`;
  const to = `/${toDir}/${story.id}/`;
  const remap = (url: string) => {
    const next = url.replace(from, to);
    return ext ? next.replace(ext.from, ext.to) : next;
  };
  return {
    ...story,
    cover: remap(story.cover),
    pages: story.pages.map((page) => ({ ...page, image: remap(page.image) })),
  };
}

export function illustrationAttribution(id: string, hall?: StoryHall): string {
  const resolved = resolveStoryHall(id, hall);
  if (resolved === "child" && hasChildOverlay(id)) {
    return hasGrokChildOverlay(id) ? "儿童馆插图 · Created with Grok" : "儿童馆插图 · AI 生成";
  }
  if (resolved === "classic" && hasGongbiClassic(id)) return "古风馆插图 · 工笔线";
  return "插图 · Created with Grok";
}

function remapOverlayClassicCopy(story: Story, sections: string[]): Story {
  if (!Array.isArray(sections) || sections.length !== 7) return story;
  const textByPage = new Map(sections.map((text, index) => [`p${index + 1}`, text]));
  const fromAudio = `/audio/${story.id}/`;
  const toAudio = `/audio-classic/${story.id}/`;
  return {
    ...story,
    pages: story.pages.map((page) => {
      const classicText = textByPage.get(page.id);
      if (!classicText) return page;
      return {
        ...page,
        text: classicText,
        audio: page.audio.includes(fromAudio) ? page.audio.replace(fromAudio, toAudio) : page.audio,
      };
    }),
  };
}

export function storyForHall(story: Story, hall?: StoryHall): Story {
  const resolved = resolveStoryHall(story.id, hall);
  let next = story;
  if (resolved === "classic" && hasGongbiClassic(story.id)) {
    next = remapStoryImages(next, "stories", "classic-stories");
  } else if (resolved === "child" && hasChildOverlay(story.id)) {
    next = remapStoryImages(next, "stories", "child-stories");
  }
  // Dual-hall copy: published.sections is 儿童馆; classic-hall-sections is 古风馆 when present.
  if (resolved === "classic") {
    const sections = classicSectionsById.get(story.id);
    if (sections) next = remapOverlayClassicCopy(next, sections);
  }
  return next;
}
