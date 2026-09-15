export type NarrationAvailabilityItem = {
  storyId: string;
  pageId: string;
  src: string;
  audioSha256: string;
};

declare const __NARRATION_AVAILABILITY__: NarrationAvailabilityItem[];

export const narrationAvailability = __NARRATION_AVAILABILITY__;

const byKey = new Map(narrationAvailability.map((item) => [`${item.storyId}/${item.pageId}`, item]));

export function getNarrationAvailability(storyId: string, pageId: string): NarrationAvailabilityItem | undefined {
  return byKey.get(`${storyId}/${pageId}`);
}
