import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");

function readCommerce() {
  const raw = JSON.parse(readFileSync(join(repoRoot, "content/commerce.json"), "utf8"));
  return {
    productId: String(raw.productId),
    amountFen: Number(raw.priceFen),
    currency: String(raw.currency ?? "CNY"),
    durationDays: Number(raw.durationDays),
    payChannels: Array.isArray(raw.payChannels) ? raw.payChannels.map(String) : [],
  };
}

function env(name, fallback = "") {
  const value = process.env[name];
  return value == null || value === "" ? fallback : String(value);
}

function envFlag(name) {
  return ["1", "true", "yes", "on"].includes(env(name, "0").toLowerCase());
}

function normalizePem(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/") || /^[A-Za-z]:\\/.test(trimmed)) {
    return readFileSync(trimmed, "utf8").trim();
  }
  return trimmed.replace(/\\n/g, "\n");
}

function splitOrigins(value) {
  return value
    .split(",")
    .map((part) => part.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function loadConfig() {
  const commerce = readCommerce();
  const notifyBase = env("NOTIFY_BASE_URL").replace(/\/$/, "");
  const wechatPrivateKey = normalizePem(env("WECHAT_PRIVATE_KEY"));
  const wechatPlatformCert = normalizePem(env("WECHAT_PLATFORM_CERT"));
  const alipayPrivateKey = normalizePem(env("ALIPAY_PRIVATE_KEY"));
  const alipayPublicKey = normalizePem(env("ALIPAY_PUBLIC_KEY"));

  const wechatReady = Boolean(
    env("WECHAT_APPID") &&
      env("WECHAT_MCHID") &&
      env("WECHAT_APIV3_KEY") &&
      env("WECHAT_SERIAL_NO") &&
      wechatPrivateKey &&
      notifyBase,
  );
  const wechatNotifyReady = Boolean(wechatReady && wechatPlatformCert && env("WECHAT_APIV3_KEY").length === 32);
  const alipayReady = Boolean(env("ALIPAY_APP_ID") && alipayPrivateKey && alipayPublicKey && notifyBase);

  return {
    commerce,
    host: env("PAY_HOST", "127.0.0.1"),
    port: Number(env("PAY_PORT", "8787")) || 8787,
    notifyBase,
    corsOrigins: splitOrigins(env("PAY_CORS_ORIGINS", "http://127.0.0.1:8080,http://localhost:8080")),
    storePath: env("PAY_STORE_PATH", join(here, ".pay-data", "orders.json")),
    devSimulate: envFlag("PAY_DEV_SIMULATE"),
    wechat: {
      ready: wechatReady,
      notifyReady: wechatNotifyReady,
      appId: env("WECHAT_APPID"),
      mchId: env("WECHAT_MCHID"),
      apiV3Key: env("WECHAT_APIV3_KEY"),
      serialNo: env("WECHAT_SERIAL_NO"),
      privateKey: wechatPrivateKey,
      platformCert: wechatPlatformCert,
    },
    alipay: {
      ready: alipayReady,
      appId: env("ALIPAY_APP_ID"),
      privateKey: alipayPrivateKey,
      publicKey: alipayPublicKey,
      gateway: env("ALIPAY_GATEWAY", "https://openapi.alipay.com/gateway.do"),
    },
  };
}
