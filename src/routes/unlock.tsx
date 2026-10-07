import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Petals } from "@/components/petals";
import { SiteFooter } from "@/components/site-footer";
import { COMMERCE, type PayChannel } from "@/data/commerce";
import {
  loginAccount,
  logoutAccount,
  readCachedLoginId,
  readSessionToken,
  registerAccount,
  syncAccountEntitlement,
} from "@/lib/account";
import { claimPayEntitlement, createPayOrder, fetchPayOrder, isPayConfigured, type PayOrder } from "@/lib/checkout";
import { useDocumentTitle } from "@/lib/document-title";
import { applyClaimedEntitlement, isEntitlementActive, remainingDays } from "@/lib/entitlement";

export const Route = createFileRoute("/unlock")({
  validateSearch: (search: Record<string, unknown>): { from?: string } => {
    return typeof search.from === "string" ? { from: search.from } : {};
  },
  component: UnlockPage,
});

function UnlockPage() {
  useDocumentTitle("开通全年册");
  const { from } = Route.useSearch();
  const [active, setActive] = useState(() => isEntitlementActive());
  const [days, setDays] = useState(() => remainingDays());
  const payReady = isPayConfigured();
  const [busy, setBusy] = useState<PayChannel | null>(null);
  const [order, setOrder] = useState<PayOrder | null>(null);
  const [loginId, setLoginId] = useState(() => readCachedLoginId() ?? "");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(() => (readSessionToken() ? readCachedLoginId() : null));
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  function refreshEntitlementUi() {
    setActive(isEntitlementActive());
    setDays(remainingDays());
  }

  const activateFromPaidOrder = useCallback(async (orderId: string) => {
    const entitlement = await claimPayEntitlement(orderId);
    applyClaimedEntitlement(entitlement);
    refreshEntitlementUi();
    if (readSessionToken()) {
      const profile = await syncAccountEntitlement();
      if (profile?.loginId) setSignedInAs(profile.loginId);
      refreshEntitlementUi();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!payReady || !readSessionToken()) return;
      try {
        const profile = await syncAccountEntitlement();
        if (cancelled) return;
        if (profile?.loginId) setSignedInAs(profile.loginId);
        refreshEntitlementUi();
      } catch {
        if (!cancelled) setSignedInAs(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payReady]);

  useEffect(() => {
    if (!order?.orderId || order.status !== "pending") return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        const next = await fetchPayOrder(order.orderId, order.channel);
        if (cancelled) return;
        // GET /order returns status-only; keep QR from create so the pending UI stays usable.
        setOrder((prev) => ({
          ...next,
          qrCode: next.qrCode ?? prev?.qrCode,
          payUrl: next.payUrl ?? prev?.payUrl,
          qrImageDataUrl: next.qrImageDataUrl ?? prev?.qrImageDataUrl,
        }));
        if (next.status === "paid") {
          try {
            await activateFromPaidOrder(next.orderId);
          } catch (error) {
            setOrder({
              ...next,
              message: error instanceof Error ? error.message : "支付已到账，但领取权益失败，请刷新重试",
            });
          }
        }
      })();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [order?.orderId, order?.status, order?.channel, activateFromPaidOrder]);

  async function pay(channel: PayChannel) {
    if (!payReady) return;
    if (!readSessionToken()) {
      setAuthMessage("请先用邮箱注册或登录，再付款。权益挂在账号上，换设备登录同一邮箱即可继续读。");
      return;
    }
    setBusy(channel);
    try {
      const next = await createPayOrder(channel);
      setOrder(next);
      if (next.status === "paid" && next.orderId) {
        await activateFromPaidOrder(next.orderId);
      }
    } catch (error) {
      setOrder({
        orderId: "",
        channel,
        status: "failed",
        message: error instanceof Error ? error.message : "开通失败",
      });
    } finally {
      setBusy(null);
    }
  }

  async function runAuth(mode: "login" | "register") {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const session = mode === "login" ? await loginAccount(loginId, password) : await registerAccount(loginId, password);
      setSignedInAs(session.account.loginId);
      setPassword("");
      setAuthMessage(mode === "login" ? "已登录，可在其他设备同步权益" : "账号已创建并登录");
      if (order?.status === "paid" && order.orderId) {
        await activateFromPaidOrder(order.orderId);
      } else {
        refreshEntitlementUi();
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setAuthBusy(false);
    }
  }

  async function runLogout() {
    await logoutAccount();
    setSignedInAs(null);
    setAuthMessage("已退出登录（本机开通状态仍保留到有效期）");
  }

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <Petals />
      <div className="relative mx-auto w-full max-w-lg px-4 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-sm text-muted">
          回书架
        </Link>
        <p className="mt-6 text-sm tracking-[0.35em] text-muted">双馆 · 翻页有声 · 全年册</p>
        <h1 className="mt-1 font-display text-4xl text-cinnabar">开通全部 {COMMERCE.catalogCount} 本</h1>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          先免费试看 {COMMERCE.freeCount} 本。开通后儿童馆与古风馆全部可翻，有效期 {COMMERCE.durationDays}{" "}
          天，不用跟大平台比集数。阅读门是产品门禁，不是防下载／防直链的硬 DRM。
        </p>

        {payReady ? (
          <section className="mt-6 rounded-[32px] bg-panel p-6 shadow-panel ring-1 ring-line/70">
            <p className="text-sm text-muted">账号（付款前必填）</p>
            <p className="mt-1 text-sm leading-6 text-ink-soft">
              必须先用邮箱注册或登录再付款。全年册挂在该邮箱账号上；换手机、清缓存后，登录同一邮箱即可恢复，不要只靠本机开通状态。
            </p>
            {signedInAs ? (
              <div className="mt-4 space-y-3">
                <p className="rounded-2xl bg-bamboo/20 px-4 py-3 text-sm text-ink">已登录：{signedInAs}</p>
                <button
                  type="button"
                  className="inline-flex h-10 w-full items-center justify-center rounded-full bg-paper text-sm text-ink"
                  onClick={() => void runLogout()}
                >
                  退出登录
                </button>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm text-ink-soft">
                  邮箱
                  <input
                    type="email"
                    value={loginId}
                    onChange={(event) => setLoginId(event.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    className="h-11 rounded-2xl bg-paper px-4 text-ink outline-none ring-1 ring-line/70 focus:ring-cinnabar/40"
                    placeholder="you@example.com"
                  />
                </label>
                <label className="grid gap-1 text-sm text-ink-soft">
                  密码（至少 8 位）
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    className="h-11 rounded-2xl bg-paper px-4 text-ink outline-none ring-1 ring-line/70 focus:ring-cinnabar/40"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={authBusy}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-4 text-sm text-panel disabled:opacity-60"
                    onClick={() => void runAuth("login")}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    disabled={authBusy}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-cinnabar px-4 text-sm text-panel disabled:opacity-60"
                    onClick={() => void runAuth("register")}
                  >
                    注册
                  </button>
                </div>
              </div>
            )}
            {authMessage ? <p className="mt-3 text-xs text-muted">{authMessage}</p> : null}
          </section>
        ) : null}

        <section className="mt-6 rounded-[32px] bg-panel p-6 shadow-panel ring-1 ring-line/70">
          <p className="text-sm text-muted">一次开通</p>
          <p className="mt-1 font-display text-5xl text-ink">
            {COMMERCE.priceYuan}
            <span className="ml-1 text-xl text-ink-soft">元 / 年</span>
          </p>
          <ul className="mt-5 space-y-2 text-sm text-ink-soft">
            <li>{COMMERCE.catalogCount} 本翻页有声绘本，童书＋古风两套图</li>
            <li>开通后一年内可反复阅读，约一杯奶茶的年价</li>
            <li>须先登录邮箱再付款；换设备靠同一邮箱登录，不是靠本机缓存</li>
          </ul>
          {active ? (
            <p className="mt-6 rounded-2xl bg-bamboo/20 px-4 py-3 text-sm text-ink">已开通，还剩 {days} 天。</p>
          ) : payReady ? (
            <div className="mt-6 grid gap-3">
              {!signedInAs ? (
                <p className="rounded-2xl bg-paper px-4 py-3 text-sm leading-6 text-cinnabar">
                  请先在上方用邮箱注册或登录，然后才能扫码付款。换设备继续阅读也靠同一邮箱。
                </p>
              ) : null}
              <button
                type="button"
                disabled={busy !== null || !signedInAs}
                onClick={() => void pay("wechat")}
                className="inline-flex h-12 items-center justify-center rounded-full bg-cinnabar px-6 text-panel disabled:opacity-60"
              >
                {busy === "wechat" ? "正在生成二维码…" : "微信扫码支付"}
              </button>
              <button
                type="button"
                disabled={busy !== null || !signedInAs}
                onClick={() => void pay("alipay")}
                className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-panel disabled:opacity-60"
              >
                {busy === "alipay" ? "正在生成二维码…" : "支付宝扫码支付"}
              </button>
              {order ? (
                <div className="rounded-2xl bg-paper px-4 py-3 text-sm leading-6 text-ink-soft">
                  <p>{order.message || `订单 ${order.status}`}</p>
                  {order.orderId ? <p className="mt-1 text-xs text-muted">单号 {order.orderId}</p> : null}
                  {order.status === "pending" && order.qrCode ? (
                    <div className="mt-3 space-y-3">
                      {order.qrImageDataUrl ? (
                        <div className="mx-auto w-fit rounded-2xl bg-white p-3 shadow-sm">
                          <img
                            alt={order.channel === "wechat" ? "微信付款码" : "支付宝付款码"}
                            width={220}
                            height={220}
                            className="block"
                            src={order.qrImageDataUrl}
                          />
                        </div>
                      ) : (
                        <p className="break-all text-xs text-muted">{order.qrCode}</p>
                      )}
                      <p className="text-center text-xs text-muted">
                        {order.qrCode.startsWith("dev://")
                          ? "开发模式二维码仅作示意，不会真实扣款"
                          : order.channel === "wechat"
                            ? "打开微信 → 扫一扫 → 确认支付"
                            : "打开支付宝 → 扫一扫 → 确认支付"}
                      </p>
                      {order.qrCode.startsWith("dev://") ? (
                        <p className="text-xs text-muted">
                          模拟到账：
                          <code className="mx-1 rounded bg-panel px-1">
                            curl -X POST http://127.0.0.1:8787/dev/simulate-paid/{order.orderId}
                          </code>
                        </p>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex h-10 w-full items-center justify-center rounded-full bg-panel text-sm text-ink"
                          onClick={() => void navigator.clipboard.writeText(order.qrCode || "")}
                        >
                          复制付款码链接
                        </button>
                      )}
                    </div>
                  ) : null}
                  {order.status === "pending" && order.payUrl ? (
                    <a className="mt-2 inline-block text-cinnabar underline" href={order.payUrl} target="_blank" rel="noreferrer">
                      打开支付页
                    </a>
                  ) : null}
                  {order.status === "pending" ? (
                    <p className="mt-2 text-xs text-muted">付款成功后本页会自动开通，请稍候…</p>
                  ) : null}
                  {order.status === "paid" ? (
                    <div className="mt-3 space-y-2">
                      <button
                        type="button"
                        className="inline-flex h-10 w-full items-center justify-center rounded-full bg-cinnabar text-sm text-panel"
                        onClick={() => void activateFromPaidOrder(order.orderId)}
                      >
                        重新领取权益
                      </button>
                      {!signedInAs ? (
                        <p className="text-xs text-cinnabar">生产环境必须登录后才能领取。请先在上方注册/登录，再点「重新领取」；换设备也靠同一邮箱。</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p data-pay-pending="true" className="mt-6 rounded-2xl bg-paper px-4 py-3 text-sm leading-6 text-ink-soft">
              全年册付款通道尚未接入公网（本站构建时未配置 VITE_PAY_API）。阅读门已开：除免费 {COMMERCE.freeCount} 本外，其余故事会提示开通全年册，但在此环境下暂时无法完成付费。通道开通后即可用微信或支付宝购买。
            </p>
          )}
        </section>

        <div className="mt-6 flex flex-col gap-3">
          {from ? (
            <Link
              to="/story/$id"
              params={{ id: from }}
              className="inline-flex h-12 items-center justify-center rounded-full bg-panel px-6 text-ink shadow-panel"
            >
              {active ? "继续读刚才那本" : "先去看免费故事"}
            </Link>
          ) : null}
          <Link
            to="/"
            className="inline-flex h-12 items-center justify-center rounded-full bg-panel px-6 text-ink shadow-panel"
          >
            回书架看免费 {COMMERCE.freeCount} 本
          </Link>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
