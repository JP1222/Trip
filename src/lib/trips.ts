import type { QueryResultRow } from "pg";
import { sanitizeBudget } from "./budget";
import { type DbExecutor, getPool, withTransaction } from "./db";
import { locationFromDays } from "./plan";
import { normalizeStopCategory } from "./stop-categories";
import type { DayPlan, Trip, TripBudget, TripLocation } from "./types";

type TripRow = QueryResultRow & {
  id: string;
  title: string;
  subtitle: string;
  destination: string;
  start_date: string;
  end_date: string;
  status: "lived" | "planned";
  cover_gradient: string;
  cover_emoji: string;
  cover_image: string | null;
  showcase: unknown;
  location: unknown;
  summary: string;
  members: unknown;
  tips: unknown;
  days: unknown;
  budget: unknown;
};

const TRIP_SELECT = `
  SELECT
    t.id,
    t.title,
    t.subtitle,
    t.destination,
    t.start_date::text AS start_date,
    t.end_date::text AS end_date,
    t.status,
    t.cover_gradient,
    t.cover_emoji,
    t.cover_image,
    t.showcase,
    t.location,
    t.summary,
    COALESCE(
      (
        SELECT jsonb_agg(member.name ORDER BY member.position)
        FROM trip_members member
        WHERE member.trip_id = t.id
      ),
      '[]'::jsonb
    ) AS members,
    COALESCE(
      (
        SELECT jsonb_agg(tip.body ORDER BY tip.position)
        FROM trip_tips tip
        WHERE tip.trip_id = t.id
      ),
      '[]'::jsonb
    ) AS tips,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'day', day.day_number,
            'date', day.date::text,
            'title', day.title,
            'items', COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_strip_nulls(
                    jsonb_build_object(
                      'id', item.id,
                      'time', item.time_label,
                      'title', item.title,
                      'description', item.description,
                      'location', item.location_label,
                      'category', item.category,
                      'lat', item.latitude,
                      'lng', item.longitude
                    )
                  )
                  ORDER BY item.position
                )
                FROM itinerary_items item
                WHERE item.day_id = day.id
              ),
              '[]'::jsonb
            )
          )
          ORDER BY day.position
        )
        FROM trip_days day
        WHERE day.trip_id = t.id
      ),
      '[]'::jsonb
    ) AS days,
    CASE
      WHEN budget.trip_id IS NULL THEN NULL
      ELSE jsonb_strip_nulls(
        jsonb_build_object(
          'currency', budget.currency,
          'limit', budget.limit_amount,
          'items', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_strip_nulls(
                  jsonb_build_object(
                    'id', item.id,
                    'label', item.label,
                    'amount', item.amount,
                    'category', item.category,
                    'paidBy', item.paid_by
                  )
                )
                ORDER BY item.position
              )
              FROM budget_items item
              WHERE item.trip_id = t.id
            ),
            '[]'::jsonb
          )
        )
      )
    END AS budget
  FROM trips t
  LEFT JOIN trip_budgets budget ON budget.trip_id = t.id
`;

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function objectValue<T>(value: unknown): T | undefined {
  return value != null && typeof value === "object"
    ? (value as T)
    : undefined;
}

function rowToTrip(row: TripRow): Trip {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    coverGradient: row.cover_gradient,
    coverEmoji: row.cover_emoji,
    coverImage: row.cover_image || undefined,
    showcase: objectValue<Trip["showcase"]>(row.showcase),
    location: objectValue<TripLocation>(row.location),
    summary: row.summary,
    members: arrayValue<string>(row.members),
    days: arrayValue<DayPlan>(row.days),
    tips: arrayValue<string>(row.tips),
    budget: objectValue<TripBudget>(row.budget),
    // Plaintext collaboration tokens are intentionally not stored in PostgreSQL.
    collabToken: undefined,
  };
}

async function getTripsFrom(executor: DbExecutor): Promise<Trip[]> {
  const result = await executor.query<TripRow>(`${TRIP_SELECT}
    ORDER BY t.position, t.id
  `);
  return result.rows.map(rowToTrip);
}

async function getTripFrom(
  executor: DbExecutor,
  id: string,
): Promise<Trip | null> {
  const result = await executor.query<TripRow>(`${TRIP_SELECT}
    WHERE t.id = $1
  `, [id]);
  return result.rows[0] ? rowToTrip(result.rows[0]) : null;
}

export async function getTrips(): Promise<Trip[]> {
  return getTripsFrom(getPool());
}

export async function getTrip(id: string): Promise<Trip | null> {
  return getTripFrom(getPool(), id);
}

export type TripEditable = Pick<
  Trip,
  | "title"
  | "subtitle"
  | "destination"
  | "startDate"
  | "endDate"
  | "summary"
  | "members"
  | "tips"
  | "coverImage"
  | "coverEmoji"
  | "status"
  | "days"
  | "location"
  | "collabToken"
  | "budget"
>;

export function tripStatus(trip: Trip): "lived" | "planned" {
  return trip.status === "planned" ? "planned" : "lived";
}

