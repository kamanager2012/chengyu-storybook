import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "./config.mjs";
import { startPayServer } from "./index.mjs";
import { createStore } from "./store.mjs";
import { accountsPathFromOrders, createAccountStore, normalizeLoginId } from "./accounts.mjs";

async function withServer(run) {
  const dir = mkdtempSync(join(tmpdir(), "chengyu-pay-acc-"));
  process.env.PAY_DEV_SIMULATE = "1";
  process.env.PAY_STORE_PATH = join(dir, "orders.json");
  process.env.PAY_CORS_ORIGINS = "http://127.0.0.1:8080";
  process.env.NOTIFY_BASE_URL = "http://127.0.0.1:9";
  process.env.WECHAT_APPID = "";
  process.env.WECHAT_MCHID = "";
  process.env.ALIPAY_APP_ID = "";

  const config = loadConfig();
  const store = createStore(config.storePath);
  const accounts = createAccountStore(accountsPathFromOrders(config.storePath));
  const server = await startPayServer({ config, store, accounts, host: "127.0.0.1", port: 0 });
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

test("normalizeLoginId accepts email only", () => {
  assert.equal(normalizeLoginId(" Foo@Example.COM "), "foo@example.com");
  assert.equal(normalizeLoginId("13800138000"), "");
  assert.equal(normalizeLoginId("ab"), "");
  assert.equal(normalizeLoginId("not-an-email"), "");
});

test("register login claim syncs entitlement across sessions", async () => {
  await withServer(async (base) => {
    const registered = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "reader@example.com", password: "password1" }),
    });
    assert.equal(registered.status, 200);
    const sessionA = await registered.json();
    assert.ok(sessionA.token);
    assert.equal(sessionA.account.loginId, "reader@example.com");

    const created = await fetch(`${base}/create`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessionA.token}`,
      },
      body: JSON.stringify({
        productId: "chengyu-storybook-annual-v1",
        channel: "wechat",
        amountFen: 1990,
      }),
    });
    const order = await created.json();
    assert.equal(created.status, 200);
    await fetch(`${base}/dev/simulate-paid/${order.orderId}`, { method: "POST" });

    const claimed = await fetch(`${base}/claim`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessionA.token}`,
      },
      body: JSON.stringify({ orderId: order.orderId }),
    });
    assert.equal(claimed.status, 200);
    const claimBody = await claimed.json();
    assert.equal(claimBody.entitlement.productId, "chengyu-storybook-annual-v1");
    assert.ok(claimBody.account.entitlement);

    const loginB = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "reader@example.com", password: "password1" }),
    });
    assert.equal(loginB.status, 200);
    const sessionB = await loginB.json();
    const me = await fetch(`${base}/auth/me`, {
      headers: { authorization: `Bearer ${sessionB.token}` },
    });
    assert.equal(me.status, 200);
    const meBody = await me.json();
    assert.equal(meBody.entitlement.orderId, order.orderId);
    assert.equal(meBody.entitlement.expiresAt, claimBody.entitlement.expiresAt);
  });
});

test("phone login ids are rejected", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginId: "13800138000", password: "password1" }),
    });
    assert.equal(res.status, 400);
  });
});

test("paid order cannot bind to a second account", async () => {
  await withServer(async (base) => {
    const a = await (
      await fetch(`${base}/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId: "a@example.com", password: "password1" }),
      })
    ).json();
    const b = await (
      await fetch(`${base}/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId: "b@example.com", password: "password1" }),
      })
    ).json();

    const order = await (
      await fetch(`${base}/create`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${a.token}` },
        body: JSON.stringify({
          productId: "chengyu-storybook-annual-v1",
          channel: "alipay",
          amountFen: 1990,
        }),
      })
    ).json();
    await fetch(`${base}/dev/simulate-paid/${order.orderId}`, { method: "POST" });
    const first = await fetch(`${base}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ orderId: order.orderId }),
    });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${b.token}` },
      body: JSON.stringify({ orderId: order.orderId }),
    });
    assert.equal(second.status, 409);
  });
});
