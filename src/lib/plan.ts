import type {
  DayPlan,
  ItineraryItem,
  StopCategory,
  Trip,
  TripLocation,
  TripWaypoint,
} from "./types";

/** Unified schedule row — one source for list + map selection */
export type PlanStop = {
  id: string;
  day: number;
  dayTitle: string;
  date: string;
  time?: string;
  title: string;
  description?: string;
  place?: string;
  category?: string;
  lat?: number;
  lng?: number;
  /** Marker id on the map (may be shared by several items in one area) */
  pinId?: string;
};

export type DayFilter = "all" | number;

function norm(s: string) {
  return s.trim().toLowerCase();
}

function matchWaypoint(
  item: ItineraryItem,
  day: number,
  dayItems: ItineraryItem[],
  stops: TripWaypoint[],
): TripWaypoint | undefined {
  if (stops.length === 0) return undefined;

  const byItem = stops.find(
    (s) => s.id === item.id || s.itemId === item.id,
  );
  if (byItem) return byItem;

  const dayStops = stops.filter((s) => s.day === day);
  const pool = dayStops.length > 0 ? dayStops : stops;

  // Exact label match
  const labelHit = pool.find(
    (s) =>
      (item.location && norm(s.label) === norm(item.location)) ||
      norm(s.label) === norm(item.title),
  );
  if (labelHit) return labelHit;

  // Single pin for the whole day → every item that day maps to it
  if (dayStops.length === 1) return dayStops[0];

  // Same-order zip within the day
  if (dayStops.length > 0) {
    const idx = dayItems.findIndex((i) => i.id === item.id);
    if (idx >= 0 && idx < dayStops.length) return dayStops[idx];
  }

  return undefined;
}

/** Flatten itinerary + attach coords from item or location.stops */
export function buildPlanStops(trip: Trip): PlanStop[] {
  const stops = trip.location?.stops ?? [];
  const out: PlanStop[] = [];

  for (const day of trip.days) {
    for (const item of day.items) {
      const wp = matchWaypoint(item, day.day, day.items, stops);
      const lat = item.lat ?? wp?.lat;
      const lng = item.lng ?? wp?.lng;
      const pinId =
        wp?.id ||
        wp?.itemId ||
        (lat != null && lng != null
          ? item.lat != null
            ? item.id
            : `pin-d${day.day}-${wp ? stops.indexOf(wp) : item.id}`
          : undefined);

      out.push({
        id: item.id,
        day: day.day,
        dayTitle: day.title,
        date: day.date,
        time: item.time || undefined,
        title: item.title,
        description: item.description,
        place: item.location,
        category: item.category,
        lat,
        lng,
        pinId:
          lat != null && lng != null
            ? pinId || item.id
            : undefined,
      });
    }
  }

  // Orphan map-only stops (no itinerary row)
  const linked = new Set(
    out.map((s) => s.pinId).filter(Boolean) as string[],
  );
  stops.forEach((wp, i) => {
    const id = wp.id || wp.itemId || `orphan-${i}`;
    if (linked.has(id)) return;
    // already represented by day pin shared id?
    const already = out.some(
      (s) =>
        s.lat === wp.lat &&
        s.lng === wp.lng &&
        (s.day === wp.day || wp.day == null),
    );
    if (already) return;
    out.push({
      id,
      day: wp.day ?? 0,
      dayTitle: wp.day != null ? `Day ${wp.day}` : "Map",
      date: "",
      title: wp.label,
      place: wp.label,
      lat: wp.lat,
      lng: wp.lng,
      pinId: id,
    });
  });

  return out;
}

export function filterPlanStops(
  stops: PlanStop[],
  dayFilter: DayFilter,
): PlanStop[] {
  if (dayFilter === "all") return stops;
  return stops.filter((s) => s.day === dayFilter);
}

