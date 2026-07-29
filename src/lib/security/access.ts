import type { NextRequest } from "next/server";
import {
  getCurrentAdminSession,
  type AdminSession,
} from "@/lib/auth";
import {
  listTripCapabilities,
  readTripCapabilityCookie,
  verifyTripCapability,
  type TripCapability,
  type TripCapabilityScope,
} from "@/lib/security/capabilities";
import { getTrip } from "@/lib/trips";

export type WriteActor =
  | { kind: "admin"; session: AdminSession }
  | { kind: "capability"; capability: TripCapability; token: string }
  | { kind: "legacy-token"; token: string };

function useDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Admin session or a trip capability with the required scope.
 * Without DATABASE_URL, falls back to the legacy plaintext collabToken on the trip.
 */
export async function authorizeTripWrite(
  request: NextRequest,
  tripId: string,
  scope: TripCapabilityScope,
  bodyToken?: string | null,
): Promise<WriteActor | null> {
  const session = await getCurrentAdminSession().catch(() => null);
  if (session) return { kind: "admin", session };

  if (!useDatabase()) {
    const trip = await getTrip(tripId);
    const token = (bodyToken || "").trim();
    if (trip?.collabToken && token && token === trip.collabToken) {
      return { kind: "legacy-token", token };
    }
    return null;
  }

  const candidates = [
    (bodyToken || "").trim(),
    request.headers.get("x-trip-capability")?.trim() || "",
    (await readTripCapabilityCookie(tripId).catch(() => null)) || "",
  ].filter(Boolean);

  const seen = new Set<string>();
  for (const token of candidates) {
    if (seen.has(token)) continue;
    seen.add(token);
    const capability = await verifyTripCapability(tripId, token, scope);
    if (capability) return { kind: "capability", capability, token };
  }
  return null;
}

export async function requireAdminSession(): Promise<AdminSession | null> {
  return getCurrentAdminSession().catch(() => null);
}

/** True when the trip has at least one unexpired, non-revoked invite. */
export async function hasActiveTripInvite(tripId: string): Promise<boolean> {
  if (!useDatabase()) {
    const trip = await getTrip(tripId);
    return Boolean(trip?.collabToken);
  }
  const now = Date.now();
  const capabilities = await listTripCapabilities(tripId).catch(() => []);
  return capabilities.some(
    (capability) =>
      !capability.revokedAt && capability.expiresAt.getTime() > now,
  );
}

/** Verify an invite token from ?edit= without requiring a specific scope. */
export async function verifyInviteToken(
  tripId: string,
  token: string | null | undefined,
): Promise<TripCapability | { legacy: true } | null> {
  const value = (token || "").trim();
  if (!value) return null;

  if (!useDatabase()) {
    const trip = await getTrip(tripId);
    return trip?.collabToken && value === trip.collabToken
      ? { legacy: true }
      : null;
  }

  for (const scope of ["plan", "comment", "upload"] as const) {
    const capability = await verifyTripCapability(tripId, value, scope);
    if (capability) return capability;
  }
  return null;
}
