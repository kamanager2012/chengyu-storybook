#!/usr/bin/env node
/**
 * Local PAY_DEV_SIMULATE smoke:
 * register → create (wechat) → simulate-paid → claim → /auth/me
 *
 * Usage (pay server already up with PAY_DEV_SIMULATE=1):
 *   node scripts/pay-simulate-smoke.mjs
 *   PAY_API=http://127.0.0.1:8787 node scripts/pay-simulate-smoke.mjs
 */
const base = (process.env.PAY_API || "http://127.0.0.1:8787").replace(/\/$/, "");

async function json(method, path, { body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${method} ${path} → ${res.status} non-JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const email = `sim-${Date.now()}@example.com`;
const password = "SimTest-19.9";

const health = await json("GET", "/health");
assert(health.devSimulate === true, "PAY_DEV_SIMULATE must be on");
assert(health.ok === true, "health.ok");

const reg = await json("POST", "/auth/register", { body: { email, password } });
assert(reg.token, "register token");
const token = reg.token;

const created = await json("POST", "/create", {
  token,
  body: {
    productId: health.productId,
    channel: "wechat",
    amountFen: health.amountFen,
  },
});
assert(created.orderId, "orderId");
assert(created.status === "pending", "pending before simulate");

const paid = await json("POST", `/dev/simulate-paid/${created.orderId}`);
assert(paid.status === "paid", "simulate marks paid");

const claimed = await json("POST", "/claim", {
  token,
  body: { orderId: created.orderId },
});
assert(claimed.entitlement?.productId === health.productId, "claim product");
assert(claimed.entitlement?.expiresAt, "claim expiresAt");

const me = await json("GET", "/auth/me", { token });
assert(me.entitlement?.orderId === created.orderId, "auth/me bound to order");

console.log(
  JSON.stringify(
    {
      ok: true,
      email,
      orderId: created.orderId,
      expiresAt: me.entitlement.expiresAt,
      amountFen: health.amountFen,
    },
    null,
    2,
  ),
);
