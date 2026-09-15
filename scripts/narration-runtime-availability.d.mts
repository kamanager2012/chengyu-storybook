export type NarrationRuntimeAvailabilityItem = {
  storyId: string;
  pageId: string;
  src: string;
  audioSha256: string;
};

export function buildNarrationRuntimeAvailability(): NarrationRuntimeAvailabilityItem[];
