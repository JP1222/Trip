import type { TripWaypoint } from "@/lib/types";

export type LatLng = { lat: number; lng: number };

/** One segment between consecutive waypoints */
export type DrivingLeg = {
  distanceMeters: number;
  durationSeconds: number;
};

/** Road route path + totals from Directions API */
export type DrivingRoute = {
  path: LatLng[];
  /** Total drive distance in meters */
  distanceMeters: number;
  /** Total typical drive time in seconds */
  durationSeconds: number;
  /** Per-hop legs (length = waypoints − 1 when available) */
  legs: DrivingLeg[];
};

/** Collapse consecutive near-duplicates (same pin twice in a row). */
export function uniqueConsecutiveStops(
  stops: Pick<TripWaypoint, "lat" | "lng">[],
): LatLng[] {
  const out: LatLng[] = [];
  for (const s of stops) {
    const prev = out[out.length - 1];
    if (
      prev &&
      Math.abs(prev.lat - s.lat) < 1e-5 &&
      Math.abs(prev.lng - s.lng) < 1e-5
    ) {
      continue;
    }
    out.push({ lat: s.lat, lng: s.lng });
  }
  return out;
}

function cacheKey(provider: string, points: LatLng[]): string {
  // v2: includes legs in payload
  return `${provider}|v2|${points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";")}`;
}

const routeCache = new Map<string, DrivingRoute>();

/**
 * Mapbox Directions (driving) → road path + distance/duration.
 * Falls back to null on error (caller draws straight segments).
 */
export async function fetchMapboxDrivingRoute(
  stops: Pick<TripWaypoint, "lat" | "lng">[],
  token: string,
): Promise<DrivingRoute | null> {
  const points = uniqueConsecutiveStops(stops);
  if (points.length < 2 || !token) return null;

  const key = cacheKey("mapbox", points);
  const hit = routeCache.get(key);
  if (hit) return hit;

  // Mapbox allows up to 25 coordinates per request
  const coords = points
    .slice(0, 25)
    .map((p) => `${p.lng},${p.lat}`)
    .join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: {
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: [number, number][] };
        legs?: { distance?: number; duration?: number }[];
      }[];
    };
    const route = data.routes?.[0];
    if (
      data.code !== "Ok" ||
      !route?.geometry?.coordinates?.length ||
      route.distance == null ||
      route.duration == null
    ) {
      return null;
    }
    const path = route.geometry.coordinates.map(([lng, lat]) => ({
      lat,
      lng,
    }));
    const legs: DrivingLeg[] = (route.legs || [])
      .filter((l) => l.distance != null && l.duration != null)
      .map((l) => ({
        distanceMeters: l.distance as number,
        durationSeconds: l.duration as number,
      }));
    const result: DrivingRoute = {
      path,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      legs,
    };
    routeCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Google Maps Directions Service → road path + distance/duration.
 * Requires Directions library already loadable via @googlemaps/js-api-loader.
 */
export async function fetchGoogleDrivingRoute(
  stops: Pick<TripWaypoint, "lat" | "lng">[],
  directionsService: google.maps.DirectionsService,
): Promise<DrivingRoute | null> {
  const points = uniqueConsecutiveStops(stops);
  if (points.length < 2) return null;

  const key = cacheKey("google", points);
  const hit = routeCache.get(key);
  if (hit) return hit;

  const origin = points[0];
  const destination = points[points.length - 1];
  const waypoints = points.slice(1, -1).slice(0, 23).map((p) => ({
    location: p,
    stopover: true,
  }));

  try {
    const result = await directionsService.route({
      origin,
      destination,
      waypoints,
      travelMode: google.maps.TravelMode.DRIVING,
      optimizeWaypoints: false,
    });
    const route = result.routes?.[0];
    if (!route) return null;

    // Prefer overview_path; fall back to concatenating leg steps
    let path: LatLng[] = [];
    if (route.overview_path?.length) {
      path = route.overview_path.map((ll) => ({
        lat: ll.lat(),
        lng: ll.lng(),
      }));
    } else {
      for (const leg of route.legs || []) {
        for (const step of leg.steps || []) {
          for (const ll of step.path || []) {
            path.push({ lat: ll.lat(), lng: ll.lng() });
          }
        }
      }
    }
    if (path.length < 2) return null;

    let distanceMeters = 0;
    let durationSeconds = 0;
    const legs: DrivingLeg[] = [];
    for (const leg of route.legs || []) {
      const d = leg.distance?.value ?? 0;
      const t = leg.duration?.value ?? 0;
      distanceMeters += d;
      durationSeconds += t;
      if (d > 0 && t > 0) {
        legs.push({ distanceMeters: d, durationSeconds: t });
      }
    }
    if (distanceMeters <= 0 || durationSeconds <= 0) return null;

    const out: DrivingRoute = { path, distanceMeters, durationSeconds, legs };
    routeCache.set(key, out);
    return out;
  } catch {
    return null;
  }
}

/** Straight-line fallback matching previous map behavior. */
export function straightLinePath(
  stops: Pick<TripWaypoint, "lat" | "lng">[],
): LatLng[] {
  return uniqueConsecutiveStops(stops);
}

/** US-friendly distance: miles under ~1k, else mi without decimals. */
export function formatDriveDistance(meters: number): string {
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.max(1, Math.round(meters * 3.28084))} ft`;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/** Compact drive time: "45 min", "1 hr 20 min", "2 hr". */
export function formatDriveDuration(seconds: number): string {
  const totalMin = Math.max(1, Math.round(seconds / 60));
  if (totalMin < 60) return `${totalMin} min`;
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (min === 0) return `${hr} hr`;
  return `${hr} hr ${min} min`;
}

export function formatDriveSummary(
  distanceMeters: number,
  durationSeconds: number,
): string {
  return `${formatDriveDistance(distanceMeters)} · ${formatDriveDuration(durationSeconds)} drive`;
}

/** Parse "07:30" / "7:30" / "15:30" → minutes from midnight. */
export function parseClockToMinutes(time?: string | null): number | null {
  if (!time) return null;
  const m = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes from midnight → "09:17" (24h). */
export function formatMinutesAsClock(totalMinutes: number): string {
  const day = 24 * 60;
  let m = Math.round(totalMinutes) % day;
  if (m < 0) m += day;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * ETA clock from a departure time string + drive duration.
 * Returns null if departure can't be parsed.
 */
export function etaClockFromDepart(
  departTime: string | undefined,
  durationSeconds: number,
): string | null {
  const start = parseClockToMinutes(departTime);
  if (start == null) return null;
  return formatMinutesAsClock(start + durationSeconds / 60);
}
