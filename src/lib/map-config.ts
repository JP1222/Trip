/** Client-side map provider keys (must be NEXT_PUBLIC_* for the browser). */

export type MapProviderId = "mapbox" | "google";

export function getMapboxToken(): string {
  return (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
}

export function getGoogleMapsKey(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
}

export function availableMapProviders(): {
  id: MapProviderId;
  label: string;
  ready: boolean;
  hint?: string;
}[] {
  const mapbox = getMapboxToken();
  const google = getGoogleMapsKey();
  return [
    {
      id: "mapbox",
      label: "Mapbox",
      ready: Boolean(mapbox),
      hint: mapbox ? undefined : "Add NEXT_PUBLIC_MAPBOX_TOKEN",
    },
    {
      id: "google",
      label: "Google",
      ready: Boolean(google),
      hint: google ? undefined : "Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    },
  ];
}

export function defaultMapProvider(): MapProviderId {
  const pref = (process.env.NEXT_PUBLIC_MAP_PROVIDER || "")
    .trim()
    .toLowerCase();
  if (pref === "mapbox" && getMapboxToken()) return "mapbox";
  if (pref === "google" && getGoogleMapsKey()) return "google";
  if (getMapboxToken()) return "mapbox";
  if (getGoogleMapsKey()) return "google";
  // Preferred default when no keys yet (UI shows setup hint)
  return "mapbox";
}

export const MAP_PROVIDER_STORAGE_KEY = "trip-map-provider";
