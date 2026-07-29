import type { Instrumentation } from "next";
import { logger, pathWithoutQuery } from "@/lib/observability/logger";

export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.APP_RUNTIME_ROLE !== "web"
  ) {
    return;
  }

  const { validateProductionEnvironment } = await import("@/lib/security/env");
  validateProductionEnvironment();

  const { migrateDatabase } = await import("@/lib/db");
  try {
    await migrateDatabase();
    logger.info("web_runtime_ready", {
      runtimeRole: process.env.APP_RUNTIME_ROLE,
    });
  } catch (error) {
    logger.error("database_migration_failed", { error });
    throw error;
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const incomingRequestId = request.headers["x-request-id"];
  const requestId = Array.isArray(incomingRequestId)
    ? incomingRequestId[0]
    : incomingRequestId;
  logger.error("next_request_error", {
    requestId,
    method: request.method,
    path: pathWithoutQuery(request.path),
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    error,
  });
};

