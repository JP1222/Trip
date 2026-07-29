import { randomUUID } from "crypto";
import {
  claimMediaJob,
  completeMediaJob,
  extendMediaJobLease,
  failMediaJob,
  markMediaFailed,
  markMediaRetry,
  mediaErrorCode,
  mediaErrorMessage,
  processMediaJob,
} from "../src/lib/media";

const workerId = process.env.MEDIA_WORKER_ID || `media-${randomUUID()}`;
const leaseSeconds = Math.max(
  60,
  Number(process.env.MEDIA_JOB_LEASE_SECONDS || 300),
);
const pollMilliseconds = Math.max(
  250,
  Number(process.env.MEDIA_JOB_POLL_MS || 1500),
);

let stopping = false;
let signalCount = 0;
let activeAbort: AbortController | null = null;

function log(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
) {
  const output = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "media-worker",
    event,
    workerId,
    ...fields,
  });
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}

function onSignal(signal: NodeJS.Signals) {
  signalCount += 1;
  stopping = true;
  log("info", "shutdown_requested", { signal, signalCount });
  // First signal drains the current job. A second signal aborts ffmpeg/ffprobe.
  if (signalCount > 1) activeAbort?.abort(new Error(`Forced shutdown: ${signal}`));
}

process.on("SIGTERM", onSignal);
process.on("SIGINT", onSignal);

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function run(): Promise<void> {
  log("info", "worker_started", { leaseSeconds, pollMilliseconds });
  while (!stopping) {
    const job = await claimMediaJob(workerId, leaseSeconds);
    if (!job) {
      await wait(pollMilliseconds);
      continue;
    }

    const started = Date.now();
    activeAbort = new AbortController();
    log("info", "job_started", {
      jobId: job.id,
      mediaId: job.mediaId,
      jobType: job.jobType,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
    });

    const heartbeat = setInterval(() => {
      void extendMediaJobLease(job.id, workerId, leaseSeconds).catch((error) => {
        log("warn", "lease_heartbeat_failed", {
          jobId: job.id,
          error: mediaErrorMessage(error),
        });
      });
    }, Math.max(15_000, Math.floor((leaseSeconds * 1000) / 3)));
    heartbeat.unref();

    try {
      await processMediaJob(job, { signal: activeAbort.signal });
      const completed = await completeMediaJob(job.id, workerId);
      if (!completed) throw new Error("Job lease was lost before completion");
      log("info", "job_succeeded", {
        jobId: job.id,
        mediaId: job.mediaId,
        durationMs: Date.now() - started,
      });
    } catch (error) {
      const message = mediaErrorMessage(error);
      const failure = await failMediaJob(job.id, workerId, message);
      if (failure.terminal) {
        await markMediaFailed(job.mediaId, mediaErrorCode(error), message);
      } else {
        await markMediaRetry(job.mediaId, message);
      }
      log(failure.terminal ? "error" : "warn", "job_failed", {
        jobId: job.id,
        mediaId: job.mediaId,
        jobType: job.jobType,
        terminal: failure.terminal,
        attempt: failure.attempts,
        maxAttempts: failure.maxAttempts,
        durationMs: Date.now() - started,
        error: message,
      });
    } finally {
      clearInterval(heartbeat);
      activeAbort = null;
    }
  }
  log("info", "worker_stopped");
}

run().catch((error) => {
  log("error", "worker_crashed", { error: mediaErrorMessage(error) });
  process.exitCode = 1;
});

