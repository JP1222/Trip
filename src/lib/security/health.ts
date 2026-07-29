import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { getSecurityEnvironment } from "./env";

const CHECK_TIMEOUT_MS = 3_000;

export type ReadinessChecks = {
  database: "ok" | "error";
  mediaPrivate: "ok" | "error";
  mediaPublic: "ok" | "error";
};

export type ReadinessDetails = {
  queue?: {
    pending: number;
    processing: number;
    failed: number;
    oldestPendingAgeSeconds: number | null;
  };
  warnings: string[];
};

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${label} readiness check timed out`)),
      CHECK_TIMEOUT_MS,
    );
    timeout.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function checkDatabase(): Promise<void> {
  const result = await query<{ schema_ready: boolean }>(
    `SELECT
       to_regclass('public.admin_sessions') IS NOT NULL
       AND to_regclass('public.rate_limit_buckets') IS NOT NULL
       AND to_regclass('public.trip_capabilities') IS NOT NULL
       AS schema_ready`,
  );
  if (result.rows[0]?.schema_ready !== true) {
    throw new Error("Required database schema is not ready");
  }
}

async function checkWritableRoot(root: string): Promise<void> {
  await fs.access(root, fsConstants.R_OK | fsConstants.W_OK);
  const probe = path.join(root, `.trip-readiness-${randomUUID()}`);
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(probe, "wx", 0o600);
    await handle.writeFile("ready");
    await handle.sync();
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.unlink(probe).catch(() => undefined);
  }
}

async function checkReadableRoot(root: string): Promise<void> {
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error("Media root is not a directory");
  await fs.access(root, fsConstants.R_OK);
}

async function resultOf(check: Promise<void>): Promise<"ok" | "error"> {
  try {
    await check;
    return "ok";
  } catch {
    return "error";
  }
}

export async function runReadinessChecks(): Promise<{
  ready: boolean;
  checks: ReadinessChecks;
  details: ReadinessDetails;
}> {
  const environment = getSecurityEnvironment();
  const [database, mediaPrivate, mediaPublic] = await Promise.all([
    resultOf(withTimeout(checkDatabase(), "database")),
    resultOf(
      withTimeout(
        checkWritableRoot(environment.mediaPrivateRoot),
        "private media",
      ),
    ),
    resultOf(
      withTimeout(
        checkReadableRoot(environment.mediaPublicRoot),
        "public media",
      ),
    ),
  ]);
  const checks = { database, mediaPrivate, mediaPublic } satisfies ReadinessChecks;
  const ready = Object.values(checks).every((status) => status === "ok");
  const details: ReadinessDetails = { warnings: [] };

  if (ready) {
    try {
      const { collectQueueSnapshot } = await import(
        "@/lib/observability/metrics"
      );
      const queue = await withTimeout(collectQueueSnapshot(), "queue snapshot");
      details.queue = queue;
      if (queue.pending > 0 && (queue.oldestPendingAgeSeconds ?? 0) > 900) {
        details.warnings.push(
          "Pending media jobs are older than 15 minutes; check media-worker",
        );
      }
      if (queue.failed > 0) {
        details.warnings.push(`${queue.failed} media job(s) failed`);
      }
    } catch {
      details.warnings.push("Could not collect media queue snapshot");
    }
  }

  return { ready, checks, details };
}