/** Merge map markers within this distance when places are not clearly distinct. */
const MAP_PIN_MERGE_METERS = 30;

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Normalize place text for “same spot?” checks. */
function normalizePlaceLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[·•|,/]/g, " ")
    .replace(/\bpin\s*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when two stops look like different venues (different shops / places).
 * Close GPS alone is not enough — only merge when labels are not clearly distinct.
 */
function placesClearlyDistinct(
  a: { place?: string; title: string },
  b: { place?: string; title: string },
): boolean {
  const pa = normalizePlaceLabel(a.place || "");
  const pb = normalizePlaceLabel(b.place || "");
  // Prefer place field; fall back to title only when place missing on both sides
  const la = pa || normalizePlaceLabel(a.title);
  const lb = pb || normalizePlaceLabel(b.title);
  if (!la || !lb) return false;
  if (la === lb) return false;
  if (la.includes(lb) || lb.includes(la)) return false;
  // Token overlap (e.g. "UAH campus" vs "UAH · Sparkman")
  const ta = new Set(la.split(" ").filter((t) => t.length > 2));
  const tb = new Set(lb.split(" ").filter((t) => t.length > 2));
  if (ta.size && tb.size) {
    let shared = 0;
    for (const t of ta) if (tb.has(t)) shared += 1;
    const minSize = Math.min(ta.size, tb.size);
    if (shared >= 1 && shared / minSize >= 0.5) return false;
  }
  return true;
}

export type MapPinModel = {
  waypoints: TripWaypoint[];
  /** itinerary stop id → map pin id (after near-merge) */
  pinIdByStopId: Map<string, string>;
};

/**
 * Unique map pins for the current filter, visit order preserved.
 * - Same pinId always collapses.
 * - Points within ~30m with no clear place distinction also collapse to one marker.
 */
export function buildMapPinModel(stops: PlanStop[]): MapPinModel {
  const waypoints: TripWaypoint[] = [];
  const pinIdByStopId = new Map<string, string>();
  /** pin id → representative place/title for distinctness checks */
  const clusterLabel = new Map<
    string,
    { place?: string; title: string; lat: number; lng: number }
  >();

  for (const s of stops) {
    const lat = s.lat;
    const lng = s.lng;
    if (lat == null || lng == null) continue;
    const candidateId = s.pinId || s.id;

    let mergeInto: string | undefined;

    // 1) Exact same pinId already on the map
    if (waypoints.some((w) => w.id === candidateId)) {
      mergeInto = candidateId;
    } else {
      // 2) Near another pin without a clearly different venue name
      for (const wp of waypoints) {
        const wpId = wp.id || wp.itemId;
        if (!wpId) continue;
        const rep = clusterLabel.get(wpId);
        if (!rep) continue;
        const dist = haversineMeters(
          { lat, lng },
          { lat: rep.lat, lng: rep.lng },
        );
        if (dist > MAP_PIN_MERGE_METERS) continue;
        if (
          placesClearlyDistinct(
            { place: s.place, title: s.title },
            { place: rep.place, title: rep.title },
          )
        ) {
          continue;
        }
        mergeInto = wpId;
        break;
      }
    }

    if (mergeInto) {
      pinIdByStopId.set(s.id, mergeInto);
      continue;
    }

    const id = candidateId;
    waypoints.push({
      id,
      lat,
      lng,
      label: s.place || s.title,
      day: s.day || undefined,
      itemId: s.id,
      category: s.category as StopCategory | undefined,
    });
    pinIdByStopId.set(s.id, id);
    clusterLabel.set(id, {
      place: s.place,
      title: s.title,
      lat,
      lng,
    });
  }

  return { waypoints, pinIdByStopId };
}

/** Unique map pins (merged) for the current filter. */
export function planStopsToWaypoints(stops: PlanStop[]): TripWaypoint[] {
  return buildMapPinModel(stops).waypoints;
}

/** Map pin number (1-based) after near-merge — not the itinerary row order. */
export function pinNumberForStop(
  stop: PlanStop,
  filtered: PlanStop[],
): number | undefined {
  if (stop.lat == null && !stop.pinId) return undefined;
  const { waypoints, pinIdByStopId } = buildMapPinModel(filtered);
  const pinId = pinIdByStopId.get(stop.id);
  if (!pinId) return undefined;
  const idx = waypoints.findIndex((w) => w.id === pinId);
  return idx >= 0 ? idx + 1 : undefined;
}

/** Resolved map pin id for list ↔ map selection after clustering. */
export function mapPinIdForStop(
  stop: PlanStop,
  filtered: PlanStop[],
): string | undefined {
  return buildMapPinModel(filtered).pinIdByStopId.get(stop.id);
}

/** Rebuild location.stops from itinerary items that have coordinates */
export function locationFromDays(
  days: DayPlan[],
  previous?: TripLocation,
  destinationLabel?: string,
): TripLocation | undefined {
  const stops: TripWaypoint[] = [];
  for (const day of days) {
    for (const item of day.items) {
      if (item.lat == null || item.lng == null) continue;
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
      stops.push({
        id: item.id,
        itemId: item.id,
        lat: item.lat,
        lng: item.lng,
        label: item.location || item.title,
        day: day.day,
        category: item.category,
      });
    }
  }

  if (stops.length === 0) {
    return previous; // keep city-level pin if no item coords
  }

  const avgLat =
    stops.reduce((a, s) => a + s.lat, 0) / stops.length;
  const avgLng =
    stops.reduce((a, s) => a + s.lng, 0) / stops.length;

  return {
    lat: previous?.lat ?? avgLat,
    lng: previous?.lng ?? avgLng,
    zoom: previous?.zoom ?? (stops.length > 1 ? 11 : 13),
    label: previous?.label || destinationLabel,
    stops,
  };
}

export function newItemId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return `i-${Date.now().toString(36)}`;
}
