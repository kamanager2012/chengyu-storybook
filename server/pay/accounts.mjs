import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SESSION_DAYS = 400;

/**
 * @typedef {{
 *   schemaVersion: 1,
 *   productId: string,
 *   grantedAt: string,
 *   expiresAt: string,
 *   orderId?: string,
 *   source?: string,
 * }} AccountEntitlement
 *
 * @typedef {{
 *   accountId: string,
 *   loginId: string,
 *   passwordHash: string,
 *   passwordSalt: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   entitlement: AccountEntitlement | null,
 * }} AccountRecord
 *
 * @typedef {{
 *   sessionId: string,
 *   accountId: string,
 *   tokenHash: string,
 *   createdAt: string,
 *   expiresAt: string,
 * }} SessionRecord
 *
 * @typedef {{
 *   accounts: Record<string, AccountRecord>,
 *   sessions: Record<string, SessionRecord>,
 *   loginIndex: Record<string, string>,
 * }} AccountDb
 */

export function normalizeLoginId(raw) {
  const trimmed = String(raw ?? "").trim().toLowerCase();
  if (!trimmed) return "";
  // Email only — no phone / WeChat OAuth (avoids SMS and WeChat login audit).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "";
  if (trimmed.length > 254) return "";
  return trimmed;
}

function hashPassword(password, saltBuf) {
  return scryptSync(password, saltBuf, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString("hex");
}

function hashToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function safeEqualHex(a, b) {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function emptyDb() {
  return { accounts: {}, sessions: {}, loginIndex: {} };
}

/**
 * @param {string} ordersPath
 */
export function accountsPathFromOrders(ordersPath) {
  return join(dirname(ordersPath), "accounts.json");
}

/**
 * @param {string} filePath
 */
export function createAccountStore(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });

  /** @returns {AccountDb} */
  function readDb() {
    if (!existsSync(filePath)) return emptyDb();
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      if (!parsed || typeof parsed !== "object") return emptyDb();
      return {
        accounts: parsed.accounts && typeof parsed.accounts === "object" ? parsed.accounts : {},
        sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
        loginIndex: parsed.loginIndex && typeof parsed.loginIndex === "object" ? parsed.loginIndex : {},
      };
    } catch {
      return emptyDb();
    }
  }

  /** @param {AccountDb} db */
  function writeDb(db) {
    const tmp = `${filePath}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(db, null, 2)}\n`);
    renameSync(tmp, filePath);
  }

  function publicAccount(account) {
    return {
      accountId: account.accountId,
      loginId: account.loginId,
      entitlement: account.entitlement,
    };
  }

  /**
   * @param {AccountEntitlement | null | undefined} existing
   * @param {AccountEntitlement} incoming
   */
  function mergeEntitlement(existing, incoming) {
    if (!existing) return incoming;
    const a = Date.parse(existing.expiresAt);
    const b = Date.parse(incoming.expiresAt);
    if (!Number.isFinite(b)) return existing;
    if (!Number.isFinite(a) || b >= a) return incoming;
    return existing;
  }

  return {
    /**
     * @param {string} loginIdRaw
     * @param {string} password
     */
    register(loginIdRaw, password) {
      const loginId = normalizeLoginId(loginIdRaw);
      if (!loginId) {
        const error = new Error("请填写有效邮箱");
        error.code = "BAD_LOGIN";
        throw error;
      }
      if (typeof password !== "string" || password.length < 8) {
        const error = new Error("密码至少 8 位");
        error.code = "BAD_PASSWORD";
        throw error;
      }
      const db = readDb();
      if (db.loginIndex[loginId]) {
        const error = new Error("该账号已注册，请直接登录");
        error.code = "EXISTS";
        throw error;
      }
      const salt = randomBytes(16);
      const now = new Date().toISOString();
      const accountId = `acc_${randomBytes(8).toString("hex")}`;
      /** @type {AccountRecord} */
      const account = {
        accountId,
        loginId,
        passwordSalt: salt.toString("hex"),
        passwordHash: hashPassword(password, salt),
        createdAt: now,
        updatedAt: now,
        entitlement: null,
      };
      db.accounts[accountId] = account;
      db.loginIndex[loginId] = accountId;
      writeDb(db);
      return this.createSession(accountId);
    },

    /**
     * @param {string} loginIdRaw
     * @param {string} password
     */
    login(loginIdRaw, password) {
      const loginId = normalizeLoginId(loginIdRaw);
      if (!loginId || typeof password !== "string") {
        const error = new Error("账号或密码不正确");
        error.code = "AUTH";
        throw error;
      }
      const db = readDb();
      const accountId = db.loginIndex[loginId];
      const account = accountId ? db.accounts[accountId] : null;
      if (!account) {
        const error = new Error("账号或密码不正确");
        error.code = "AUTH";
        throw error;
      }
      const salt = Buffer.from(account.passwordSalt, "hex");
      const attempt = hashPassword(password, salt);
      if (!safeEqualHex(attempt, account.passwordHash)) {
        const error = new Error("账号或密码不正确");
        error.code = "AUTH";
        throw error;
      }
      return this.createSession(account.accountId);
    },

    /**
     * @param {string} accountId
     */
    createSession(accountId) {
      const db = readDb();
      const account = db.accounts[accountId];
      if (!account) {
        const error = new Error("账号不存在");
        error.code = "NOT_FOUND";
        throw error;
      }
      const token = `cysec_${randomBytes(24).toString("hex")}`;
      const sessionId = `ses_${randomBytes(8).toString("hex")}`;
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
      db.sessions[sessionId] = {
        sessionId,
        accountId,
        tokenHash: hashToken(token),
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
      writeDb(db);
      return {
        token,
        expiresAt: expiresAt.toISOString(),
        account: publicAccount(account),
      };
    },

    /**
     * @param {string | undefined} authorizationHeader
     */
    resolveSession(authorizationHeader) {
      const raw = String(authorizationHeader || "");
      const match = /^Bearer\s+(.+)$/i.exec(raw);
      if (!match) return null;
      const token = match[1].trim();
      if (!token) return null;
      const tokenHash = hashToken(token);
      const db = readDb();
      const now = Date.now();
      for (const session of Object.values(db.sessions)) {
        if (session.tokenHash !== tokenHash) continue;
        if (Date.parse(session.expiresAt) <= now) {
          delete db.sessions[session.sessionId];
          writeDb(db);
          return null;
        }
        const account = db.accounts[session.accountId];
        if (!account) return null;
        return { session, account: publicAccount(account) };
      }
      return null;
    },

    /**
     * @param {string | undefined} authorizationHeader
     */
    logout(authorizationHeader) {
      const resolved = this.resolveSession(authorizationHeader);
      if (!resolved) return false;
      const db = readDb();
      delete db.sessions[resolved.session.sessionId];
      writeDb(db);
      return true;
    },

    /**
     * @param {string} accountId
     * @param {AccountEntitlement} entitlement
     */
    setEntitlement(accountId, entitlement) {
      const db = readDb();
      const account = db.accounts[accountId];
      if (!account) return null;
      account.entitlement = mergeEntitlement(account.entitlement, entitlement);
      account.updatedAt = new Date().toISOString();
      db.accounts[accountId] = account;
      writeDb(db);
      return publicAccount(account);
    },

    /**
     * @param {string} accountId
     */
    getAccount(accountId) {
      const account = readDb().accounts[accountId];
      return account ? publicAccount(account) : null;
    },
  };
}
