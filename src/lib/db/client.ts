import {
  Pool,
  type PoolClient,
  type PoolConfig,
  type QueryResult,
  type QueryResultRow,
} from "pg";

const globalForDatabase = globalThis as typeof globalThis & {
  __tripPostgresPool?: Pool;
};

export type DbExecutor = Pick<Pool | PoolClient, "query">;

export type TransactionIsolationLevel =
  | "read committed"
  | "repeatable read"
  | "serializable";

export type TransactionOptions = {
  isolationLevel?: TransactionIsolationLevel;
  readOnly?: boolean;
  deferrable?: boolean;
};

function integerFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function sslConfig(): PoolConfig["ssl"] {
  const mode = (process.env.DATABASE_SSL || "").trim().toLowerCase();
  if (!mode || mode === "false" || mode === "disable") return undefined;
  if (mode === "no-verify") return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required before accessing the PostgreSQL data store",
    );
  }

  const pool = new Pool({
    connectionString,
    ssl: sslConfig(),
    application_name: process.env.DATABASE_APPLICATION_NAME || "trip-web",
    max: integerFromEnv("DATABASE_POOL_MAX", 10),
    idleTimeoutMillis: integerFromEnv("DATABASE_IDLE_TIMEOUT_MS", 30_000),
    connectionTimeoutMillis: integerFromEnv(
      "DATABASE_CONNECT_TIMEOUT_MS",
      5_000,
    ),
    statement_timeout: integerFromEnv("DATABASE_STATEMENT_TIMEOUT_MS", 30_000),
  });

  pool.on("error", (error) => {
    console.error("[database] idle PostgreSQL client error", error);
  });

  return pool;
}

export function getPool(): Pool {
  if (!globalForDatabase.__tripPostgresPool) {
    globalForDatabase.__tripPostgresPool = createPool();
  }
  return globalForDatabase.__tripPostgresPool;
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  return getPool().query<Row>(text, [...values]);
}

function transactionSettings(options: TransactionOptions): string | null {
  const clauses: string[] = [];
  if (options.isolationLevel) {
    clauses.push(`ISOLATION LEVEL ${options.isolationLevel.toUpperCase()}`);
  }
  if (options.readOnly !== undefined) {
    clauses.push(options.readOnly ? "READ ONLY" : "READ WRITE");
  }
  if (options.deferrable !== undefined) {
    clauses.push(options.deferrable ? "DEFERRABLE" : "NOT DEFERRABLE");
  }
  return clauses.length > 0 ? `SET TRANSACTION ${clauses.join(" ")}` : null;
}

export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const settings = transactionSettings(options);
    if (settings) await client.query(settings);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch((rollbackError) => {
      console.error("[database] transaction rollback failed", rollbackError);
    });
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  const pool = globalForDatabase.__tripPostgresPool;
  if (!pool) return;
  delete globalForDatabase.__tripPostgresPool;
  await pool.end();
}
