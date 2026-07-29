import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import { getSecurityEnvironment } from "@/lib/security/env";

const LEGACY_ADMIN_COOKIE = "wander_admin";
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const ADMIN_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-trip_admin_session"
    : "trip_admin_session";

type AdminSessionRow = {
  id: string;
  username: string;
  created_at: Date | string;
  expires_at: Date | string;
  last_seen_at: Date | string;
};

export type AdminSession = {
  id: string;
  username: string;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
};

export type CreatedAdminSession = AdminSession & {
  /** Returned once. Only its peppered hash is persisted. */
  token: string;
};

function useDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapSession(row: AdminSessionRow): AdminSession {
  return {
    id: row.id,
    username: row.username,
    createdAt: asDate(row.created_at),
    expiresAt: asDate(row.expires_at),
    lastSeenAt: asDate(row.last_seen_at),
  };
}

function safeEqualString(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function hashSessionToken(token: string): string {
  return createHmac("sha256", getSecurityEnvironment().appSecret)
    .update(`admin-session:${token}`)
    .digest("hex");
}

/** Deterministic local-only token when PostgreSQL is not configured. */
function legacyExpectedToken(): string | null {
  const { adminUsername, adminPassword, appSecret } = getSecurityEnvironment();
  if (!adminUsername || !adminPassword) return null;
  return createHash("sha256")
    .update(`wander:${adminUsername}:${adminPassword}:${appSecret}`)
    .digest("hex");
}

export function verifyCredentials(
  inputUser: string,
  inputPassword: string,
): boolean {
  const { adminUsername, adminPassword } = getSecurityEnvironment();
  if (!adminUsername || !adminPassword || !inputUser || !inputPassword) {
    return false;
  }
  return (
    safeEqualString(inputUser.trim(), adminUsername) &&
    safeEqualString(inputPassword, adminPassword)
  );
}

export async function createAdminSession(input: {
  username?: string;
  ipHash?: string | null;
  userAgent?: string | null;
} = {}): Promise<CreatedAdminSession> {
  const environment = getSecurityEnvironment();
  const username = input.username?.trim() || environment.adminUsername;
  if (!username || username !== environment.adminUsername) {
    throw new Error("Cannot create a session for an unknown administrator");
  }

  if (!useDatabase()) {
    const token = legacyExpectedToken();
    if (!token) throw new Error("Admin credentials are not configured");
    const now = new Date();
    return {
      id: "legacy-local",
      username,
      createdAt: now,
      expiresAt: new Date(now.getTime() + environment.sessionTtlSeconds * 1000),
      lastSeenAt: now,
      token,
    };
  }

  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(
    Date.now() + environment.sessionTtlSeconds * 1000,
  );
  const result = await query<AdminSessionRow>(
    `INSERT INTO admin_sessions (
       id,
       token_hash,
       username,
       expires_at,
       ip_hash,
       user_agent
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, username, created_at, expires_at, last_seen_at`,
    [
      id,
      tokenHash,
      username,
      expiresAt,
      input.ipHash ?? null,
      input.userAgent?.slice(0, 512) ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Session insert returned no row");
  return { ...mapSession(row), token };
}

export async function getAdminSessionFromToken(
  token: string | null | undefined,
): Promise<AdminSession | null> {
  if (!token) return null;

  if (!useDatabase()) {
    const expected = legacyExpectedToken();
    if (!expected || token.length !== expected.length) return null;
    try {
      if (!timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
        return null;
      }
    } catch {
      return null;
    }
    const { adminUsername, sessionTtlSeconds } = getSecurityEnvironment();
    const now = new Date();
    return {
      id: "legacy-local",
      username: adminUsername,
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionTtlSeconds * 1000),
      lastSeenAt: now,
    };
  }

  // The previous deterministic token was a 64-character hex value. Requiring
  // the exact random-token format makes it impossible to accept by accident.
  if (!SESSION_TOKEN_PATTERN.test(token)) return null;

  const { adminUsername } = getSecurityEnvironment();
  const result = await query<AdminSessionRow>(
    `UPDATE admin_sessions
     SET last_seen_at = CASE
       WHEN last_seen_at < now() - interval '5 minutes' THEN now()
       ELSE last_seen_at
     END
     WHERE token_hash = $1
       AND username = $2
       AND revoked_at IS NULL
       AND expires_at > now()
     RETURNING id, username, created_at, expires_at, last_seen_at`,
    [hashSessionToken(token), adminUsername],
  );
  const row = result.rows[0];
  return row ? mapSession(row) : null;
}

export async function getCurrentAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  const primary = await getAdminSessionFromToken(jar.get(ADMIN_COOKIE)?.value);
  if (primary) return primary;
  // Cutover: accept the legacy cookie only when still on JSON mode.
  if (!useDatabase()) {
    return getAdminSessionFromToken(jar.get(LEGACY_ADMIN_COOKIE)?.value);
  }
  return null;
}

export async function isAdmin(): Promise<boolean> {
  try {
    return (await getCurrentAdminSession()) !== null;
  } catch (error) {
    logger.error("admin_session_lookup_failed", { error });
    return false;
  }
}

export async function revokeAdminSessionToken(
  token: string | null | undefined,
): Promise<boolean> {
  if (!token) return false;
  if (!useDatabase()) return true;
  if (!SESSION_TOKEN_PATTERN.test(token)) return false;
  const result = await query(
    `UPDATE admin_sessions
     SET revoked_at = COALESCE(revoked_at, now())
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashSessionToken(token)],
  );
  return (result.rowCount ?? 0) > 0;
}

export function adminCookieOptions(
  maxAgeSec = getSecurityEnvironment().sessionTtlSeconds,
) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: Math.max(0, Math.floor(maxAgeSec)),
  };
}

export function setAdminSessionCookie(
  response: NextResponse,
  token: string,
  maxAgeSec = getSecurityEnvironment().sessionTtlSeconds,
): void {
  response.cookies.set(ADMIN_COOKIE, token, adminCookieOptions(maxAgeSec));
  // Explicitly remove the deterministic legacy cookie during cutover.
  response.cookies.set(LEGACY_ADMIN_COOKIE, "", {
    ...adminCookieOptions(0),
    maxAge: 0,
  });
}

export function clearAdminSessionCookies(response: NextResponse): void {
  response.cookies.set(ADMIN_COOKIE, "", {
    ...adminCookieOptions(0),
    maxAge: 0,
  });
  response.cookies.set(LEGACY_ADMIN_COOKIE, "", {
    ...adminCookieOptions(0),
    maxAge: 0,
  });
}
