export type SwayOptions = {
  solo?: boolean;
};

/** Sticky / note cards use a slightly quieter tilt than polaroids. */
export const NOTE_SWAY_SCALE = 0.85;

function normalizeOpts(
  soloOrOpts: boolean | SwayOptions = false,
): SwayOptions {
  return typeof soloOrOpts === "boolean" ? { solo: soloOrOpts } : soloOrOpts;
}

/** Amplitude band: ~1.4° … 3.8°. */
function swayAmplitude(roll: number): number {
  return 1.4 + roll * 2.4;
}

/**
 * Fresh random tilt for a visit. Mild lean-away bias (~62%) keeps neighbors
 * from closing the gap; sign + amplitude still change each load.
 */
export function randomSway(
  index: number,
  soloOrOpts: boolean | SwayOptions = false,
): number {
  const opts = normalizeOpts(soloOrOpts);
  if (opts.solo) return -1;
  const amplitude = swayAmplitude(Math.random());
  const prefer = index % 2 === 0 ? -1 : 1;
  const sign = Math.random() < 0.38 ? -prefer : prefer;
  return Math.round(sign * amplitude * 10) / 10;
}

export type WallSwayItem = {
  id: string;
  kind?: string;
};

/** Roll a visit-scoped tilt map for public + admin boards. */
export function rollWallSway(
  items: WallSwayItem[],
  soloTrip = false,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    next[item.id] = randomSway(index, {
      solo: soloTrip && item.kind === "trip",
    });
  }
  return next;
}

export type WallSwayRect = {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/**
 * Side-by-side pairs on the same row whose boxes overlap horizontally.
 * Stacked (column) cards are ignored — they share x-range on mobile but
 * are not neighbors that sway can collide with.
 */
export function findSideBySideOverlaps(
  rects: WallSwayRect[],
): { a: string; b: string; overlap: number }[] {
  const usable = rects.filter(
    (r) => r.right - r.left >= 24 && r.bottom - r.top >= 24,
  );
  const sorted = [...usable].sort(
    (a, b) => a.top - b.top || a.left - b.left,
  );
  const hits: { a: string; b: string; overlap: number }[] = [];

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const ah = a.bottom - a.top;
      const bh = b.bottom - b.top;
      const midA = (a.top + a.bottom) / 2;
      const midB = (b.top + b.bottom) / 2;
      // Same row: vertical centers close relative to card height.
      if (Math.abs(midA - midB) > Math.min(ah, bh) * 0.35) continue;

      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (overlapX <= 0) continue;
      hits.push({ a: a.id, b: b.id, overlap: overlapX });
    }
  }
  return hits;
}
