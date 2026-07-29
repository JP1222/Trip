import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { PoolClient } from "pg";
import { getPool } from "./client";

const MIGRATION_LOCK_NAME = "trip:schema-migrations:v1";
const MIGRATION_FILE = /^(\d+)_([a-z0-9][a-z0-9_-]*)\.sql$/i;

type Migration = {
  version: number;
  name: string;
  filename: string;
  checksum: string;
  sql: string;
};

type AppliedMigrationRow = {
  version: number;
  name: string;
  checksum: string;
};

export type MigrationResult = {
  applied: number[];
  skipped: number[];
};

export type MigrateDatabaseOptions = {
  migrationsDirectory?: string;
  logger?: Pick<Console, "info">;
};

function checksum(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function migrationBody(sql: string, filename: string): string {
  const normalized = sql.replace(/^\uFEFF/, "");
  const hasBegin = /^\s*BEGIN\s*;/i.test(normalized);
  const hasCommit = /COMMIT\s*;\s*$/i.test(normalized);
  if (hasBegin !== hasCommit) {
    throw new Error(
      `${filename} must either include both BEGIN/COMMIT or neither`,
    );
  }
  if (!hasBegin) return normalized;
  return normalized
    .replace(/^\s*BEGIN\s*;\s*/i, "")
    .replace(/\s*COMMIT\s*;\s*$/i, "");
}

async function readMigrations(directory: string): Promise<Migration[]> {
  const filenames = (await fs.readdir(directory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  const seenVersions = new Set<number>();
  const migrations: Migration[] = [];

  for (const filename of filenames) {
    const match = MIGRATION_FILE.exec(filename);
    if (!match) {
      throw new Error(
        `Invalid migration filename ${filename}; expected 0001_description.sql`,
      );
    }
    const version = Number.parseInt(match[1], 10);
    if (!Number.isSafeInteger(version) || version <= 0) {
      throw new Error(`Invalid migration version in ${filename}`);
    }
    if (seenVersions.has(version)) {
      throw new Error(`Duplicate migration version ${version}`);
    }
    seenVersions.add(version);
    const sql = await fs.readFile(path.join(directory, filename), "utf8");
    migrations.push({
      version,
      name: match[2],
      filename,
      checksum: checksum(sql),
      sql,
    });
  }

  return migrations.sort((a, b) => a.version - b.version);
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(
  client: PoolClient,
): Promise<Map<number, AppliedMigrationRow>> {
  const result = await client.query<AppliedMigrationRow>(`
    SELECT version, name, checksum
    FROM schema_migrations
    ORDER BY version
  `);
  return new Map(result.rows.map((row) => [row.version, row]));
}

function validateAppliedMigrations(
  migrations: Migration[],
  applied: Map<number, AppliedMigrationRow>,
): void {
  const available = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const row of applied.values()) {
    const migration = available.get(row.version);
    if (!migration) {
      throw new Error(
        `Applied migration ${row.version}_${row.name} is missing from db/migrations`,
      );
    }
    if (row.name !== migration.name) {
      throw new Error(
        `Migration ${row.version} name mismatch: database=${row.name}, file=${migration.name}`,
      );
    }
    if (row.checksum !== migration.checksum) {
      throw new Error(
        `Migration ${migration.filename} checksum changed after it was applied`,
      );
    }
  }
}

async function applyMigration(
  client: PoolClient,
  migration: Migration,
): Promise<void> {
  await client.query("BEGIN");
  try {
    const body = migrationBody(migration.sql, migration.filename);
    if (body.trim()) await client.query(body);
    await client.query(
      `
        INSERT INTO schema_migrations (version, name, checksum)
        VALUES ($1, $2, $3)
      `,
      [migration.version, migration.name, migration.checksum],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function migrateDatabase(
  options: MigrateDatabaseOptions = {},
): Promise<MigrationResult> {
  const directory =
    options.migrationsDirectory ||
    path.join(process.cwd(), "db", "migrations");
  const logger = options.logger || console;
  const migrations = await readMigrations(directory);
  const client = await getPool().connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [
      MIGRATION_LOCK_NAME,
    ]);
    await ensureMigrationTable(client);
    const applied = await appliedMigrations(client);
    validateAppliedMigrations(migrations, applied);

    const result: MigrationResult = { applied: [], skipped: [] };
    for (const migration of migrations) {
      if (applied.has(migration.version)) {
        result.skipped.push(migration.version);
        continue;
      }
      logger.info(`[database] applying ${migration.filename}`);
      await applyMigration(client, migration);
      result.applied.push(migration.version);
    }
    return result;
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_NAME])
      .catch(() => undefined);
    client.release();
  }
}
