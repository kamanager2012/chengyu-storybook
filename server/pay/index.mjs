import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { accountsPathFromOrders, createAccountStore } from "./accounts.mjs";
import { loadConfig } from "./config.mjs";
import { createChannelCheckout, queryChannelPayment, verifyAlipayNotify } from "./channels.mjs";
import { createOrderId, createStore, publicOrder } from "./store.mjs";
import { decryptWechatResource, readWechatNotifyHeaders, verifyWechatNotifySignature } from "./wechat-notify.mjs";

function sendJson(res, status, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  return JSON.parse(raw.toString("utf8"));
}

function readForm(buf) {
  const params = Object.create(null);
  for (const [key, value] of new URLSearchParams(buf.toString("utf8"))) {
    params[key] = value;
  }
  return params;
}

export function startPayServer(options = {}) {
  const config = options.config ?? loadConfig();
  const store = options.store ?? createStore(config.storePath);
  const accounts =
    options.accounts ?? createAccountStore(options.accountsPath ?? accountsPathFromOrders(config.storePath));
  const host = options.host ?? config.host;
  const port = options.port ?? config.port;

  function applyCors(req, res) {
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin.replace(/\/$/, ""))) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "origin");
      res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type, authorization");
    }
  }

  function authFromReq(req) {
    return accounts.resolveSession(req.headers.authorization);
  }

  function buildEntitlementFromOrder(order) {
    const grantedMs = Date.parse(order.paidAt || order.updatedAt || order.createdAt);
    const start = Number.isFinite(grantedMs) ? grantedMs : Date.now();
    return {
      schemaVersion: 1,
      productId: config.commerce.productId,
      grantedAt: new Date(start).toISOString(),
      expiresAt: new Date(start + config.commerce.durationDays * 24 * 60 * 60 * 1000).toISOString(),
      orderId: order.orderId,
      source: "pay-claim",
    };
  }

  function markPaid(orderId, channelTradeNo, message) {
    const current = store.get(orderId);
    if (!current) return null;
    if (current.status === "paid") return current;
    return store.update(orderId, {
      status: "paid",
      message: message || "支付成功，全年册已可开通",
      channelTradeNo,
      paidAt: new Date().toISOString(),
    });
  }

  async function handleCreate(req, res) {
    const body = await readJson(req);
    const channel = body.channel === "alipay" ? "alipay" : body.channel === "wechat" ? "wechat" : null;
    if (!channel) {
      sendJson(res, 400, { error: "channel 必须是 wechat 或 alipay" });
      return;
    }
    if (body.productId && body.productId !== config.commerce.productId) {
      sendJson(res, 400, { error: "productId 不匹配" });
      return;
    }
    if (body.amountFen != null && Number(body.amountFen) !== config.commerce.amountFen) {
      sendJson(res, 400, { error: "amountFen 不匹配全年册定价" });
      return;
    }
    if (!config.devSimulate && channel === "wechat" && !config.wechat.ready) {
      sendJson(res, 503, { error: "微信收款尚未配置完成" });
      return;
    }
    if (!config.devSimulate && channel === "alipay" && !config.alipay.ready) {
      sendJson(res, 503, { error: "支付宝收款尚未配置完成" });
      return;
    }

    const session = authFromReq(req);
    const now = new Date().toISOString();
    const draft = {
      orderId: createOrderId(),
      productId: config.commerce.productId,
      channel,
      amountFen: config.commerce.amountFen,
      status: "pending",
      message: "正在创建收款单",
      createdAt: now,
      updatedAt: now,
      accountId: session?.account?.accountId,
    };
    store.save(draft);

    try {
      const checkout = await createChannelCheckout(config, channel, draft);
      const saved = store.update(draft.orderId, {
        status: "pending",
        message: checkout.message,
        qrCode: checkout.qrCode,
        payUrl: checkout.payUrl,
        qrImageDataUrl: checkout.qrImageDataUrl,
      });
      sendJson(res, 200, publicOrder(saved));
    } catch (error) {
      const failed = store.update(draft.orderId, {
        status: "failed",
        message: error instanceof Error ? error.message : "下单失败",
      });
      const status = error?.code === "CHANNEL_UNCONFIGURED" ? 503 : 502;
      sendJson(res, status, {
        error: failed?.message || "下单失败",
        orderId: draft.orderId,
        channel,
        status: "failed",
        message: failed?.message || "下单失败",
      });
    }
  }

  async function handleWechatNotify(req, res) {
    const rawBuf = await readBody(req);
    const raw = rawBuf.toString("utf8");
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { code: "FAIL", message: "invalid json" });
      return;
    }

    const trustUnsigned =
      config.devSimulate ||
      ["1", "true", "yes"].includes(String(process.env.WECHAT_NOTIFY_TRUST_UNSIGNED || "").toLowerCase());

    let resourcePlain = null;
    if (trustUnsigned) {
      resourcePlain = payload?.resource?.out_trade_no
        ? payload.resource
        : {
            out_trade_no: payload?.out_trade_no,
            trade_state: payload?.trade_state || "SUCCESS",
            transaction_id: payload?.transaction_id,
            amount: payload?.amount,
          };
    } else {
      if (!config.wechat.notifyReady) {
        sendJson(res, 501, {
          code: "FAIL",
          message: "Configure WECHAT_PLATFORM_CERT + 32-char WECHAT_APIV3_KEY for notify verify/decrypt",
        });
        return;
      }
      const headers = readWechatNotifyHeaders(req.headers);
      const ok = verifyWechatNotifySignature({
        platformPublicKey: config.wechat.platformCert,
        timestamp: headers.timestamp,
        nonce: headers.nonce,
        body: raw,
        signature: headers.signature,
      });
      if (!ok) {
        sendJson(res, 401, { code: "FAIL", message: "invalid signature" });
        return;
      }
      try {
        resourcePlain = decryptWechatResource(config.wechat.apiV3Key, payload.resource);
      } catch (error) {
        sendJson(res, 400, {
          code: "FAIL",
          message: error instanceof Error ? error.message : "decrypt failed",
        });
        return;
      }
    }

    const outTradeNo = resourcePlain?.out_trade_no;
    const tradeState = resourcePlain?.trade_state || "SUCCESS";
    if (!outTradeNo || tradeState !== "SUCCESS") {
      sendJson(res, 400, { code: "FAIL", message: "missing paid trade" });
      return;
    }
    const order = store.get(String(outTradeNo));
    if (!order) {
      sendJson(res, 404, { code: "FAIL", message: "order not found" });
      return;
    }
    if (order.amountFen && resourcePlain?.amount?.total && Number(resourcePlain.amount.total) !== order.amountFen) {
      sendJson(res, 400, { code: "FAIL", message: "amount mismatch" });
      return;
    }
    markPaid(order.orderId, resourcePlain?.transaction_id, "微信支付成功");
    sendJson(res, 200, { code: "SUCCESS", message: "成功" });
  }

  async function handleAlipayNotify(req, res) {
    const params = readForm(await readBody(req));
    const trustUnsigned =
      config.devSimulate ||
      ["1", "true", "yes"].includes(String(process.env.ALIPAY_NOTIFY_TRUST_UNSIGNED || "").toLowerCase());
    if (!trustUnsigned) {
      if (!config.alipay.publicKey) {
        sendText(res, 501, "fail");
        return;
      }
      if (!verifyAlipayNotify(config, params)) {
        sendText(res, 400, "fail");
        return;
      }
    }
    if (!params.out_trade_no) {
      sendText(res, 400, "fail");
      return;
    }
    if (String(params.trade_status || "") !== "TRADE_SUCCESS" && String(params.trade_status || "") !== "TRADE_FINISHED") {
      sendText(res, 200, "success");
      return;
    }
    const order = store.get(String(params.out_trade_no));
    if (!order) {
      sendText(res, 404, "fail");
      return;
    }
    if (params.total_amount) {
      const fen = Math.round(Number(params.total_amount) * 100);
      if (fen !== order.amountFen) {
        sendText(res, 400, "fail");
        return;
      }
    }
    markPaid(order.orderId, params.trade_no, "支付宝支付成功");
    sendText(res, 200, "success");
  }

  async function handleSimulatePaid(_req, res, orderId) {
    if (!config.devSimulate) {
      sendJson(res, 403, { error: "PAY_DEV_SIMULATE 未开启" });
      return;
    }
    const order = markPaid(orderId, `dev-${Date.now()}`, "开发模拟支付成功");
    if (!order) {
      sendJson(res, 404, { error: "订单不存在" });
      return;
    }
    sendJson(res, 200, publicOrder(order));
  }

  async function handleClaim(req, res) {
    const body = await readJson(req);
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!orderId) {
      sendJson(res, 400, { error: "orderId 必填" });
      return;
    }
    const order = store.get(orderId);
    if (!order) {
      sendJson(res, 404, { error: "订单不存在" });
      return;
    }
    if (order.status !== "paid") {
      sendJson(res, 409, { error: "订单尚未支付成功", status: order.status });
      return;
    }

    const entitlement = buildEntitlementFromOrder(order);
    const session = authFromReq(req);
    let account = session?.account ?? null;

    if (session) {
      if (order.claimedAccountId && order.claimedAccountId !== session.account.accountId) {
        sendJson(res, 409, { error: "该订单已绑定其他账号" });
        return;
      }
      account = accounts.setEntitlement(session.account.accountId, {
        ...entitlement,
        source: "account-bound",
      });
      store.update(orderId, {
        claimedAccountId: session.account.accountId,
        accountId: order.accountId || session.account.accountId,
      });
      if (account?.entitlement) {
        entitlement.grantedAt = account.entitlement.grantedAt;
        entitlement.expiresAt = account.entitlement.expiresAt;
        entitlement.source = account.entitlement.source || "account-bound";
      }
    }

    sendJson(res, 200, {
      entitlement,
      account,
      order: publicOrder(store.get(orderId) || order),
    });
  }

  async function handleAuthRegister(req, res) {
    const body = await readJson(req);
    try {
      const result = accounts.register(body.email ?? body.loginId, body.password);
      sendJson(res, 200, result);
    } catch (error) {
      const code = error?.code;
      const status = code === "EXISTS" ? 409 : code === "BAD_LOGIN" || code === "BAD_PASSWORD" ? 400 : 500;
      sendJson(res, status, { error: error instanceof Error ? error.message : "注册失败" });
    }
  }

  async function handleAuthLogin(req, res) {
    const body = await readJson(req);
    try {
      const result = accounts.login(body.email ?? body.loginId, body.password);
      sendJson(res, 200, result);
    } catch (error) {
      const status = error?.code === "AUTH" ? 401 : 500;
      sendJson(res, status, { error: error instanceof Error ? error.message : "登录失败" });
    }
  }

  async function handleAuthMe(req, res) {
    const session = authFromReq(req);
    if (!session) {
      sendJson(res, 401, { error: "未登录" });
      return;
    }
    const account = accounts.getAccount(session.account.accountId);
    sendJson(res, 200, {
      account,
      entitlement: account?.entitlement ?? null,
    });
  }

  async function handleAuthLogout(req, res) {
    accounts.logout(req.headers.authorization);
    sendJson(res, 200, { ok: true });
  }

  const server = createServer((req, res) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const { pathname } = url;

    Promise.resolve()
      .then(async () => {
        if (req.method === "GET" && pathname === "/health") {
          sendJson(res, 200, {
            ok: true,
            productId: config.commerce.productId,
            amountFen: config.commerce.amountFen,
            notifyBaseConfigured: Boolean(config.notifyBase),
            wechatReady: config.wechat.ready,
            wechatNotifyReady: config.wechat.notifyReady,
            alipayReady: config.alipay.ready,
            accountsEnabled: true,
            devSimulate: config.devSimulate,
          });
          return;
        }
        if (req.method === "POST" && pathname === "/auth/register") {
          await handleAuthRegister(req, res);
          return;
        }
        if (req.method === "POST" && pathname === "/auth/login") {
          await handleAuthLogin(req, res);
          return;
        }
        if (req.method === "POST" && pathname === "/auth/logout") {
          await handleAuthLogout(req, res);
          return;
        }
        if (req.method === "GET" && pathname === "/auth/me") {
          await handleAuthMe(req, res);
          return;
        }
        if (req.method === "POST" && pathname === "/create") {
          await handleCreate(req, res);
          return;
        }
        if (req.method === "GET" && pathname.startsWith("/order/")) {
          let order = store.get(decodeURIComponent(pathname.slice("/order/".length)));
          if (!order) {
            sendJson(res, 404, { error: "订单不存在" });
            return;
          }
          if (order.status === "pending") {
            try {
              const paid = await queryChannelPayment(config, order);
              if (paid?.paid) {
                order = markPaid(order.orderId, paid.channelTradeNo, paid.message) || order;
              }
            } catch {
              // Keep pending; client continues polling. Notify remains primary.
            }
          }
          sendJson(res, 200, publicOrder(order));
          return;
        }
        if (req.method === "POST" && pathname === "/notify/wechat") {
          await handleWechatNotify(req, res);
          return;
        }
        if (req.method === "POST" && pathname === "/notify/alipay") {
          await handleAlipayNotify(req, res);
          return;
        }
        if (req.method === "POST" && pathname.startsWith("/dev/simulate-paid/")) {
          await handleSimulatePaid(req, res, decodeURIComponent(pathname.slice("/dev/simulate-paid/".length)));
          return;
        }
        if (req.method === "POST" && pathname === "/claim") {
          await handleClaim(req, res);
          return;
        }
        sendJson(res, 404, { error: "not found" });
      })
      .catch((error) => {
        sendJson(res, 500, { error: error instanceof Error ? error.message : "server error" });
      });
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => resolve(server));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  startPayServer({ config }).then((server) => {
    console.log(
      JSON.stringify({
        listening: server.address(),
        productId: config.commerce.productId,
        amountFen: config.commerce.amountFen,
        wechatReady: config.wechat.ready,
        alipayReady: config.alipay.ready,
        devSimulate: config.devSimulate,
      }),
    );
  });
}
