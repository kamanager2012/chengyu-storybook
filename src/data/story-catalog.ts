import type { Story } from "./stories";

export type DraftStory = {
  id: string;
  title: string;
  pinyin: string;
  tagline: string;
  meaning: string;
  moral: string;
  tone: Story["tone"];
  sections: [string, string, string, string, string, string, string];
};

export const draftStories: DraftStory[] = [];

if (draftStories.length !== 0) throw new Error(`expected 0 remaining draft stories, found ${draftStories.length}`);

export function getDraftStory(id: string): DraftStory | undefined {
  return draftStories.find((story) => story.id === id);
}

export const draftMediaStories: Story[] = [];

export function getDraftMediaStory(id: string): Story | undefined {
  return draftMediaStories.find((story) => story.id === id);
}
