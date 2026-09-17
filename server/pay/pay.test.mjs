import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "./config.mjs";
import { startPayServer } from "./index.mjs";
import { createStore } from "./store.mjs";

async function withServer(run) {
  const dir = mkdtempSync(join(tmpdir(), "chengyu-pay-"));
  process.env.PAY_DEV_SIMULATE = "1";
  process.env.PAY_STORE_PATH = join(dir, "orders.json");
  process.env.PAY_CORS_ORIGINS = "http://127.0.0.1:8080";
  process.env.NOTIFY_BASE_URL = "http://127.0.0.1:9";
  process.env.WECHAT_APPID = "";
  process.env.WECHAT_MCHID = "";
  process.env.ALIPAY_APP_ID = "";

  const config = loadConfig();
  const store = createStore(config.storePath);
  const server = await startPayServer({ config, store, host: "127.0.0.1", port: 0 });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
}

test("pay health reports product pricing", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.productId, "chengyu-storybook-annual-v1");
    assert.equal(body.amountFen, 1990);
    assert.equal(body.devSimulate, true);
    assert.equal(body.claimRequiresAuth, false);
    assert.equal(body.wechatTrustUnsigned, false);
    assert.equal(body.alipayTrustUnsigned, false);
    assert.equal(body.productionUnsafe, false);
    assert.equal(body.productionGuardsOk, false);
  });
});

test("create + simulate-paid marks annual order paid", async () => {
  await withServer(async (base) => {
    const created = await fetch(`${base}/create`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:8080" },
      body: JSON.stringify({
        productId: "chengyu-storybook-annual-v1",
        channel: "wechat",
        amountFen: 1990,
      }),
    });
    assert.equal(created.status, 200);
    const order = await created.json();
    assert.equal(order.status, "pending");
    assert.ok(order.orderId);
    assert.match(String(order.qrCode), /^dev:\/\/simulate\//);
    assert.match(String(order.qrImageDataUrl || ""), /^data:image\/png;base64,/);
    assert.match(String(order.message || ""), /二维码/);

    const paidRes = await fetch(`${base}/dev/simulate-paid/${order.orderId}`, { method: "POST" });
    assert.equal(paidRes.status, 200);
    const paid = await paidRes.json();
    assert.equal(paid.status, "paid");

    const got = await fetch(`${base}/order/${order.orderId}`);
    assert.equal(got.status, 200);
    const body = await got.json();
    assert.equal(body.status, "paid");
    assert.equal(body.orderId, order.orderId);
    assert.equal(body.channel, "wechat");
    assert.equal(body.qrCode, undefined);
    assert.equal(body.payUrl, undefined);
    assert.equal(body.qrImageDataUrl, undefined);
    assert.equal(body.amountFen, undefined);
    assert.equal(body.productId, undefined);
    assert.equal(body.paidAt, undefined);
  });
});

test("claim returns entitlement only after paid", async () => {
  await withServer(async (base) => {
    const created = await fetch(`${base}/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: "chengyu-storybook-annual-v1",
        channel: "alipay",
        amountFen: 1990,
      }),
    });
    const order = await created.json();

    const early = await fetch(`${base}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: order.orderId }),
    });
    assert.equal(early.status, 409);

    await fetch(`${base}/dev/simulate-paid/${order.orderId}`, { method: "POST" });
    const claimed = await fetch(`${base}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: order.orderId }),
    });
    assert.equal(claimed.status, 200);
    const body = await claimed.json();
    assert.equal(body.entitlement.schemaVersion, 1);
    assert.equal(body.entitlement.productId, "chengyu-storybook-annual-v1");
    assert.equal(body.entitlement.orderId, order.orderId);
    assert.equal(body.entitlement.source, "pay-claim");
    assert.ok(Date.parse(body.entitlement.expiresAt) > Date.parse(body.entitlement.grantedAt));

    // Dev anonymous claim is one-shot — blocks orderId wash.
    const again = await fetch(`${base}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: order.orderId }),
    });
    assert.equal(again.status, 409);
  });
});

test("production claim requires login", async () => {
  const dir = mkdtempSync(join(tmpdir(), "chengyu-pay-prod-"));
  process.env.PAY_DEV_SIMULATE = "0";
  process.env.PAY_STORE_PATH = join(dir, "orders.json");
  process.env.PAY_CORS_ORIGINS = "http://127.0.0.1:8080";
  process.env.NOTIFY_BASE_URL = "https://pay.example.com";
  process.env.WECHAT_APPID = "";
  process.env.WECHAT_MCHID = "";
  process.env.ALIPAY_APP_ID = "";
  process.env.WECHAT_NOTIFY_TRUST_UNSIGNED = "0";
  process.env.ALIPAY_NOTIFY_TRUST_UNSIGNED = "0";

  const config = loadConfig();
  assert.equal(config.claimRequiresAuth, true);
  assert.equal(config.productionGuardsOk, true);
  const store = createStore(config.storePath);
  const now = new Date().toISOString();
  store.save({
    orderId: "cy-prod-claim-1",
    productId: config.commerce.productId,
    channel: "wechat",
    amountFen: config.commerce.amountFen,
    status: "paid",
    message: "fixture",
    createdAt: now,
    updatedAt: now,
    paidAt: now,
  });
  const server = await startPayServer({ config, store, host: "127.0.0.1", port: 0 });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.devSimulate, false);
    assert.equal(health.claimRequiresAuth, true);
    assert.equal(health.productionGuardsOk, true);
    assert.equal(health.productionUnsafe, false);

    const anon = await fetch(`${base}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "cy-prod-claim-1" }),
    });
    assert.equal(anon.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
    process.env.PAY_DEV_SIMULATE = "1";
  }
});


test("GET /order returns status-only fields (no QR/amount oracle)", async () => {
  await withServer(async (base) => {
    const created = await fetch(`${base}/create`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:8080" },
      body: JSON.stringify({
        productId: "chengyu-storybook-annual-v1",
        channel: "alipay",
        amountFen: 1990,
      }),
    });
    assert.equal(created.status, 200);
    const order = await created.json();
    assert.ok(order.qrCode);
    assert.ok(order.amountFen === 1990 || order.productId);

    const got = await fetch(`${base}/order/${order.orderId}`);
    assert.equal(got.status, 200);
    const body = await got.json();
    assert.equal(body.status, "pending");
    assert.equal(body.orderId, order.orderId);
    assert.equal(body.channel, "alipay");
    assert.ok(typeof body.message === "string");
    assert.deepEqual(Object.keys(body).sort(), ["channel", "message", "orderId", "status"]);
  });
});

test("rejects mismatched amountFen", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: "chengyu-storybook-annual-v1",
        channel: "alipay",
        amountFen: 1,
      }),
    });
    assert.equal(res.status, 400);
  });
});
