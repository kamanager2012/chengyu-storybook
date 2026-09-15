import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { verifyAlipayNotify } from "./channels.mjs";

function signAlipayParams(privateKeyPem, params) {
  const content = Object.keys(params)
    .filter((key) => !["sign", "sign_type"].includes(key) && params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  const signer = createSign("RSA-SHA256");
  signer.update(content, "utf8");
  return signer.sign(privateKeyPem, "base64");
}

test("verifyAlipayNotify accepts RSA2 signed form", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
  const publicPem = publicKey.export({ type: "spki", format: "pem" });
  const params = {
    out_trade_no: "cy-ali-1",
    trade_status: "TRADE_SUCCESS",
    total_amount: "19.90",
    trade_no: "2026091422001",
    sign_type: "RSA2",
  };
  params.sign = signAlipayParams(privatePem, params);
  assert.equal(verifyAlipayNotify({ alipay: { publicKey: publicPem } }, params), true);

  const bad = { ...params, sign: "not-a-real-signature" };
  assert.equal(verifyAlipayNotify({ alipay: { publicKey: publicPem } }, bad), false);
});

test("verifyAlipayNotify accepts bare base64 public key", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
  const publicPem = publicKey.export({ type: "spki", format: "pem" });
  const bare = publicPem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
  const params = {
    out_trade_no: "cy-ali-2",
    trade_status: "TRADE_SUCCESS",
    total_amount: "19.90",
    sign_type: "RSA2",
  };
  params.sign = signAlipayParams(privatePem, params);
  assert.equal(verifyAlipayNotify({ alipay: { publicKey: bare } }, params), true);
});
