import type { PhotoMeta, Trip } from "./types";
import { photoPublicUrl } from "./photos-client";

export type WallItem = {
  kind: "trip";
  id: string;
  href: string;
  src?: string;
  caption: string;
  sub?: string;
  dateLabel?: string;
};

/** e.g. "Jul 4, 2026" or "Apr 30 – May 1, 2026" */
export function formatPolaroidDate(start: string, end: string): string {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  if (Number.isNaN(s.getTime())) return start;

  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();

  if (sameDay || Number.isNaN(e.getTime())) {
    return s.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const sameYear = s.getFullYear() === e.getFullYear();
  const left = s.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const right = e.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${left} – ${right}`;
}

/**
 * Home wall: one polaroid per trip — the entrance to that journey.
 * Gallery photos stay on the trip page, not the home wall.
 */
export function buildWallItems(
  trips: Trip[],
  photosByTrip?: Map<string, PhotoMeta[]>,
): WallItem[] {
  return trips.map((t) => {
    const tripPhotos = photosByTrip?.get(t.id) ?? [];
    const fallback =
      tripPhotos[0] != null
        ? photoPublicUrl(t.id, tripPhotos[0].filename)
        : undefined;

    return {
      kind: "trip" as const,
      id: `trip-${t.id}`,
      href: `/trips/${t.id}`,
      src: t.coverImage || fallback,
      caption: t.title,
      sub: t.destination,
      dateLabel: formatPolaroidDate(t.startDate, t.endDate),
    };
  });
}
