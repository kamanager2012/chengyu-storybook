import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * @typedef {"pending" | "paid" | "failed"} OrderStatus
 * @typedef {{
 *   orderId: string,
 *   productId: string,
 *   channel: "wechat" | "alipay",
 *   amountFen: number,
 *   status: OrderStatus,
 *   message: string,
 *   qrCode?: string,
 *   payUrl?: string,
 *   qrImageDataUrl?: string,
 *   channelTradeNo?: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   paidAt?: string,
 * }} PayOrderRecord
 */

export function createOrderId() {
  return `cy${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
}

export function createStore(storePath) {
  mkdirSync(dirname(storePath), { recursive: true });

  /** @returns {Record<string, PayOrderRecord>} */
  function readAll() {
    if (!existsSync(storePath)) return {};
    try {
      const parsed = JSON.parse(readFileSync(storePath, "utf8"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  /** @param {Record<string, PayOrderRecord>} all */
  function writeAll(all) {
    const tmp = `${storePath}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(all, null, 2)}\n`);
    renameSync(tmp, storePath);
  }

  return {
    /** @param {PayOrderRecord} order */
    save(order) {
      const all = readAll();
      all[order.orderId] = order;
      writeAll(all);
      return order;
    },
    /** @param {string} orderId */
    get(orderId) {
      return readAll()[orderId] ?? null;
    },
    /**
     * @param {string} orderId
     * @param {Partial<PayOrderRecord>} patch
     */
    update(orderId, patch) {
      const all = readAll();
      const current = all[orderId];
      if (!current) return null;
      const next = {
        ...current,
        ...patch,
        orderId: current.orderId,
        updatedAt: new Date().toISOString(),
      };
      all[orderId] = next;
      writeAll(all);
      return next;
    },
  };
}

/** @param {PayOrderRecord} order */
export function publicOrder(order) {
  return {
    orderId: order.orderId,
    channel: order.channel,
    status: order.status,
    message: order.message,
    qrCode: order.qrCode,
    payUrl: order.payUrl,
    qrImageDataUrl: order.qrImageDataUrl,
    amountFen: order.amountFen,
    productId: order.productId,
    paidAt: order.paidAt,
  };
}

/** Poll/lookup view: no QR / amount / product — reduces orderId oracle surface. */
export function publicOrderStatus(order) {
  return {
    orderId: order.orderId,
    channel: order.channel,
    status: order.status,
    message: order.message,
  };
}