export function isPlannedTrip(trip: Trip): boolean {
  return tripStatus(trip) === "planned";
}

function sanitizeDays(days: DayPlan[]): DayPlan[] {
  return days.map((d, i) => ({
    day: typeof d.day === "number" ? d.day : i + 1,
    date: String(d.date || ""),
    title: String(d.title || `Day ${i + 1}`).trim() || `Day ${i + 1}`,
    items: (d.items || [])
      .filter((it) => it && String(it.title || "").trim())
      .map((it) => {
        const lat =
          it.lat != null && it.lat !== ("" as unknown)
            ? Number(it.lat)
            : undefined;
        const lng =
          it.lng != null && it.lng !== ("" as unknown)
            ? Number(it.lng)
            : undefined;
        const category = normalizeStopCategory(it.category);
        return {
          id: String(it.id || `item-${Math.random().toString(36).slice(2, 8)}`),
          title: String(it.title).trim(),
          time: it.time ? String(it.time).trim() : undefined,
          description: it.description
            ? String(it.description).trim()
            : undefined,
          location: it.location ? String(it.location).trim() : undefined,
          category,
          lat: lat != null && Number.isFinite(lat) ? lat : undefined,
          lng: lng != null && Number.isFinite(lng) ? lng : undefined,
        };
      }),
  }));
}

function sanitizeLocation(
  loc: TripLocation | null | undefined,
): TripLocation | undefined {
  if (!loc || typeof loc !== "object") return undefined;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  const stops = Array.isArray(loc.stops)
    ? loc.stops
        .map((s) => {
          const slat = Number(s.lat);
          const slng = Number(s.lng);
          if (!Number.isFinite(slat) || !Number.isFinite(slng)) return null;
          return {
            id: s.id ? String(s.id) : undefined,
            itemId: s.itemId ? String(s.itemId) : undefined,
            lat: slat,
            lng: slng,
            label: String(s.label || "Stop").trim() || "Stop",
            day: typeof s.day === "number" ? s.day : undefined,
            category: normalizeStopCategory(s.category),
          };
        })
        .filter(Boolean)
    : undefined;
  return {
    lat,
    lng,
    zoom: typeof loc.zoom === "number" ? loc.zoom : undefined,
    label: loc.label ? String(loc.label) : undefined,
    stops: stops && stops.length > 0 ? (stops as TripLocation["stops"]) : undefined,
  };
}

function assertIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD`);
  }
}

async function replaceMembers(
  executor: DbExecutor,
  tripId: string,
  members: string[],
): Promise<void> {
  await executor.query("DELETE FROM trip_members WHERE trip_id = $1", [tripId]);
  for (const [position, name] of members.entries()) {
    await executor.query(
      `INSERT INTO trip_members (trip_id, position, name) VALUES ($1, $2, $3)`,
      [tripId, position, name],
    );
  }
}

async function replaceTips(
  executor: DbExecutor,
  tripId: string,
  tips: string[],
): Promise<void> {
  await executor.query("DELETE FROM trip_tips WHERE trip_id = $1", [tripId]);
  for (const [position, body] of tips.entries()) {
    await executor.query(
      `INSERT INTO trip_tips (trip_id, position, body) VALUES ($1, $2, $3)`,
      [tripId, position, body],
    );
  }
}

function dayRecordId(tripId: string, day: DayPlan, position: number): string {
  return `${tripId}:day:${day.day}:${position}`;
}

async function replaceDays(
  executor: DbExecutor,
  tripId: string,
  days: DayPlan[],
): Promise<void> {
  await executor.query("DELETE FROM trip_days WHERE trip_id = $1", [tripId]);
  for (const [dayPosition, day] of days.entries()) {
    assertIsoDate(day.date, `days[${dayPosition}].date`);
    const dayId = dayRecordId(tripId, day, dayPosition);
    await executor.query(
      `
        INSERT INTO trip_days (id, trip_id, position, day_number, date, title)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [dayId, tripId, dayPosition, day.day, day.date, day.title],
    );
    for (const [itemPosition, item] of day.items.entries()) {
      await executor.query(
        `
          INSERT INTO itinerary_items (
            id, day_id, trip_id, position, time_label, title, description,
            location_label, category, latitude, longitude
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          item.id,
          dayId,
          tripId,
          itemPosition,
          item.time || null,
          item.title,
          item.description || null,
          item.location || null,
          item.category || null,
          item.lat ?? null,
          item.lng ?? null,
        ],
      );
    }
  }
}

async function replaceBudget(
  executor: DbExecutor,
  tripId: string,
  budget: TripBudget,
): Promise<void> {
  await executor.query("DELETE FROM trip_budgets WHERE trip_id = $1", [tripId]);
  await executor.query(
    `
      INSERT INTO trip_budgets (trip_id, currency, limit_amount)
      VALUES ($1, $2, $3)
    `,
    [tripId, budget.currency, budget.limit ?? null],
  );
  for (const [position, item] of budget.items.entries()) {
    await executor.query(
      `
        INSERT INTO budget_items (
          id, trip_id, position, label, amount, category, paid_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        item.id,
        tripId,
        position,
        item.label,
        item.amount,
        item.category || null,
        item.paidBy || null,
      ],
    );
  }
}

