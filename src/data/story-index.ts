export type StoryIndexTone = "wheat" | "bamboo" | "bell" | "pasture" | "well" | "temple";
export type StoryHall = "child" | "classic";

export type StoryIndexItem =
  | {
      kind: "media";
      id: string;
      title: string;
      pinyin: string;
      tagline: string;
      tone: StoryIndexTone;
      hall: StoryHall;
      cover: string;
    }
  | {
      kind: "text";
      id: string;
      title: string;
      pinyin: string;
      tagline: string;
      tone: StoryIndexTone;
      hall: StoryHall;
    };

declare const __STORY_INDEX__: StoryIndexItem[];

export const storyIndex = __STORY_INDEX__;
