import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const commerce = JSON.parse(readFileSync(new URL("../content/commerce.json", import.meta.url), "utf8"));

test("annual catalog is twelve free classics at 19.9 for 365 days", () => {
  assert.equal(commerce.schemaVersion, 1);
  assert.equal(commerce.priceYuan, 19.9);
  assert.equal(commerce.durationDays, 365);
  assert.equal(commerce.freeCount, 12);
  assert.equal(commerce.catalogCount, 100);
  assert.equal(commerce.readGateEnabled, true);
  assert.equal(commerce.freeStoryIds.length, 12);
  assert.equal(commerce.freeStoryIds[0], "shou-zhu");
  assert.equal(commerce.freeStoryIds[11], "yu-gong");
  assert.equal(new Set(commerce.freeStoryIds).size, 12);
  assert.deepEqual(commerce.payChannels, ["wechat", "alipay"]);
  assert.equal(commerce.priceFen, 1990);
});
