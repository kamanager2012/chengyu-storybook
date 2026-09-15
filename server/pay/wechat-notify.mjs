import { createDecipheriv, createVerify } from "node:crypto";

/**
 * WeChat Pay APIv3 notification helpers.
 * @see https://pay.weixin.qq.com/doc/v3/merchant/4012071382
 */

export function decryptWechatResource(apiV3Key, resource) {
  if (!apiV3Key || apiV3Key.length !== 32) {
    throw new Error("WECHAT_APIV3_KEY must be 32 characters");
  }
  if (!resource?.ciphertext || !resource?.nonce) {
    throw new Error("missing wechat resource ciphertext");
  }
  const ciphertext = Buffer.from(String(resource.ciphertext), "base64");
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(String(resource.nonce), "utf8"));
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(String(resource.associated_data), "utf8"));
  }
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

export function verifyWechatNotifySignature({
  platformPublicKey,
  timestamp,
  nonce,
  body,
  signature,
}) {
  if (!platformPublicKey || !timestamp || !nonce || body == null || !signature) {
    return false;
  }
  const message = `${timestamp}\n${nonce}\n${body}\n`;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(message);
  verifier.end();
  try {
    return verifier.verify(platformPublicKey, signature, "base64");
  } catch {
    return false;
  }
}

export function readWechatNotifyHeaders(headers) {
  return {
    timestamp: headers["wechatpay-timestamp"] || headers["Wechatpay-Timestamp"],
    nonce: headers["wechatpay-nonce"] || headers["Wechatpay-Nonce"],
    signature: headers["wechatpay-signature"] || headers["Wechatpay-Signature"],
    serial: headers["wechatpay-serial"] || headers["Wechatpay-Serial"],
  };
}
