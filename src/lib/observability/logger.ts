type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED_KEY =
  /(authorization|cookie|password|secret|session|token|credential|api[-_]?key)/i;

function configuredLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  return level === "debug" ||
    level === "info" ||
    level === "warn" ||
    level === "error"
    ? level
    : process.env.NODE_ENV === "production"
      ? "info"
      : "debug";
}

function normalize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(process.env.NODE_ENV !== "production" && value.stack
        ? { stack: value.stack }
        : {}),
    };
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => normalize(item, seen));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = REDACTED_KEY.test(key) ? "[REDACTED]" : normalize(item, seen);
  }
  return output;
}

function write(level: LogLevel, event: string, fields: LogFields = {}): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[configuredLevel()]) return;
  const normalizedFields = normalize(fields) as Record<string, unknown>;
  const record = {
    ...normalizedFields,
    timestamp: new Date().toISOString(),
    level,
    service: "trip-web",
    event,
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: LogFields) => write("debug", event, fields),
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};

export function pathWithoutQuery(path: string): string {
  const question = path.indexOf("?");
  const hash = path.indexOf("#");
  const endCandidates = [question, hash].filter((index) => index >= 0);
  return endCandidates.length ? path.slice(0, Math.min(...endCandidates)) : path;
}
