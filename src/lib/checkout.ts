import { COMMERCE, type PayChannel } from "@/data/commerce";
import { accountAuthHeaders } from "@/lib/account";

export type PayOrder = {
  orderId: string;
  channel: PayChannel;
  status: "unconfigured" | "pending" | "paid" | "failed";
  message: string;
  qrCode?: string;
  payUrl?: string;
  qrImageDataUrl?: string;
};

const payApi =
  typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env.VITE_PAY_API === "string"
    ? import.meta.env.VITE_PAY_API.replace(/\/$/, "")
    : "";

export function isPayConfigured(): boolean {
  return payApi.length > 0;
}

export function payApiBase(): string {
  return payApi;
}

export async function createPayOrder(channel: PayChannel): Promise<PayOrder> {
  if (!COMMERCE.payChannels.includes(channel)) {
    return { orderId: "", channel, status: "failed", message: "不支持的收款方式" };
  }
  if (!payApi) {
    return {
      orderId: "",
      channel,
      status: "unconfigured",
      message: "全年册付款通道即将开放，当前可先阅读免费故事。",
    };
  }

  const response = await fetch(`${payApi}/create`, {
    method: "POST",
    headers: accountAuthHeaders(),
    body: JSON.stringify({
      productId: COMMERCE.productId,
      channel,
      amountFen: COMMERCE.priceFen,
    }),
  });
  const payload = (await response.json()) as Partial<PayOrder> & { error?: string };
  if (!response.ok) {
    return {
      orderId: payload.orderId ?? "",
      channel,
      status: "failed",
      message: payload.error ?? payload.message ?? "下单没有成功",
    };
  }
  return normalizeOrder(channel, payload);
}

export async function fetchPayOrder(orderId: string, channel: PayChannel): Promise<PayOrder> {
  if (!payApi || !orderId) {
    return { orderId, channel, status: "failed", message: "无法查询订单" };
  }
  const response = await fetch(`${payApi}/order/${encodeURIComponent(orderId)}`);
  const payload = (await response.json()) as Partial<PayOrder> & { error?: string };
  if (!response.ok) {
    return {
      orderId,
      channel,
      status: "failed",
      message: payload.error ?? "查询订单失败",
    };
  }
  return normalizeOrder(channel, payload);
}

export type ClaimedEntitlementPayload = {
  schemaVersion: 1;
  productId: string;
  grantedAt: string;
  expiresAt: string;
  orderId?: string;
  source?: string;
};

export async function claimPayEntitlement(orderId: string): Promise<ClaimedEntitlementPayload> {
  if (!payApi || !orderId) {
    throw new Error("无法领取权益");
  }
  const response = await fetch(`${payApi}/claim`, {
    method: "POST",
    headers: accountAuthHeaders(),
    body: JSON.stringify({ orderId }),
  });
  const payload = (await response.json()) as {
    error?: string;
    entitlement?: ClaimedEntitlementPayload;
  };
  if (!response.ok || !payload.entitlement) {
    throw new Error(payload.error ?? "领取权益失败");
  }
  return payload.entitlement;
}

function normalizeOrder(channel: PayChannel, payload: Partial<PayOrder>): PayOrder {
  const status =
    payload.status === "pending" || payload.status === "paid" || payload.status === "failed"
      ? payload.status
      : "failed";
  return {
    orderId: payload.orderId ?? "",
    channel,
    status,
    message: payload.message ?? "",
    qrCode: payload.qrCode,
    payUrl: payload.payUrl,
    qrImageDataUrl: payload.qrImageDataUrl,
  };
}
