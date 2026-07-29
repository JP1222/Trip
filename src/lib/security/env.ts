import path from "node:path";

const PLACEHOLDER_PATTERN =
  /(change[-_ ]?me|dev[-_ ]?only|example|replace[-_ ]?me|password|secret)/i;

export type SecurityEnvironment = {
  adminUsername: string;
  adminPassword: string;
  appSecret: string;
  appOrigin: string;
  databaseUrl: string;
  mediaPrivateRoot: string;
  mediaPublicRoot: string;
  sessionTtlSeconds: number;
  trustProxyHops: number;
};

let cachedProductionEnvironment: SecurityEnvironment | null = null;

function parseInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  errors: string[],
): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${name} must be an integer between ${min} and ${max}`);
    return fallback;
  }
  return parsed;
}

function parseOrigin(value: string, errors: string[]): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      errors.push("APP_ORIGIN must use https in production");
    }
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      errors.push("APP_ORIGIN must be an origin only (for example https://trip.example.com)");
    }
    return url.origin;
  } catch {
    errors.push("APP_ORIGIN must be a valid absolute URL");
    return value;
  }
}

function parseDatabaseUrl(value: string, errors: string[]): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      errors.push("DATABASE_URL must use the postgres or postgresql protocol");
    }
  } catch {
    errors.push("DATABASE_URL must be a valid PostgreSQL URL");
  }
  return value;
}

function parseMediaRoot(
  name: string,
  value: string,
  errors: string[],
): string {
  if (!path.isAbsolute(value)) {
    errors.push(`${name} must be an absolute path`);
    return value;
  }
  const normalized = path.resolve(value);
  if (normalized === path.parse(normalized).root) {
    errors.push(`${name} cannot be the filesystem root`);
  }
  return normalized;
}

function required(name: string, errors: string[]): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) errors.push(`${name} is required in production`);
  return value;
}

/**
 * Validate every security-critical production setting at process startup.
 * This function intentionally does not run at module import time: Next builds
 * production bundles without runtime secrets. `src/instrumentation.ts` calls it
 * only for the Node.js web runtime before migrations and readiness.
 */
export function validateProductionEnvironment(): SecurityEnvironment {
  if (cachedProductionEnvironment) return cachedProductionEnvironment;

  if (process.env.NODE_ENV !== "production") {
    return getSecurityEnvironment();
  }

  const errors: string[] = [];
  const adminUsername = required("ADMIN_USERNAME", errors);
  const adminPassword = required("ADMIN_PASSWORD", errors);
  const appSecret = required("APP_SECRET", errors);
  const databaseUrl = parseDatabaseUrl(required("DATABASE_URL", errors), errors);
  const appOrigin = parseOrigin(required("APP_ORIGIN", errors), errors);
  const mediaPrivateRoot = parseMediaRoot(
    "MEDIA_PRIVATE_ROOT",
    required("MEDIA_PRIVATE_ROOT", errors),
    errors,
  );
  const mediaPublicRoot = parseMediaRoot(
    "MEDIA_PUBLIC_ROOT",
    required("MEDIA_PUBLIC_ROOT", errors),
    errors,
  );
  const sessionTtlSeconds = parseInteger(
    "ADMIN_SESSION_TTL_SECONDS",
    process.env.ADMIN_SESSION_TTL_SECONDS,
    24 * 60 * 60,
    5 * 60,
    7 * 24 * 60 * 60,
    errors,
  );
  const trustProxyHops = parseInteger(
    "TRUST_PROXY_HOPS",
    process.env.TRUST_PROXY_HOPS,
    1,
    0,
    5,
    errors,
  );

  if (adminUsername.length > 80) {
    errors.push("ADMIN_USERNAME must be at most 80 characters");
  }
  if (adminPassword.length < 16) {
    errors.push("ADMIN_PASSWORD must be at least 16 characters");
  }
  if (PLACEHOLDER_PATTERN.test(adminPassword)) {
    errors.push("ADMIN_PASSWORD cannot contain a placeholder value");
  }
  if (Buffer.byteLength(appSecret, "utf8") < 32) {
    errors.push("APP_SECRET must be at least 32 bytes");
  }
  if (PLACEHOLDER_PATTERN.test(appSecret)) {
    errors.push("APP_SECRET cannot contain a placeholder value");
  }
  if (adminPassword && appSecret && adminPassword === appSecret) {
    errors.push("APP_SECRET must be different from ADMIN_PASSWORD");
  }
  if (
    mediaPrivateRoot &&
    mediaPublicRoot &&
    (mediaPrivateRoot === mediaPublicRoot ||
      mediaPrivateRoot.startsWith(`${mediaPublicRoot}${path.sep}`) ||
      mediaPublicRoot.startsWith(`${mediaPrivateRoot}${path.sep}`))
  ) {
    errors.push("MEDIA_PRIVATE_ROOT and MEDIA_PUBLIC_ROOT must be separate paths");
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid production environment:\n- ${errors.join("\n- ")}`,
    );
  }

  cachedProductionEnvironment = {
    adminUsername,
    adminPassword,
    appSecret,
    appOrigin,
    databaseUrl,
    mediaPrivateRoot,
    mediaPublicRoot,
    sessionTtlSeconds,
    trustProxyHops,
  };
  return cachedProductionEnvironment;
}

/** Runtime access with safe development defaults; production remains strict. */
export function getSecurityEnvironment(): SecurityEnvironment {
  if (process.env.NODE_ENV === "production") {
    return validateProductionEnvironment();
  }

  const workspaceRoot = process.cwd();
  return {
    adminUsername: process.env.ADMIN_USERNAME?.trim() || "admin",
    adminPassword: process.env.ADMIN_PASSWORD || "",
    appSecret:
      process.env.APP_SECRET || "development-only-session-secret-not-for-prod",
    appOrigin: process.env.APP_ORIGIN || "http://localhost:3000",
    databaseUrl: process.env.DATABASE_URL || "",
    mediaPrivateRoot:
      process.env.MEDIA_PRIVATE_ROOT ||
      path.join(workspaceRoot, "runtime", "media-private"),
    mediaPublicRoot:
      process.env.MEDIA_PUBLIC_ROOT ||
      path.join(workspaceRoot, "runtime", "media-public"),
    sessionTtlSeconds: parseInteger(
      "ADMIN_SESSION_TTL_SECONDS",
      process.env.ADMIN_SESSION_TTL_SECONDS,
      24 * 60 * 60,
      5 * 60,
      7 * 24 * 60 * 60,
      [],
    ),
    trustProxyHops: parseInteger(
      "TRUST_PROXY_HOPS",
      process.env.TRUST_PROXY_HOPS,
      0,
      0,
      5,
      [],
    ),
  };
}
