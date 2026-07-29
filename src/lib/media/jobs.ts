import { query, withTransaction } from "@/lib/db";
import type { MediaJob, MediaJobFailure, MediaJobType } from "./types";

type JobRow = {
  id: string | number;
  media_id: string;
  job_type: MediaJobType;
  state: MediaJob["state"];
  priority: number;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown> | null;
  available_at: Date | string;
  leased_until: Date | string | null;
  worker_id: string | null;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  finished_at: Date | string | null;
};

function iso(value: Date | string | null): string | undefined {
  if (value == null) return undefined;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapJob(row: JobRow): MediaJob {
  return {
    id: Number(row.id),
    mediaId: row.media_id,
    jobType: row.job_type,
    state: row.state,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    payload: row.payload || {},
    availableAt: iso(row.available_at) || new Date(0).toISOString(),
    leasedUntil: iso(row.leased_until),
    workerId: row.worker_id || undefined,
    lastError: row.last_error || undefined,
    createdAt: iso(row.created_at) || new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) || new Date(0).toISOString(),
    finishedAt: iso(row.finished_at),
  };
}

export async function claimMediaJob(
  workerId: string,
  leaseSeconds = 300,
): Promise<MediaJob | null> {
  return withTransaction(async (client) => {
    const result = await client.query<JobRow>(
      `WITH candidate AS (
         SELECT id
         FROM media_jobs
         WHERE attempts < max_attempts
           AND (
             (state = 'pending' AND available_at <= now())
             OR (state = 'processing' AND leased_until < now())
           )
         ORDER BY priority DESC, available_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE media_jobs AS job SET
         state = 'processing',
         attempts = job.attempts + 1,
         worker_id = $1,
         leased_until = now() + make_interval(secs => $2),
         last_error = NULL,
         updated_at = now()
       FROM candidate
       WHERE job.id = candidate.id
       RETURNING job.*`,
      [workerId, Math.max(30, Math.floor(leaseSeconds))],
    );
    return result.rows[0] ? mapJob(result.rows[0]) : null;
  });
}

export async function extendMediaJobLease(
  jobId: number,
  workerId: string,
  leaseSeconds = 300,
): Promise<boolean> {
  const result = await query(
    `UPDATE media_jobs SET
       leased_until = now() + make_interval(secs => $3),
       updated_at = now()
     WHERE id = $1 AND worker_id = $2 AND state = 'processing'`,
    [jobId, workerId, Math.max(30, Math.floor(leaseSeconds))],
  );
  return Boolean(result.rowCount);
}

export async function completeMediaJob(
  jobId: number,
  workerId: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE media_jobs SET
       state = 'succeeded', leased_until = NULL, worker_id = NULL,
       finished_at = now(), updated_at = now()
     WHERE id = $1 AND worker_id = $2 AND state = 'processing'`,
    [jobId, workerId],
  );
  return Boolean(result.rowCount);
}

export async function failMediaJob(
  jobId: number,
  workerId: string,
  errorMessage: string,
): Promise<MediaJobFailure> {
  return withTransaction(async (client) => {
    const selected = await client.query<{
      attempts: number;
      max_attempts: number;
    }>(
      `SELECT attempts, max_attempts
       FROM media_jobs
       WHERE id = $1 AND worker_id = $2 AND state = 'processing'
       FOR UPDATE`,
      [jobId, workerId],
    );
    const row = selected.rows[0];
    if (!row) {
      return { terminal: true, attempts: 0, maxAttempts: 0 };
    }
    const terminal = row.attempts >= row.max_attempts;
    const delaySeconds = Math.min(3600, 15 * 2 ** Math.max(0, row.attempts - 1));
    await client.query(
      `UPDATE media_jobs SET
         state = CASE WHEN $3 THEN 'failed'::media_job_state ELSE 'pending'::media_job_state END,
         available_at = CASE
           WHEN $3 THEN available_at
           ELSE now() + make_interval(secs => $4)
         END,
         leased_until = NULL,
         worker_id = NULL,
         last_error = left($5, 4000),
         finished_at = CASE WHEN $3 THEN now() ELSE NULL END,
         updated_at = now()
       WHERE id = $1 AND worker_id = $2 AND state = 'processing'`,
      [jobId, workerId, terminal, delaySeconds, errorMessage],
    );
    return {
      terminal,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
    };
  });
}

