import { query } from "@/lib/db";
import { hashSensitiveValue } from "./request";

const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

type RateLimitRow = {
  hit_count: number;
  expires_at: Date | string;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

export type RateLimitOptions = {
  bucketKey: string;
  limit: number;
  windowMs: number;
};

/** Build a privacy-preserving bucket key; raw IPs/usernames never enter the DB. */
export function createRateLimitKey(
  namespace: string,
  ...identifiers: Array<string | null | undefined>
): string {
  if (!/^[a-z][a-z0-9:_-]{0,63}$/i.test(namespace)) {
    throw new Error("Invalid rate-limit namespace");
  }
  const material = identifiers.map((value) => value ?? "unknown").join("\u001f");
  return `${namespace}:${hashSensitiveValue(`rate-limit:${namespace}:${material}`)}`;
}

/**
 * Fixed-window limiter backed by one atomic PostgreSQL upsert. DB time defines
 * the window so multiple web processes cannot disagree about clock boundaries.
 */
export async function consumeRateLimit({
  bucketKey,
  limit,
  windowMs,
}: RateLimitOptions): Promise<RateLimitResult> {
  if (!bucketKey || bucketKey.length > 200) {
    throw new Error("Invalid rate-limit bucket key");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000_000) {
    throw new Error("Rate-limit limit must be an integer between 1 and 1000000");
  }
  if (
    !Number.isInteger(windowMs) ||
    windowMs < 1_000 ||
    windowMs > MAX_WINDOW_MS
  ) {
    throw new Error("Rate-limit window must be between 1 second and 24 hours");
  }

  const result = await query<RateLimitRow>(
    `WITH bucket AS (
       SELECT to_timestamp(
         floor(
           extract(epoch FROM clock_timestamp()) /
           ($2::double precision / 1000.0)
         ) * ($2::double precision / 1000.0)
       ) AS window_start
     )
     INSERT INTO rate_limit_buckets (
       bucket_key,
       window_start,
       hit_count,
       expires_at
     )
     SELECT
       $1,
       window_start,
       1,
       window_start + make_interval(secs => $2::double precision / 1000.0)
     FROM bucket
     ON CONFLICT (bucket_key, window_start)
     DO UPDATE SET
       hit_count = LEAST(rate_limit_buckets.hit_count + 1, 2147483647),
       expires_at = EXCLUDED.expires_at
     RETURNING hit_count, expires_at`,
    [bucketKey, windowMs],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Rate-limit upsert returned no row");
  const count = Number(row.hit_count);
  const resetAt =
    row.expires_at instanceof Date
      ? row.expires_at
      : new Date(row.expires_at);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((resetAt.getTime() - Date.now()) / 1000),
  );

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSeconds,
  };
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
    ...(result.allowed
      ? {}
      : { "Retry-After": String(result.retryAfterSeconds) }),
  };
}

export async function pruneExpiredRateLimits(): Promise<number> {
  const result = await query(
    "DELETE FROM rate_limit_buckets WHERE expires_at < now()",
  );
  return result.rowCount ?? 0;
}

