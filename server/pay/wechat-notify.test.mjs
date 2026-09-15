import assert from "node:assert/strict";
import { createCipheriv, generateKeyPairSync, createSign } from "node:crypto";
import test from "node:test";
import { decryptWechatResource, verifyWechatNotifySignature } from "./wechat-notify.mjs";

test("decryptWechatResource round-trips APIv3 payload", () => {
  const apiV3Key = "0123456789abcdef0123456789abcdef";
  const nonce = "n".repeat(12);
  const associated = "transaction";
  const plain = {
    out_trade_no: "cytestorder1",
    trade_state: "SUCCESS",
    transaction_id: "wx123",
    amount: { total: 1990, currency: "CNY" },
  };
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(nonce, "utf8"));
  cipher.setAAD(Buffer.from(associated, "utf8"));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(plain), "utf8"), cipher.final()]);
  const ciphertext = Buffer.concat([encrypted, cipher.getAuthTag()]).toString("base64");
  const decoded = decryptWechatResource(apiV3Key, {
    ciphertext,
    nonce,
    associated_data: associated,
  });
  assert.equal(decoded.out_trade_no, "cytestorder1");
  assert.equal(decoded.trade_state, "SUCCESS");
  assert.equal(decoded.amount.total, 1990);
});

test("verifyWechatNotifySignature accepts valid RSA-SHA256", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const timestamp = "1710000000";
  const nonce = "random-nonce";
  const body = '{"id":"evt"}';
  const message = `${timestamp}\n${nonce}\n${body}\n`;
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  const signature = signer.sign(privateKey, "base64");
  assert.equal(
    verifyWechatNotifySignature({
      platformPublicKey: publicKey.export({ type: "spki", format: "pem" }),
      timestamp,
      nonce,
      body,
      signature,
    }),
    true,
  );
  assert.equal(
    verifyWechatNotifySignature({
      platformPublicKey: publicKey.export({ type: "spki", format: "pem" }),
      timestamp,
      nonce,
      body,
      signature: "aaaa",
    }),
    false,
  );
});
