/**
 * Post-deploy / local smoke checks against a running stack with DATABASE_URL.
 *
 *   pnpm smoke:backend
 *   BASE_URL=https://trip.example.com pnpm smoke:backend
 */
import { closeDatabase, migrateDatabase, query } from "../src/lib/db";
import { collectBackendMetrics } from "../src/lib/observability/metrics";
import { runReadinessChecks } from "../src/lib/security/health";

const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);

type Check = { name: string; ok: boolean; detail?: string };

async function httpCheck(name: string, path: string, expectOk = true): Promise<Check> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: "application/json" },
    });
    const ok = expectOk ? res.ok : res.status < 500;
    return {
      name,
      ok,
      detail: `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for smoke:backend");
  }

  const checks: Check[] = [];

  try {
    await migrateDatabase({ logger: { info: () => undefined } });
    checks.push({ name: "schema_migrations", ok: true });
  } catch (error) {
    checks.push({
      name: "schema_migrations",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const trips = await query<{ count: string }>(
      "SELECT count(*)::text AS count FROM trips",
    );
    checks.push({
      name: "trips_table",
      ok: true,
      detail: `trips=${trips.rows[0]?.count ?? 0}`,
    });
  } catch (error) {
    checks.push({
      name: "trips_table",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const readiness = await runReadinessChecks();
    checks.push({
      name: "readiness_lib",
      ok: readiness.ready,
      detail: JSON.stringify(readiness),
    });
  } catch (error) {
    checks.push({
      name: "readiness_lib",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const metrics = await collectBackendMetrics();
    checks.push({
      name: "metrics",
      ok: true,
      detail: `pending_jobs=${metrics.database.jobsByState.pending || 0} hints=${metrics.healthHints.length}`,
    });
  } catch (error) {
    checks.push({
      name: "metrics",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  checks.push(await httpCheck("http_live", "/api/health/live"));
  checks.push(await httpCheck("http_ready", "/api/health/ready"));

  const failed = checks.filter((check) => !check.ok);
  for (const check of checks) {
    const mark = check.ok ? "ok" : "FAIL";
    console.log(`[smoke] ${mark.padEnd(4)} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  }

  if (failed.length) {
    throw new Error(`${failed.length} smoke check(s) failed`);
  }
  console.log("[smoke] all checks passed");
}

main()
  .catch((error) => {
    console.error("[smoke] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase().catch(() => undefined);
  });
