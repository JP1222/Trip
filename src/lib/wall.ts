import type { Article, PhotoMeta, Trip } from "./types";
import { resolveTripCoverUrl } from "./media-url";
import { parseStickyNoteLabel } from "./sticky-note";
import { applyWallOrder } from "./wall-order";
import type { WallNote } from "./wall-notes";
import type {
  WallDisplaySize,
  WallFrameStyle,
  WallPhoto,
} from "./wall-photos";
import {
  wallPhotoDisplayOrientation,
  wallPhotoHasLabels,
} from "./wall-photos";

function isPlannedTrip(t: Trip): boolean {
  return t.status === "planned";
}

export type WallItemKind = "trip" | "photo" | "empty" | "note" | "article";
export type WallPhotoOrientation = "landscape" | "portrait" | "square";

export type WallItem = {
  kind: WallItemKind;
  id: string;
  /** Trip / article link; standalone photos, empty slots omit it. */
  href?: string;
  src?: string;
  /** Optional fixed print direction; otherwise inferred from the loaded image. */
  orientation?: WallPhotoOrientation;
  /** May be empty for unlabeled board prints */
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
  /** Board photo frame skin */
  frameStyle?: WallFrameStyle;
  /** Relative print size on the cork board */
  displaySize?: WallDisplaySize;
  /** Hide caption strip when both caption and meta are empty */
  hideLabels?: boolean;
};

/** Convert the stored Tailwind-style color stops into a portable CSS gradient. */
export function coverGradientToCss(value?: string): string | undefined {
  const colors = value?.match(/#[0-9a-fA-F]{6}/g);
  if (!colors || colors.length < 2) return undefined;

  if (colors.length === 2) {
    return `linear-gradient(145deg, ${colors[0]} 0%, ${colors[1]} 100%)`;
  }

  return `linear-gradient(145deg, ${colors[0]} 0%, ${colors[1]} 52%, ${colors[colors.length - 1]} 100%)`;
}

/** First stop of a trip cover — used for status-bar / overscroll chrome. */
export function coverChromeColor(
  value?: string,
  fallback = "#efeae2",
): string {
  const colors = value?.match(/#[0-9a-fA-F]{6}/g);
  return colors?.[0] ?? fallback;
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
  // Full public original (media full.jpg); never dead /uploads covers.
  const coverSrc = resolveTripCoverUrl(t.coverImage, tripPhotos);

  const meta = planned
    ? `Planning · ${formatPolaroidPlace(t.destination) || "TBD"}`
    : formatPolaroidMeta(t.startDate, t.endDate, t.destination);

  return {
    kind: "trip",
    id: `trip-${t.id}`,
    href: `/trips/${t.id}`,
    src: coverSrc,
    caption: t.title,
    sub: t.destination,
    meta,
    dateLabel: meta,
    planned,
    coverGradient: coverGradientToCss(t.coverGradient),
    coverEmoji: t.coverEmoji,
  };
}

function wallPhotoToItem(photo: WallPhoto): WallItem {
  const hasLabels = wallPhotoHasLabels(photo);
  return {
    kind: "photo",
    id: `wall-photo-${photo.id}`,
    src: photo.src,
    orientation: wallPhotoDisplayOrientation(photo),
    caption: photo.caption.trim(),
    meta: photo.meta.trim() || undefined,
    frameStyle: photo.frameStyle,
    displaySize: photo.displaySize,
    hideLabels: !hasLabels,
  };
}

function formatArticleWallDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function articleToWallItem(article: Article): WallItem | null {
  if (article.status !== "published") return null;
  if (article.wallStyle === "none") return null;

  const href = `/blog/${article.slug}`;
  const dateLine = formatArticleWallDate(article.publishedAt);

  if (article.wallStyle === "note") {
    const noteLines = article.excerpt
      ? article.excerpt
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 4)
      : dateLine
        ? [dateLine, "Tap to read →"]
        : ["Tap to read →"];
    return {
      kind: "note",
      id: `article-note-${article.id}`,
      href,
      caption: article.title,
      noteLines,
      noteSignature: "Writing",
    };
  }

  // polaroid
  return {
    kind: "article",
    id: `article-polaroid-${article.id}`,
    href,
    src: article.coverImage,
    caption: article.title,
    sub: "Essay",
    meta: dateLine || "Writing",
    dateLabel: dateLine || "Writing",
    coverGradient: "linear-gradient(145deg, #5a8582 0%, #3d6664 52%, #2a4543 100%)",
    coverEmoji: "✎",
  };
}

function wallNoteToItem(note: WallNote): WallItem {
  const { title, lines, signature } = parseStickyNoteLabel(note.label);
  return {
    kind: "note",
    id: `board-note-${note.id}`,
    caption: title,
    noteLines: lines,
    noteSignature: signature,
  };
}

/**
 * Cork wall: grid pins (photos, notes, articles, trips).
 *
 * `wallOrder` is interleaved slot keys (`trip:` / `photo:` / `article:` / `note:`).
 * Default with no saved order: notes → photos → articles → planned → lived.
 */
export function buildWallItems(
  trips: Trip[],
  photosByTrip?: Map<string, PhotoMeta[]>,
  boardPhotos: WallPhoto[] = [],
  articles: Article[] = [],
  wallOrder: string[] = [],
  boardNotes: WallNote[] = [],
): WallItem[] {
  const tripItems = trips.map((t) => tripToWallItem(t, photosByTrip));
  const plannedCount = tripItems.filter((i) => i.planned).length;
  const items: WallItem[] = [];
  const planned = tripItems.filter((i) => i.planned);
  const lived = tripItems.filter((i) => !i.planned);

  type Pin = { key: string; item: WallItem };
  const pins: Pin[] = [];
  for (const note of boardNotes) {
    pins.push({
      key: `note:${note.id}`,
      item: wallNoteToItem(note),
    });
  }
  for (const photo of boardPhotos) {
    pins.push({
      key: `photo:${photo.id}`,
      item: wallPhotoToItem(photo),
    });
  }
  for (const article of articles) {
    const item = articleToWallItem(article);
    if (item) pins.push({ key: `article:${article.id}`, item });
  }
  for (const trip of [...planned, ...lived]) {
    const tripId = trip.id.startsWith("trip-")
      ? trip.id.slice("trip-".length)
      : trip.id;
    pins.push({ key: `trip:${tripId}`, item: trip });
  }

  const orderedPins =
    wallOrder.length > 0
      ? applyWallOrder(pins, wallOrder, (pin) => pin.key)
      : pins;
  items.push(...orderedPins.map((pin) => pin.item));

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
