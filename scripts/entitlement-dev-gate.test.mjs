import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entitlementSrc = readFileSync(new URL("../src/lib/entitlement.ts", import.meta.url), "utf8");
const devSrc = readFileSync(new URL("../src/lib/entitlement.dev.ts", import.meta.url), "utf8");

test("grantAnnual is not exported from production entitlement module", () => {
  assert.equal(/export function grantAnnual\b/.test(entitlementSrc), false);
  assert.match(entitlementSrc, /entitlement\.dev\.ts/);
  assert.match(entitlementSrc, /local-grant.*PROD|PROD.*local-grant/s);
});

test("grantAnnual lives only in entitlement.dev.ts and throws in PROD", () => {
  assert.match(devSrc, /export function grantAnnual/);
  assert.match(devSrc, /import\.meta\.env\.PROD/);
  assert.match(devSrc, /unavailable in production builds/);
});
