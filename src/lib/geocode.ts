import { getMapboxToken } from "@/lib/map-config";

export type PlaceSuggestion = {
  id: string;
  name: string;
  placeName: string;
  lat: number;
  lng: number;
};

/**
 * Mapbox forward geocode for place typeahead in the plan editor.
 * Uses the public token (same as the map).
 */
export async function searchPlaces(
  query: string,
  opts?: { proximity?: { lat: number; lng: number }; limit?: number },
): Promise<PlaceSuggestion[]> {
  const token = getMapboxToken();
  const q = query.trim();
  if (!token || q.length < 2) return [];

  const params = new URLSearchParams({
    access_token: token,
    autocomplete: "true",
    limit: String(opts?.limit ?? 5),
    language: "en",
  });
  if (opts?.proximity) {
    params.set(
      "proximity",
      `${opts.proximity.lng},${opts.proximity.lat}`,
    );
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    features?: {
      id: string;
      text?: string;
      place_name?: string;
      center?: [number, number];
    }[];
  };

  return (data.features || [])
    .filter((f) => f.center && f.center.length >= 2)
    .map((f) => ({
      id: f.id,
      name: f.text || f.place_name || "Place",
      placeName: f.place_name || f.text || "Place",
      lng: f.center![0],
      lat: f.center![1],
    }));
}

/**
 * Reverse geocode: lat/lng → place name (map click in plan editor).
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<PlaceSuggestion | null> {
  const token = getMapboxToken();
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const params = new URLSearchParams({
    access_token: token,
    limit: "1",
    language: "en",
  });
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: {
        id: string;
        text?: string;
        place_name?: string;
        center?: [number, number];
      }[];
    };
    const f = data.features?.[0];
    if (!f) return null;
    return {
      id: f.id || `${lat},${lng}`,
      name: f.text || f.place_name || "Pinned place",
      placeName: f.place_name || f.text || "Pinned place",
      lat: f.center?.[1] ?? lat,
      lng: f.center?.[0] ?? lng,
    };
  } catch {
    return null;
  }
}
