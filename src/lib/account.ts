import { applyClaimedEntitlement, type Entitlement } from "@/lib/entitlement";

export const SESSION_STORAGE_KEY = "chengyu.session.v1";

function payApiBase(): string {
  if (typeof import.meta === "undefined" || !import.meta.env || typeof import.meta.env.VITE_PAY_API !== "string") {
    return "";
  }
  return import.meta.env.VITE_PAY_API.replace(/\/$/, "");
}

export type AccountProfile = {
  accountId: string;
  loginId: string;
  entitlement: Entitlement | null;
};

export type AuthSession = {
  token: string;
  expiresAt: string;
  account: AccountProfile;
};

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = readSessionToken();
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export function readSessionToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; expiresAt?: string };
    if (!parsed.token || typeof parsed.token !== "string") return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export function writeSession(session: AuthSession): void {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ token: session.token, expiresAt: session.expiresAt, loginId: session.account.loginId }),
  );
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function readCachedLoginId(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { loginId?: string };
    return typeof parsed.loginId === "string" ? parsed.loginId : null;
  } catch {
    return null;
  }
}

async function postAuth(path: string, body: unknown): Promise<AuthSession> {
  const base = payApiBase();
  if (!base) throw new Error("收款服务未配置");
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as Partial<AuthSession> & { error?: string };
  if (!response.ok || !payload.token || !payload.account || !payload.expiresAt) {
    throw new Error(payload.error ?? "登录失败");
  }
  const session: AuthSession = {
    token: payload.token,
    expiresAt: payload.expiresAt,
    account: {
      accountId: payload.account.accountId,
      loginId: payload.account.loginId,
      entitlement: payload.account.entitlement ?? null,
    },
  };
  writeSession(session);
  if (session.account.entitlement) {
    applyClaimedEntitlement({
      ...session.account.entitlement,
      source: session.account.entitlement.source ?? "account-sync",
    });
  }
  return session;
}

export async function registerAccount(loginId: string, password: string): Promise<AuthSession> {
  return postAuth("/auth/register", { email: loginId, loginId, password });
}

export async function loginAccount(loginId: string, password: string): Promise<AuthSession> {
  return postAuth("/auth/login", { email: loginId, loginId, password });
}

export async function logoutAccount(): Promise<void> {
  const base = payApiBase();
  const token = readSessionToken();
  if (base && token) {
    try {
      await fetch(`${base}/auth/logout`, {
        method: "POST",
        headers: authHeaders(),
      });
    } catch {
      // Local clear still proceeds.
    }
  }
  clearSession();
}

export async function syncAccountEntitlement(): Promise<AccountProfile | null> {
  const base = payApiBase();
  const token = readSessionToken();
  if (!base || !token) return null;
  const response = await fetch(`${base}/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status === 401) {
    clearSession();
    return null;
  }
  const payload = (await response.json()) as {
    error?: string;
    account?: AccountProfile;
    entitlement?: Entitlement | null;
  };
  if (!response.ok || !payload.account) {
    throw new Error(payload.error ?? "同步账号失败");
  }
  if (payload.entitlement || payload.account.entitlement) {
    applyClaimedEntitlement({
      ...(payload.entitlement ?? payload.account.entitlement)!,
      source: "account-sync",
    });
  }
  return {
    ...payload.account,
    entitlement: payload.entitlement ?? payload.account.entitlement ?? null,
  };
}

export function accountAuthHeaders(): HeadersInit {
  return authHeaders();
}
