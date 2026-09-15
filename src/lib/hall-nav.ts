import { storyIndex, type StoryHall, type StoryIndexItem } from "@/data/story-index";

export function storiesInHall(hall: StoryHall): StoryIndexItem[] {
  return storyIndex.filter((item) => item.hall === hall);
}

/** Next media title in the same hall (wraps). Used on the moral/end page. */
export function nextStoryInHall(storyId: string, hall: StoryHall): Extract<StoryIndexItem, { kind: "media" }> | null {
  const items = storiesInHall(hall).filter((item): item is Extract<StoryIndexItem, { kind: "media" }> => item.kind === "media");
  if (items.length === 0) return null;
  const index = items.findIndex((item) => item.id === storyId);
  if (index < 0) return items[0] ?? null;
  return items[(index + 1) % items.length] ?? null;
}
