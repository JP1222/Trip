import { promises as fs } from "fs";
import path from "path";
import type { Trip } from "./types";

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
>;

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

  trips[index] = next;
  await fs.writeFile(tripsPath, JSON.stringify(trips, null, 2), "utf-8");
  return trips[index];
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
