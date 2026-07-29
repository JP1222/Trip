import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSecurityEnvironment } from "./env";

const CAPABILITY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DEFAULT_CAPABILITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CAPABILITY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const TRIP_CAPABILITY_SCOPES = ["plan", "comment", "upload"] as const;
export type TripCapabilityScope = (typeof TRIP_CAPABILITY_SCOPES)[number];

type TripCapabilityRow = {
  id: string;
  trip_id: string;
  label: string;
  scopes: string[];
  created_at: Date | string;
  expires_at: Date | string | null;
  last_used_at: Date | string | null;
  revoked_at: Date | string | null;
};

export type TripCapability = {
  id: string;
  tripId: string;
  label: string;
  scopes: TripCapabilityScope[];
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export type CreatedTripCapability = TripCapability & {
  /** Returned once to build the invite link. Never persisted in plaintext. */
  token: string;
};

function date(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function nullableDate(value: Date | string | null): Date | null {
  return value == null ? null : date(value);
}

function mapCapability(row: TripCapabilityRow): TripCapability {
  if (!row.expires_at) {
    throw new Error(`Capability ${row.id} is missing its required expiry`);
  }
  return {
    id: row.id,
    tripId: row.trip_id,
    label: row.label,
    scopes: row.scopes.filter((scope): scope is TripCapabilityScope =>
      TRIP_CAPABILITY_SCOPES.includes(scope as TripCapabilityScope),
    ),
    createdAt: date(row.created_at),
    expiresAt: date(row.expires_at),
    lastUsedAt: nullableDate(row.last_used_at),
    revokedAt: nullableDate(row.revoked_at),
  };
}

function capabilityTokenHash(token: string): string {
  return createHmac("sha256", getSecurityEnvironment().appSecret)
    .update(`trip-capability:${token}`)
    .digest("hex");
}

function validateScopes(scopes: TripCapabilityScope[]): TripCapabilityScope[] {
  const unique = [...new Set(scopes)];
  if (
    unique.length === 0 ||
    unique.some((scope) => !TRIP_CAPABILITY_SCOPES.includes(scope))
  ) {
    throw new Error("A capability needs at least one valid scope");
  }
  return unique;
}

export async function createTripCapability(input: {
  tripId: string;
  label: string;
  scopes: TripCapabilityScope[];
  expiresAt?: Date;
}): Promise<CreatedTripCapability> {
  const tripId = input.tripId.trim();
  const label = input.label.trim();
  if (!tripId || tripId.length > 128) throw new Error("Invalid trip id");
  if (!label || label.length > 120) {
    throw new Error("Capability label must be between 1 and 120 characters");
  }
  const scopes = validateScopes(input.scopes);
  const expiresAt = input.expiresAt ?? new Date(Date.now() + DEFAULT_CAPABILITY_TTL_MS);
  const ttl = expiresAt.getTime() - Date.now();
  if (!Number.isFinite(expiresAt.getTime()) || ttl <= 0 || ttl > MAX_CAPABILITY_TTL_MS) {
    throw new Error("Capability expiry must be within the next 90 days");
  }

  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const result = await query<TripCapabilityRow>(
    `INSERT INTO trip_capabilities (
       id,
       trip_id,
       label,
       token_hash,
       scopes,
       expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING
       id, trip_id, label, scopes, created_at, expires_at, last_used_at, revoked_at`,
    [id, tripId, label, capabilityTokenHash(token), scopes, expiresAt],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Capability insert returned no row");
  return { ...mapCapability(row), token };
}

export async function listTripCapabilities(
  tripId: string,
  options: { includeRevoked?: boolean } = {},
): Promise<TripCapability[]> {
  const result = await query<TripCapabilityRow>(
    `SELECT
       id, trip_id, label, scopes, created_at, expires_at, last_used_at, revoked_at
     FROM trip_capabilities
     WHERE trip_id = $1
       AND ($2::boolean OR revoked_at IS NULL)
     ORDER BY created_at DESC, id DESC`,
    [tripId, options.includeRevoked === true],
  );
  return result.rows.map(mapCapability);
}

/** Active (unrevoked, unexpired) capabilities for a trip. */
export async function listActiveTripCapabilities(
  tripId: string,
): Promise<TripCapability[]> {
  const now = Date.now();
  return (await listTripCapabilities(tripId)).filter(
    (capability) =>
      !capability.revokedAt && capability.expiresAt.getTime() > now,
  );
}

export async function revokeTripCapability(
  tripId: string,
  capabilityId: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE trip_capabilities
     SET revoked_at = COALESCE(revoked_at, now())
     WHERE id = $1 AND trip_id = $2 AND revoked_at IS NULL`,
    [capabilityId, tripId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function verifyTripCapability(
  tripId: string,
  token: string | null | undefined,
  scope: TripCapabilityScope,
): Promise<TripCapability | null> {
  if (!CAPABILITY_TOKEN_PATTERN.test(token ?? "")) return null;
  if (!TRIP_CAPABILITY_SCOPES.includes(scope)) return null;

  const result = await query<TripCapabilityRow>(
    `UPDATE trip_capabilities
     SET last_used_at = CASE
       WHEN last_used_at IS NULL OR last_used_at < now() - interval '5 minutes'
         THEN now()
       ELSE last_used_at
     END
     WHERE trip_id = $1
       AND token_hash = $2
       AND $3 = ANY(scopes)
       AND revoked_at IS NULL
       AND expires_at IS NOT NULL
       AND expires_at > now()
     RETURNING
       id, trip_id, label, scopes, created_at, expires_at, last_used_at, revoked_at`,
    [tripId, capabilityTokenHash(token!), scope],
  );
  const row = result.rows[0];
  return row ? mapCapability(row) : null;
}

export function tripCapabilityCookieName(tripId: string): string {
  const suffix = createHash("sha256").update(tripId).digest("hex").slice(0, 20);
  return process.env.NODE_ENV === "production"
    ? `__Host-trip_cap_${suffix}`
    : `trip_cap_${suffix}`;
}

export async function readTripCapabilityCookie(
  tripId: string,
): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(tripCapabilityCookieName(tripId))?.value;
  return token && CAPABILITY_TOKEN_PATTERN.test(token) ? token : null;
}

export async function verifyTripCapabilityCookie(
  tripId: string,
  scope: TripCapabilityScope,
): Promise<TripCapability | null> {
  return verifyTripCapability(tripId, await readTripCapabilityCookie(tripId), scope);
}

export function setTripCapabilityCookie(
  response: NextResponse,
  tripId: string,
  token: string,
  expiresAt: Date,
): void {
  if (!CAPABILITY_TOKEN_PATTERN.test(token)) {
    throw new Error("Invalid capability token");
  }
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  response.cookies.set(tripCapabilityCookieName(tripId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
    expires: expiresAt,
  });
}

export function clearTripCapabilityCookie(
  response: NextResponse,
  tripId: string,
): void {
  response.cookies.set(tripCapabilityCookieName(tripId), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
