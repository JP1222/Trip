import { promises as fs } from "fs";
import path from "path";
import { sanitizeBudget } from "./budget";
import { locationFromDays } from "./plan";
import { normalizeStopCategory } from "./stop-categories";
import type { DayPlan, Trip, TripBudget, TripLocation } from "./types";

const tripsPath = path.join(process.cwd(), "data", "trips.json");

export async function getTrips(): Promise<Trip[]> {
  const raw = await fs.readFile(tripsPath, "utf-8");
  return JSON.parse(raw) as Trip[];
}

export async function getTrip(id: string): Promise<Trip | null> {
  const trips = await getTrips();
  return trips.find((t) => t.id === id) ?? null;
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

export async function updateTrip(
  id: string,
  patch: Partial<TripEditable>,
): Promise<Trip | null> {
  const trips = await getTrips();
  const index = trips.findIndex((t) => t.id === id);
  if (index < 0) return null;

  const current = trips[index];
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
  // Center pin / zoom first; days may rebuild stops from item coords.
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
    if (derived?.stops && derived.stops.length > 0) {
      next.location = derived;
    }
  }
  if (patch.collabToken !== undefined) {
    const t = String(patch.collabToken || "").trim();
    next.collabToken = t || undefined;
  }
  if (patch.budget !== undefined) {
    next.budget = sanitizeBudget(patch.budget as TripBudget) ?? {
      currency: "USD",
      items: [],
    };
  }

  trips[index] = next;
  await fs.writeFile(tripsPath, JSON.stringify(trips, null, 2), "utf-8");
  return trips[index];
}

/** Reorder trips as they appear on the home wall. Unknown ids ignored; missing ids appended. */
export async function reorderTrips(orderedIds: string[]): Promise<Trip[]> {
  const trips = await getTrips();
  const map = new Map(trips.map((t) => [t.id, t]));
  const next: Trip[] = [];

  for (const id of orderedIds) {
    const t = map.get(id);
    if (t) {
      next.push(t);
      map.delete(id);
    }
  }
  for (const t of trips) {
    if (map.has(t.id)) next.push(t);
  }

  await fs.writeFile(tripsPath, JSON.stringify(next, null, 2), "utf-8");
  return next;
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
  // Same calendar day → "2026 · July 18" (no redundant range)
  if (start === end) {
    return `${year} · ${startLabel}`;
  }
  const endLabel = e.toLocaleDateString("en-US", opts);
  return `${year} · ${startLabel} – ${endLabel}`;
}

export function tripDurationDays(start: string, end: string): number {
  const ms = parseDay(end).getTime() - parseDay(start).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}
