import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const commerce = JSON.parse(readFileSync(new URL("../content/commerce.json", import.meta.url), "utf8"));

const freeSet = new Set(commerce.freeStoryIds);

/** Mirrors `canReadStory` in src/lib/entitlement.ts for regression without a browser bundle. */
function canReadStory(storyId, { readGateEnabled, hasActiveEntitlement }) {
  if (!readGateEnabled) return true;
  return freeSet.has(storyId) || hasActiveEntitlement;
}

test("annual catalog keeps twelve free classics at 19.9 for 365 days with read gate on", () => {
  assert.equal(commerce.schemaVersion, 1);
  assert.equal(commerce.priceYuan, 19.9);
  assert.equal(commerce.durationDays, 365);
  assert.equal(commerce.freeCount, 12);
  assert.equal(commerce.catalogCount, 100);
  assert.equal(commerce.readGateEnabled, true);
  assert.equal(commerce.freeStoryIds.length, 12);
  assert.equal(commerce.freeStoryIds[0], "shou-zhu");
  assert.equal(commerce.freeStoryIds[11], "yu-gong");
  assert.equal(freeSet.size, 12);
  assert.deepEqual(commerce.payChannels, ["wechat", "alipay"]);
  assert.equal(commerce.priceFen, 1990);
});

test("read gate blocks non-free stories without active entitlement", () => {
  assert.equal(canReadStory("shou-zhu", { readGateEnabled: true, hasActiveEntitlement: false }), true);
  assert.equal(canReadStory("yu-gong", { readGateEnabled: true, hasActiveEntitlement: false }), true);
  assert.equal(canReadStory("ye-gong", { readGateEnabled: true, hasActiveEntitlement: false }), false);
  assert.equal(canReadStory("wo-xin", { readGateEnabled: true, hasActiveEntitlement: false }), false);
});

test("active entitlement unlocks catalog when read gate is on", () => {
  assert.equal(canReadStory("ye-gong", { readGateEnabled: true, hasActiveEntitlement: true }), true);
  assert.equal(canReadStory("wo-xin", { readGateEnabled: true, hasActiveEntitlement: true }), true);
});

test("read gate off opens entire catalog (emergency downgrade only)", () => {
  assert.equal(canReadStory("ye-gong", { readGateEnabled: false, hasActiveEntitlement: false }), true);
});

test("commerce adapter treats readGateEnabled as strict boolean true", () => {
  const entitlementSrc = readFileSync(new URL("../src/lib/entitlement.ts", import.meta.url), "utf8");
  const commerceSrc = readFileSync(new URL("../src/data/commerce.ts", import.meta.url), "utf8");
  assert.match(entitlementSrc, /if \(!COMMERCE\.readGateEnabled\) return true;/);
  assert.match(commerceSrc, /readGateEnabled: source\.readGateEnabled === true/);
  assert.equal(commerce.readGateEnabled, true);
});
