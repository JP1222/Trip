import { promises as fs } from "node:fs";
import path from "node:path";
import { query } from "@/lib/db";
import { getSecurityEnvironment } from "@/lib/security/env";

export type CountRow = { key: string; count: string | number };

export type BackendMetrics = {
  collectedAt: string;
  database: {
    trips: number;
    mediaByState: Record<string, number>;
    jobsByState: Record<string, number>;
    failedMedia24h: number;
    pendingJobsOlderThanMinutes: number;
    oldestPendingJobAgeSeconds: number | null;
    activeAdminSessions: number;
    activeCapabilities: number;
    comments: number;
  };
  mediaDisk: {
    privateRoot: string;
    publicRoot: string;
    privateBytes: number | null;
    publicBytes: number | null;
  };
  healthHints: string[];
};

function toCountMap(rows: CountRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.key] = Number(row.count);
  return out;
}

async function directorySizeBytes(root: string): Promise<number | null> {
  try {
    await fs.access(root);
  } catch {
    return null;
  }

  let total = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const stat = await fs.stat(full);
        total += stat.size;
      }
    }
  }
  try {
    await walk(root);
    return total;
  } catch {
    return null;
  }
}

export async function collectBackendMetrics(): Promise<BackendMetrics> {
  const environment = getSecurityEnvironment();
  const [
    trips,
    mediaStates,
    jobStates,
    failedMedia,
    pendingAge,
    sessions,
    capabilities,
    comments,
    privateBytes,
    publicBytes,
  ] = await Promise.all([
    query<{ count: string | number }>(`SELECT count(*)::text AS count FROM trips`),
    query<CountRow>(
      `SELECT state::text AS key, count(*)::text AS count FROM media GROUP BY state`,
    ),
    query<CountRow>(
      `SELECT state::text AS key, count(*)::text AS count FROM media_jobs GROUP BY state`,
    ),
    query<{ count: string | number }>(
      `SELECT count(*)::text AS count
       FROM media
       WHERE state = 'failed' AND updated_at > now() - interval '24 hours'`,
    ),
    query<{
      oldest_age_seconds: string | number | null;
      stale_count: string | number;
    }>(
      `SELECT
         EXTRACT(EPOCH FROM (now() - min(available_at)))::bigint AS oldest_age_seconds,
         count(*) FILTER (
           WHERE available_at < now() - interval '15 minutes'
         )::text AS stale_count
       FROM media_jobs
       WHERE state = 'pending'`,
    ),
    query<{ count: string | number }>(
      `SELECT count(*)::text AS count
       FROM admin_sessions
       WHERE revoked_at IS NULL AND expires_at > now()`,
    ),
    query<{ count: string | number }>(
      `SELECT count(*)::text AS count
       FROM trip_capabilities
       WHERE revoked_at IS NULL AND expires_at > now()`,
    ),
    query<{ count: string | number }>(
      `SELECT count(*)::text AS count FROM comments`,
    ),
    directorySizeBytes(environment.mediaPrivateRoot),
    directorySizeBytes(environment.mediaPublicRoot),
  ]);

  const mediaByState = toCountMap(mediaStates.rows);
  const jobsByState = toCountMap(jobStates.rows);
  const oldest =
    pendingAge.rows[0]?.oldest_age_seconds == null
      ? null
      : Number(pendingAge.rows[0].oldest_age_seconds);
  const stalePending = Number(pendingAge.rows[0]?.stale_count || 0);
  const pendingJobs = jobsByState.pending || 0;
  const processingJobs = jobsByState.processing || 0;
  const failedJobs = jobsByState.failed || 0;
  const failedMedia24h = Number(failedMedia.rows[0]?.count || 0);

  const healthHints: string[] = [];
  if (pendingJobs + processingJobs > 50) {
    healthHints.push(
      `Media job backlog is elevated (pending=${pendingJobs}, processing=${processingJobs})`,
    );
  }
  if (stalePending > 0) {
    healthHints.push(
      `${stalePending} pending media job(s) older than 15 minutes — is media-worker running?`,
    );
  }
  if (failedMedia24h > 0) {
    healthHints.push(`${failedMedia24h} media item(s) failed processing in the last 24h`);
  }
  if (failedJobs > 0) {
    healthHints.push(`${failedJobs} media job(s) in failed state`);
  }
  if (privateBytes != null && privateBytes > 40 * 1024 * 1024 * 1024) {
    healthHints.push("Private media volume exceeds 40 GiB — check disk headroom");
  }

  return {
    collectedAt: new Date().toISOString(),
    database: {
      trips: Number(trips.rows[0]?.count || 0),
      mediaByState,
      jobsByState,
      failedMedia24h,
      pendingJobsOlderThanMinutes: stalePending,
      oldestPendingJobAgeSeconds: oldest,
      activeAdminSessions: Number(sessions.rows[0]?.count || 0),
      activeCapabilities: Number(capabilities.rows[0]?.count || 0),
      comments: Number(comments.rows[0]?.count || 0),
    },
    mediaDisk: {
      privateRoot: environment.mediaPrivateRoot,
      publicRoot: environment.mediaPublicRoot,
      privateBytes,
      publicBytes,
    },
    healthHints,
  };
}

/** Compact counters for worker heartbeats and readiness enrichment. */
export async function collectQueueSnapshot(): Promise<{
  pending: number;
  processing: number;
  failed: number;
  oldestPendingAgeSeconds: number | null;
}> {
  const result = await query<{
    pending: string | number;
    processing: string | number;
    failed: string | number;
    oldest_age_seconds: string | number | null;
  }>(
    `SELECT
       count(*) FILTER (WHERE state = 'pending')::text AS pending,
       count(*) FILTER (WHERE state = 'processing')::text AS processing,
       count(*) FILTER (WHERE state = 'failed')::text AS failed,
       EXTRACT(EPOCH FROM (now() - min(available_at) FILTER (WHERE state = 'pending')))::bigint
         AS oldest_age_seconds
     FROM media_jobs`,
  );
  const row = result.rows[0];
  return {
    pending: Number(row?.pending || 0),
    processing: Number(row?.processing || 0),
    failed: Number(row?.failed || 0),
    oldestPendingAgeSeconds:
      row?.oldest_age_seconds == null ? null : Number(row.oldest_age_seconds),
  };
}
