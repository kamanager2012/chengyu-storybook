export type RuntimeStoryTone = "wheat" | "bamboo" | "bell" | "pasture" | "well" | "temple";
export type RuntimeStoryHall = "child" | "classic";

export type RuntimeStoryIndexItem =
  | {
      kind: "media";
      id: string;
      title: string;
      pinyin: string;
      tagline: string;
      tone: RuntimeStoryTone;
      hall: RuntimeStoryHall;
      cover: string;
    }
  | {
      kind: "text";
      id: string;
      title: string;
      pinyin: string;
      tagline: string;
      tone: RuntimeStoryTone;
      hall: RuntimeStoryHall;
    };

export function buildRuntimeStoryIndex(options?: { base?: string }): RuntimeStoryIndexItem[];

export function buildRuntimeStoryEditions(): {
  childIds: string[];
  childOverlayIds: string[];
  gongbiClassicIds: string[];
  grokChildOverlayIds: string[];
};
