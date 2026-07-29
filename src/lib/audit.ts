import { query } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

export type AuditActorType = "admin" | "capability" | "system";

export type AuditEvent = {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  requestId?: string | null;
  ipHash?: string | null;
  details?: Record<string, unknown>;
};

/**
 * Security/administrative history is best-effort at this boundary. Domain
 * mutations remain authoritative; an audit storage failure is emitted as a
 * structured error instead of turning a successful user action into a retry.
 */
export async function writeAuditEvent(event: AuditEvent): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) return;
  try {
    await query(
      `INSERT INTO audit_events (
         actor_type,
         actor_id,
         action,
         entity_type,
         entity_id,
         request_id,
         ip_hash,
         details
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        event.actorType,
        event.actorId ?? null,
        event.action.slice(0, 160),
        event.entityType.slice(0, 120),
        event.entityId ?? null,
        event.requestId ?? null,
        event.ipHash ?? null,
        JSON.stringify(event.details ?? {}),
      ],
    );
  } catch (error) {
    logger.error("audit_event_write_failed", {
      requestId: event.requestId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      error,
    });
  }
}
