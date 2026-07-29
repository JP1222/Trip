import { getSecurityEnvironment } from "./env";

export type OriginValidation =
  | { ok: true }
  | { ok: false; reason: "missing" | "malformed" | "cross-site" };

function normalizedOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Validate unsafe browser requests against the configured canonical origin. */
export function validateRequestOrigin(
  request: Request,
  expectedOrigin?: string,
): OriginValidation {
  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    // Production browser mutations must always carry Origin. Keeping non-browser
    // development clients convenient does not weaken the deployed service.
    return process.env.NODE_ENV === "production"
      ? { ok: false, reason: "missing" }
      : { ok: true };
  }

  const actual = normalizedOrigin(originHeader);
  const configuredOrigin =
    expectedOrigin ??
    (process.env.NODE_ENV === "production"
      ? getSecurityEnvironment().appOrigin
      : new URL(request.url).origin);
  const expected = normalizedOrigin(configuredOrigin);
  if (!actual || !expected) return { ok: false, reason: "malformed" };
  if (actual !== expected) return { ok: false, reason: "cross-site" };

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return { ok: false, reason: "cross-site" };
  }
  return { ok: true };
}
