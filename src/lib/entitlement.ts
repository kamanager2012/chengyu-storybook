import { COMMERCE, isFreeStory } from "@/data/commerce";

export const ENTITLEMENT_STORAGE_KEY = "chengyu.entitlement.v1";

export type Entitlement = {
  schemaVersion: 1;
  productId: string;
  grantedAt: string;
  expiresAt: string;
  orderId?: string;
  source?: "pay-claim" | "local-grant" | "account-bound" | "account-sync";
};

function isEntitlement(value: unknown): value is Entitlement {
  if (!value || typeof value !== "object") return false;
  const raw = value as Partial<Entitlement>;
  return (
    raw.schemaVersion === 1 &&
    typeof raw.productId === "string" &&
    typeof raw.grantedAt === "string" &&
    typeof raw.expiresAt === "string"
  );
}

export function readEntitlement(): Entitlement | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ENTITLEMENT_STORAGE_KEY) ?? "null");
    return isEntitlement(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeEntitlement(entitlement: Entitlement): Entitlement {
  if (!isEntitlement(entitlement)) {
    throw new Error("invalid entitlement");
  }
  localStorage.setItem(ENTITLEMENT_STORAGE_KEY, `${JSON.stringify(entitlement)}\n`);
  return entitlement;
}

export function isEntitlementActive(now = Date.now(), entitlement = readEntitlement()): boolean {
  if (!entitlement) return false;
  if (entitlement.productId !== COMMERCE.productId) return false;
  const expires = Date.parse(entitlement.expiresAt);
  return Number.isFinite(expires) && expires > now;
}

export function canReadStory(storyId: string, now = Date.now()): boolean {
  if (!COMMERCE.readGateEnabled) return true;
  return isFreeStory(storyId) || isEntitlementActive(now);
}

/** Local annual grant lives only in `entitlement.dev.ts` (DEV builds / tests). */
export function applyClaimedEntitlement(value: unknown): Entitlement {
  if (!isEntitlement(value)) {
    throw new Error("收款服务返回的权益无效");
  }
  if (value.productId !== COMMERCE.productId) {
    throw new Error("权益商品不匹配");
  }
  // Production builds must not accept forged local-grant payloads via this path.
  if (value.source === "local-grant" && import.meta.env.PROD) {
    throw new Error("本地开通仅开发构建可用，请通过付款领取");
  }
  const source =
    value.source === "account-bound" || value.source === "account-sync" || value.source === "local-grant"
      ? value.source
      : "pay-claim";
  return writeEntitlement({
    schemaVersion: 1,
    productId: value.productId,
    grantedAt: value.grantedAt,
    expiresAt: value.expiresAt,
    orderId: typeof value.orderId === "string" ? value.orderId : undefined,
    source,
  });
}

export function remainingDays(now = Date.now(), entitlement = readEntitlement()): number | null {
  if (!isEntitlementActive(now, entitlement) || !entitlement) return null;
  return Math.ceil((Date.parse(entitlement.expiresAt) - now) / (24 * 60 * 60 * 1000));
}
