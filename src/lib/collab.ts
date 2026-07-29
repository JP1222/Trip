/** Client helpers for remembering a trip collaboration invite token. */

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
