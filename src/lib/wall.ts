import type { PhotoMeta, Trip } from "./types";
import { photoPublicUrl } from "./photos-client";

function isPlannedTrip(t: Trip): boolean {
  return t.status === "planned";
}

export type WallItemKind = "trip" | "empty" | "note";

export type WallItem = {
  kind: WallItemKind;
  id: string;
  /** Trip link; empty/note may omit */
  href?: string;
  src?: string;
  caption: string;
  /** Full destination for fallbacks / cover art */
  sub?: string;
  /**
   * Single meta line under the title, always the same shape:
   * "Jul 18, 2026 · Phil Campbell, AL"
   */
  meta?: string;
  /** @deprecated use meta */
  dateLabel?: string;
  /** planned trips get a dashed “planning” polaroid */
  planned?: boolean;
  /** CSS gradient used when a trip has no cover photo */
  coverGradient?: string;
  /** Small destination mark used on illustrated covers */
  coverEmoji?: string;
  /** sticky-note body lines */
  noteLines?: string[];
  /** handwritten names at the foot of a sticky note */
  noteSignature?: string;
};

/** Convert the stored Tailwind-style color stops into a portable CSS gradient. */
function coverGradientToCss(value?: string): string | undefined {
  const colors = value?.match(/#[0-9a-fA-F]{6}/g);
  if (!colors || colors.length < 2) return undefined;

  if (colors.length === 2) {
    return `linear-gradient(145deg, ${colors[0]} 0%, ${colors[1]} 100%)`;
  }

  return `linear-gradient(145deg, ${colors[0]} 0%, ${colors[1]} 52%, ${colors[colors.length - 1]} 100%)`;
}

const US_STATE_ABBR: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
  "District of Columbia": "DC",
};

/**
 * Compact date for polaroid footers.
 * - same day: "Jul 18, 2026"
 * - same month: "Apr 22–25, 2025"
 * - cross month: "Apr 30 – May 1, 2026"
 */
