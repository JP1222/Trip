/** Local storage key for remembering collab token per trip */
export function collabStorageKey(tripId: string) {
  return `trip-collab:${tripId}`;
}

export function readStoredCollabToken(tripId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(collabStorageKey(tripId));
  } catch {
    return null;
  }
}

export function storeCollabToken(tripId: string, token: string) {
  try {
    localStorage.setItem(collabStorageKey(tripId), token);
  } catch {
    /* ignore */
  }
}

export function clearStoredCollabToken(tripId: string) {
  try {
    localStorage.removeItem(collabStorageKey(tripId));
  } catch {
    /* ignore */
  }
}

/** Generate a short shareable secret */
export function generateCollabToken(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function collabEditUrl(tripId: string, token: string, origin?: string) {
  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/trips/${tripId}?edit=${encodeURIComponent(token)}`;
}
