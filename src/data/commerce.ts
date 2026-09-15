import source from "../../content/commerce.json";

export const COMMERCE = {
  productId: source.productId,
  currency: source.currency,
  priceYuan: source.priceYuan,
  priceFen: source.priceFen,
  durationDays: source.durationDays,
  freeCount: source.freeCount,
  catalogCount: source.catalogCount,
  readGateEnabled: source.readGateEnabled === true,
  freeStoryIds: source.freeStoryIds,
  payChannels: source.payChannels,
} as const;

export type PayChannel = (typeof COMMERCE.payChannels)[number];

export function isFreeStory(storyId: string): boolean {
  return COMMERCE.freeStoryIds.includes(storyId);
}
