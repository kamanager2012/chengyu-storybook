#!/usr/bin/env node
/**
 * Production pay /health acceptance gate (code-side anti-misread).
 *
 * Does NOT claim "真收款生产级＝是". It only verifies the JSON shape operators
 * must see before opening real QR payment. Looking at productionGuardsOk alone
 * is not enough — notify base + channel ready flags are required too.
 *
 * Usage:
 *   PAY_API=https://pay.example.com npm run pay:prod-health
 *   PAY_API=http://127.0.0.1:8787 PAY_REQUIRE_CHANNELS=wechat,alipay npm run pay:prod-health
 *
 * Env:
 *   PAY_API                 — pay origin, no trailing slash (default http://127.0.0.1:8787)
 *   PAY_REQUIRE_CHANNELS    — comma list: wechat and/or alipay (default wechat,alipay)
 *
 * Exit 0 only when all production assertions pass. Simulate / incomplete merchant
 * configs must FAIL (non-zero).
 */
const base = (process.env.PAY_API || "http://127.0.0.1:8787").replace(/\/$/, "");
const channels = String(process.env.PAY_REQUIRE_CHANNELS || "wechat,alipay")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const missing = [];

function need(cond, label) {
  if (!cond) missing.push(label);
}

function expectEq(actual, expected, label) {
  if (actual !== expected) {
    missing.push(`${label}=${JSON.stringify(actual)} (want ${JSON.stringify(expected)})`);
  }
}

const res = await fetch(`${base}/health`);
const text = await res.text();
let body;
try {
  body = text ? JSON.parse(text) : null;
} catch {
  console.error(`FAIL  GET ${base}/health → ${res.status} non-JSON: ${text.slice(0, 200)}`);
  process.exit(1);
}

if (!res.ok || !body || typeof body !== "object") {
  console.error(`FAIL  GET ${base}/health → HTTP ${res.status}: ${text.slice(0, 300)}`);
  process.exit(1);
}

console.log(`PAY_API=${base}`);
console.log(`PAY_REQUIRE_CHANNELS=${channels.join(",") || "(none)"}`);
console.log("health=", JSON.stringify(body));

// Guards — never accept simulate / unsigned notify as production-ready.
expectEq(body.devSimulate, false, "devSimulate");
expectEq(body.productionUnsafe, false, "productionUnsafe");
expectEq(body.productionGuardsOk, true, "productionGuardsOk");
expectEq(body.claimRequiresAuth, true, "claimRequiresAuth");
expectEq(body.wechatTrustUnsigned, false, "wechatTrustUnsigned");
expectEq(body.alipayTrustUnsigned, false, "alipayTrustUnsigned");

// Topology — productionGuardsOk alone is insufficient.
need(body.notifyBaseConfigured === true, "notifyBaseConfigured=true (NOTIFY_BASE_URL)");

if (channels.length === 0) {
  missing.push("PAY_REQUIRE_CHANNELS empty (set wechat and/or alipay)");
}

if (channels.includes("wechat")) {
  need(body.wechatReady === true, "wechatReady=true");
  need(body.wechatNotifyReady === true, "wechatNotifyReady=true");
}
if (channels.includes("alipay")) {
  need(body.alipayReady === true, "alipayReady=true");
}

if (missing.length) {
  console.error("FAIL  pay prod health — missing / wrong:");
  for (const item of missing) console.error(`  - ${item}`);
  console.error(
    "NOTE  This is a code-side gate only. Passing it does not by itself mean 真收款生产级＝是.",
  );
  process.exit(1);
}

console.log("PASS  pay prod health assertions ok (guards + notifyBase + required channels).");
console.log("NOTE  Still not a product claim of 真收款生产级＝是 — merchant/ops remain outside this script.");
process.exit(0);