export async function updateTrip(
  id: string,
  patch: Partial<TripEditable>,
): Promise<Trip | null> {
  return withTransaction(async (client) => {
    const locked = await client.query<{ id: string }>(
      "SELECT id FROM trips WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!locked.rows[0]) return null;

    const current = await getTripFrom(client, id);
    if (!current) return null;
    const next: Trip = { ...current };

    if (patch.title !== undefined) next.title = patch.title;
    if (patch.subtitle !== undefined) next.subtitle = patch.subtitle;
    if (patch.destination !== undefined) next.destination = patch.destination;
    if (patch.startDate !== undefined) next.startDate = patch.startDate;
    if (patch.endDate !== undefined) next.endDate = patch.endDate;
    if (patch.summary !== undefined) next.summary = patch.summary;
    if (patch.members !== undefined) next.members = patch.members;
    if (patch.tips !== undefined) next.tips = patch.tips;
    if (patch.coverEmoji !== undefined) next.coverEmoji = patch.coverEmoji;
    if (patch.coverImage !== undefined) {
      next.coverImage = patch.coverImage || undefined;
    }
    if (patch.status !== undefined) {
      next.status = patch.status === "planned" ? "planned" : "lived";
    }
    if (patch.location !== undefined) {
      next.location = sanitizeLocation(patch.location);
    }
    if (patch.days !== undefined) {
      next.days = sanitizeDays(patch.days);
      const derived = locationFromDays(
        next.days,
        next.location,
        next.destination,
      );
      if (derived?.stops && derived.stops.length > 0) next.location = derived;
    }
    // patch.collabToken is deliberately ignored. Capabilities store only hashes.
    if (patch.budget !== undefined) {
      next.budget = sanitizeBudget(patch.budget as TripBudget) ?? {
        currency: "USD",
        items: [],
      };
    }

    assertIsoDate(next.startDate, "startDate");
    assertIsoDate(next.endDate, "endDate");
    await client.query(
      `
        UPDATE trips
        SET
          title = $2,
          subtitle = $3,
          destination = $4,
          start_date = $5,
          end_date = $6,
          status = $7,
          cover_emoji = $8,
          cover_image = $9,
          location = $10::jsonb,
          summary = $11,
          version = version + 1,
          updated_at = now()
        WHERE id = $1
      `,
      [
        id,
        next.title,
        next.subtitle,
        next.destination,
        next.startDate,
        next.endDate,
        tripStatus(next),
        next.coverEmoji,
        next.coverImage || null,
        next.location ? JSON.stringify(next.location) : null,
        next.summary,
      ],
    );

    if (patch.members !== undefined) {
      await replaceMembers(client, id, next.members);
    }
    if (patch.tips !== undefined) {
      await replaceTips(client, id, next.tips || []);
    }
    if (patch.days !== undefined) {
      await replaceDays(client, id, next.days);
    }
    if (patch.budget !== undefined && next.budget) {
      await replaceBudget(client, id, next.budget);
    }

    return getTripFrom(client, id);
  });
}

/** Reorder trips as they appear on the home wall. Unknown ids ignored; missing ids appended. */
export async function reorderTrips(orderedIds: string[]): Promise<Trip[]> {
  return withTransaction(async (client) => {
    const current = await client.query<{ id: string }>(`
      SELECT id FROM trips ORDER BY position, id FOR UPDATE
    `);
    const remaining = new Set(current.rows.map((row) => row.id));
    const nextIds: string[] = [];

    for (const id of orderedIds) {
      if (!remaining.delete(id)) continue;
      nextIds.push(id);
    }
    for (const row of current.rows) {
      if (remaining.delete(row.id)) nextIds.push(row.id);
    }

    await client.query("SET CONSTRAINTS trips_position_unique DEFERRED");
    await client.query(
      `
        UPDATE trips AS trip
        SET
          position = ordered.ordinal::integer - 1,
          version = trip.version + 1,
          updated_at = now()
        FROM unnest($1::text[]) WITH ORDINALITY AS ordered(id, ordinal)
        WHERE trip.id = ordered.id
      `,
      [nextIds],
    );
    return getTripsFrom(client);
  });
}

/** Parse YYYY-MM-DD as local calendar day (avoid UTC off-by-one) */
function parseDay(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function formatDateRange(start: string, end: string): string {
  const s = parseDay(start);
  const e = parseDay(end);
  const opts: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
  };
  const year = s.getFullYear();
  const startLabel = s.toLocaleDateString("en-US", opts);
  if (start === end) return `${year} · ${startLabel}`;
  const endLabel = e.toLocaleDateString("en-US", opts);
  return `${year} · ${startLabel} – ${endLabel}`;
}

export function tripDurationDays(start: string, end: string): number {
  const ms = parseDay(end).getTime() - parseDay(start).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}
