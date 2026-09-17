import { COMMERCE } from "@/data/commerce";
import { writeEntitlement, type Entitlement } from "@/lib/entitlement";

/**
 * DEV-only local annual unlock for manual QA.
 * Do not import from production UI routes — production builds gate this away.
 */
export function grantAnnual(now = Date.now()): Entitlement {
  if (import.meta.env.PROD) {
    throw new Error("grantAnnual is unavailable in production builds");
  }
  const grantedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + COMMERCE.durationDays * 24 * 60 * 60 * 1000).toISOString();
  return writeEntitlement({
    schemaVersion: 1,
    productId: COMMERCE.productId,
    grantedAt,
    expiresAt,
    source: "local-grant",
  });
}
