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

/**
 * Unique map pins for the current filter, visit order preserved.
 * Number = 1..n for the filtered set (matches list pin badges when item has coords).
 */
export function planStopsToWaypoints(stops: PlanStop[]): TripWaypoint[] {
  const seen = new Set<string>();
  const wps: TripWaypoint[] = [];

  for (const s of stops) {
    if (s.lat == null || s.lng == null || !s.pinId) continue;
    if (seen.has(s.pinId)) continue;
    seen.add(s.pinId);
    wps.push({
      id: s.pinId,
      lat: s.lat,
      lng: s.lng,
      label: s.place || s.title,
      day: s.day || undefined,
      itemId: s.id,
      category: s.category as StopCategory | undefined,
    });
  }
  return wps;
}

/** Pin number (1-based) for a stop within the filtered list’s unique pins */
export function pinNumberForStop(
  stop: PlanStop,
  filtered: PlanStop[],
): number | undefined {
  if (!stop.pinId || stop.lat == null) return undefined;
  const wps = planStopsToWaypoints(filtered);
  const idx = wps.findIndex((w) => w.id === stop.pinId);
  return idx >= 0 ? idx + 1 : undefined;
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
