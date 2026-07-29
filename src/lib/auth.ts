import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "wander_admin";

function username(): string {
  return process.env.ADMIN_USERNAME || "admin";
}

function password(): string {
  return process.env.ADMIN_PASSWORD || "";
}

function secret(): string {
  return (
    process.env.ADMIN_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "dev-only-change-me"
  );
}

function safeEqualString(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  try {
    return timingSafeEqual(ha, hb);
  } catch {
    return false;
  }
}

/** Stable session token derived from username + password + secret */
export function expectedAdminToken(): string | null {
  const user = username();
  const pw = password();
  if (!user || !pw) return null;
  return createHash("sha256")
    .update(`wander:${user}:${pw}:${secret()}`)
    .digest("hex");
}

export function verifyCredentials(
  inputUser: string,
  inputPassword: string,
): boolean {
  const user = username();
  const pw = password();
  if (!user || !pw || !inputUser || !inputPassword) return false;
  return (
    safeEqualString(inputUser.trim(), user) &&
    safeEqualString(inputPassword, pw)
  );
}

export async function isAdmin(): Promise<boolean> {
  const expected = expectedAdminToken();
  if (!expected) return false;
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token || token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function adminCookieOptions(maxAgeSec = 60 * 60 * 24 * 14) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}