export function formatPolaroidDate(start: string, end: string): string {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  if (Number.isNaN(s.getTime())) return start;

  const sameDay =
    !Number.isNaN(e.getTime()) &&
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();

  if (sameDay || Number.isNaN(e.getTime()) || start === end) {
    return s.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();

  if (sameMonth) {
    const month = s.toLocaleDateString("en-US", { month: "short" });
    return `${month} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }

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
 * Parse destination into parts.
 * Preferred storage: "Place · Region · Country"
 * Also accepts legacy "Country · Region · Place".
 */
function parseDestination(destination: string): {
  place?: string;
  region?: string;
  country?: string;
} {
  const parts = destination
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return {};

  const isCountry = (s: string) => {
    const u = s.toUpperCase();
    return (
      u === "USA" ||
      u === "US" ||
      u === "UNITED STATES" ||
      u === "CHINA" ||
      u === "CN" ||
      u === "JAPAN" ||
      u === "JP"
    );
  };

  // Legacy: Country first
  if (isCountry(parts[0])) {
    if (parts.length === 1) return { country: parts[0] };
    if (parts.length === 2) {
      return { country: parts[0], place: parts[1] };
    }
    return {
      country: parts[0],
      region: parts[1],
      place: parts[2],
    };
  }

  // Preferred: Place · Region · Country
  if (parts.length === 1) return { place: parts[0] };
  if (parts.length === 2) {
    if (isCountry(parts[1])) {
      return { place: parts[0], country: parts[1] };
    }
    return { place: parts[0], region: parts[1] };
  }
  return {
    place: parts[0],
    region: parts[1],
    country: parts[2],
  };
}

function abbreviateRegion(region: string, country?: string): string {
  const c = (country || "").toUpperCase();
  if (c === "USA" || c === "US" || c === "UNITED STATES" || !country) {
    return US_STATE_ABBR[region] || region;
  }
  return region;
}

/**
 * Human place for polaroid: always "Place, Region" style when possible.
 */
export function formatPolaroidPlace(destination: string): string {
  const { place, region, country } = parseDestination(destination);
  const c = (country || "").toUpperCase();
  const isUS = c === "USA" || c === "US" || c === "UNITED STATES";
  const isChina = c === "CHINA" || c === "CN";

  if (place && !region && country) {
    if (isUS || isChina) {
      return isChina || place.toUpperCase() !== c
        ? `${place}, ${isUS ? "USA" : country}`
        : place;
    }
    return `${place}, ${country}`;
  }

  if (place && region) {
    const reg = abbreviateRegion(region, country);
    if (place.toLowerCase() === region.toLowerCase()) {
      return isUS ? reg : region;
    }
    return `${place}, ${reg}`;
  }

  if (place) return place;
  if (region) return abbreviateRegion(region, country);
  if (country) return country;
  return destination;
}

/** Full polaroid footer meta: "Apr 22–25, 2025 · Beijing, China" */
export function formatPolaroidMeta(
  startDate: string,
  endDate: string,
  destination: string,
): string {
  const date = formatPolaroidDate(startDate, endDate);
  const place = formatPolaroidPlace(destination);
  if (date && place) return `${date} · ${place}`;
  return date || place || "";
}

function tripToWallItem(
  t: Trip,
  photosByTrip?: Map<string, PhotoMeta[]>,
): WallItem {
  const planned = isPlannedTrip(t);
  const tripPhotos = photosByTrip?.get(t.id) ?? [];
  const fallback =
    tripPhotos[0] != null
      ? photoPublicUrl(t.id, tripPhotos[0].filename)
      : undefined;

  const meta = planned
    ? `Planning · ${formatPolaroidPlace(t.destination) || "TBD"}`
    : formatPolaroidMeta(t.startDate, t.endDate, t.destination);

  return {
    kind: "trip",
    id: `trip-${t.id}`,
    href: `/trips/${t.id}`,
    src: planned ? t.coverImage || undefined : t.coverImage || fallback,
    caption: t.title,
    sub: t.destination,
    meta,
    dateLabel: meta,
    planned,
    coverGradient: coverGradientToCss(t.coverGradient),
    coverEmoji: t.coverEmoji,
  };
}

/**
 * Home wall: trip polaroids + a sticky note + open “coming soon” slots
 * so the board feels alive when you’re still planning.
 */
export function buildWallItems(
  trips: Trip[],
  photosByTrip?: Map<string, PhotoMeta[]>,
): WallItem[] {
  const tripItems = trips.map((t) => tripToWallItem(t, photosByTrip));
  const plannedCount = tripItems.filter((i) => i.planned).length;
  const livedCount = tripItems.length - plannedCount;

  const years = trips
    .map((t) => new Date(`${t.startDate}T12:00:00`).getFullYear())
    .filter((y) => !Number.isNaN(y));
  const yMin = years.length ? Math.min(...years) : null;
  const yMax = years.length ? Math.max(...years) : null;
  const yearLine =
    yMin && yMax
      ? yMin === yMax
        ? `${yMin}`
        : `${yMin}–${yMax}`
      : "Our board";

  const items: WallItem[] = [];
  const planned = tripItems.filter((i) => i.planned);
  const lived = tripItems.filter((i) => !i.planned);

  // A small board label: human context rather than implementation details.
  items.push({
    kind: "note",
    id: "wall-note-stats",
    caption: "Our trips",
    noteLines: [
      yearLine,
      `${livedCount} ${livedCount === 1 ? "memory" : "memories"} pinned`,
      plannedCount > 0
        ? plannedCount === 1
          ? `Next: ${planned[0].caption}`
          : `${plannedCount} trips in the works`
        : "Where to next?",
    ],
    noteSignature: "Peng · Carlie · Joel · Michelle · Beau · Shreya",
  });

  // Planned first so “coming up” is visible, then lived memories
  items.push(...planned, ...lived);

  // Empty cards are useful on a sparse wall, but compete with real memories on
  // a full one. Once four trips are pinned, let the photographs own the space.
  const emptySlots = tripItems.length < 4 ? (plannedCount > 0 ? 1 : 2) : 0;
  for (let i = 0; i < emptySlots; i++) {
    items.push({
      kind: "empty",
      id: `wall-empty-${i}`,
      caption: i === 0 ? "Coming soon" : "Your idea",
      meta: i === 0 ? "We’re planning…" : "Pin it when ready",
    });
  }

  return items;
}
