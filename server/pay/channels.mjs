import { createSign, createVerify, randomBytes } from "node:crypto";
import QRCode from "qrcode";

function assertChannel(config, channel) {
  if (!config.commerce.payChannels.includes(channel)) {
    const error = new Error(`unsupported channel: ${channel}`);
    error.code = "BAD_CHANNEL";
    throw error;
  }
}

function wechatAuth(config, method, pathWithQuery, body) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const message = `${method}\n${pathWithQuery}\n${timestamp}\n${nonce}\n${body}\n`;
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  const signature = signer.sign(config.wechat.privateKey, "base64");
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.wechat.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.wechat.serialNo}"`;
}

async function createWechatNative(config, order) {
  if (config.devSimulate) {
    return {
      qrCode: `dev://simulate/${order.orderId}`,
      message: "开发模拟：页面会显示二维码示意；真实到账请终端 simulate-paid。",
    };
  }
  if (!config.wechat.ready) {
    const error = new Error("微信收款未配置齐（商户号/证书/NOTIFY_BASE_URL）");
    error.code = "CHANNEL_UNCONFIGURED";
    throw error;
  }

  const path = "/v3/pay/transactions/native";
  const payload = {
    appid: config.wechat.appId,
    mchid: config.wechat.mchId,
    description: "成语绘本全年册",
    out_trade_no: order.orderId,
    notify_url: `${config.notifyBase}/notify/wechat`,
    amount: { total: order.amountFen, currency: "CNY" },
  };
  const body = JSON.stringify(payload);
  const response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: wechatAuth(config, "POST", path, body),
    },
    body,
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok || !data?.code_url) {
    const error = new Error(data?.message || data?.code || `微信下单失败 HTTP ${response.status}`);
    error.code = "CHANNEL_ERROR";
    error.detail = data;
    throw error;
  }
  return {
    qrCode: String(data.code_url),
    message: "请用微信扫一扫付款",
  };
}

function alipaySign(config, params) {
  const content = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== "" && key !== "sign")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  const signer = createSign("RSA-SHA256");
  signer.update(content, "utf8");
  return signer.sign(config.alipay.privateKey, "base64");
}

function wrapAlipayPublicKey(pemOrKey) {
  const trimmed = String(pemOrKey || "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("BEGIN")) return trimmed;
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) || [body];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
}

export function verifyAlipayNotify(config, params) {
  const publicKey = wrapAlipayPublicKey(config.alipay.publicKey);
  if (!publicKey) return false;
  const sign = params.sign;
  const signType = params.sign_type || "RSA2";
  if (!sign || signType !== "RSA2") return false;
  const content = Object.keys(params)
    .filter((key) => !["sign", "sign_type"].includes(key) && params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(content, "utf8");
  return verifier.verify(publicKey, sign, "base64");
}

async function alipayGatewayCall(config, method, bizContent, extraParams = {}) {
  const params = {
    app_id: config.alipay.appId,
    method,
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
    version: "1.0",
    biz_content: typeof bizContent === "string" ? bizContent : JSON.stringify(bizContent),
    ...extraParams,
  };
  params.sign = alipaySign(config, params);
  const response = await fetch(config.alipay.gateway, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { response, data };
}

async function createAlipayPrecreate(config, order) {
  if (config.devSimulate) {
    return {
      qrCode: `dev://simulate/${order.orderId}`,
      message: "开发模拟：页面会显示二维码示意；真实到账请终端 simulate-paid。",
    };
  }
  if (!config.alipay.ready) {
    const error = new Error("支付宝收款未配置齐（AppId/密钥/NOTIFY_BASE_URL）");
    error.code = "CHANNEL_UNCONFIGURED";
    throw error;
  }

  const { response, data } = await alipayGatewayCall(
    config,
    "alipay.trade.precreate",
    {
      out_trade_no: order.orderId,
      total_amount: (order.amountFen / 100).toFixed(2),
      subject: "成语绘本全年册",
    },
    { notify_url: `${config.notifyBase}/notify/alipay` },
  );
  const result = data?.alipay_trade_precreate_response;
  if (!result || result.code !== "10000" || !result.qr_code) {
    const error = new Error(result?.sub_msg || result?.msg || `支付宝下单失败 HTTP ${response.status}`);
    error.code = "CHANNEL_ERROR";
    error.detail = data;
    throw error;
  }
  return {
    qrCode: String(result.qr_code),
    message: "请用支付宝扫一扫付款",
  };
}

/**
 * Active query after user scans. Used when async notify is delayed or missed.
 * @returns {{ paid: boolean, channelTradeNo?: string, message?: string } | null}
 */
export async function queryChannelPayment(config, order) {
  if (!order?.orderId || order.status === "paid") return null;
  if (config.devSimulate) return null;

  if (order.channel === "wechat") {
    if (!config.wechat.ready) return null;
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.orderId)}?mchid=${encodeURIComponent(config.wechat.mchId)}`;
    const response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: wechatAuth(config, "GET", path, ""),
      },
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return null;
    }
    if (!response.ok) return null;
    if (data?.trade_state !== "SUCCESS") return null;
    if (data?.amount?.total != null && Number(data.amount.total) !== order.amountFen) return null;
    return {
      paid: true,
      channelTradeNo: data.transaction_id ? String(data.transaction_id) : undefined,
      message: "微信支付成功",
    };
  }

  if (order.channel === "alipay") {
    if (!config.alipay.ready) return null;
    const { data } = await alipayGatewayCall(config, "alipay.trade.query", {
      out_trade_no: order.orderId,
    });
    const result = data?.alipay_trade_query_response;
    if (!result || result.code !== "10000") return null;
    const status = String(result.trade_status || "");
    if (status !== "TRADE_SUCCESS" && status !== "TRADE_FINISHED") return null;
    if (result.total_amount != null) {
      const fen = Math.round(Number(result.total_amount) * 100);
      if (fen !== order.amountFen) return null;
    }
    return {
      paid: true,
      channelTradeNo: result.trade_no ? String(result.trade_no) : undefined,
      message: "支付宝支付成功",
    };
  }

  return null;
}

async function withQrImage(result) {
  if (!result?.qrCode) return result;
  try {
    const qrImageDataUrl = await QRCode.toDataURL(String(result.qrCode), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    });
    return { ...result, qrImageDataUrl };
  } catch {
    return result;
  }
}

/**
 * @param {ReturnType<import("./config.mjs").loadConfig>} config
 * @param {"wechat" | "alipay"} channel
 * @param {import("./store.mjs").PayOrderRecord} order
 */
export async function createChannelCheckout(config, channel, order) {
  assertChannel(config, channel);
  if (channel === "wechat") return withQrImage(await createWechatNative(config, order));
  return withQrImage(await createAlipayPrecreate(config, order));
}
