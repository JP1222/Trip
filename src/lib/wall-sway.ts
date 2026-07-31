/** Deterministic hash for stable per-item sway. */
export function wallHash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (s.charCodeAt(i) + ((h << 5) - h)) | 0;
  return Math.abs(h);
}

export type SwayOptions = {
  solo?: boolean;
};

function normalizeOpts(
  soloOrOpts: boolean | SwayOptions = false,
): SwayOptions {
  return typeof soloOrOpts === "boolean" ? { solo: soloOrOpts } : soloOrOpts;
}

/** Shared amplitude band for phone and desktop: ~1.6° … 4.2°. */
function swayAmplitude(roll: number): number {
  return 1.6 + roll * 2.6;
}

/**
 * Fresh random tilt for a visit. Lean-away bias keeps neighbors from
 * swinging into the shared gap; amplitude is rolled each call.
 */
export function randomSway(
  index: number,
  soloOrOpts: boolean | SwayOptions = false,
): number {
  const opts = normalizeOpts(soloOrOpts);
  if (opts.solo) return -1;
  const amplitude = swayAmplitude(Math.random());
  const alternate = index % 2 === 0 ? -1 : 1;
  const flip = Math.random() < 0.125 ? -1 : 1;
  return Math.round(alternate * flip * amplitude * 10) / 10;
}

/**
 * Stable per-id tilt (admin board). Prefer `randomSway` on the public wall.
 */
export function swayForItem(
  id: string,
  index: number,
  soloOrOpts: boolean | SwayOptions = false,
): number {
  const opts = normalizeOpts(soloOrOpts);
  if (opts.solo) return -1;
  const h = wallHash(id);
  const amplitude = swayAmplitude((h % 27) / 26);
  const alternate = index % 2 === 0 ? -1 : 1;
  const flip = h % 8 === 0 ? -1 : 1;
  return Math.round(alternate * flip * amplitude * 10) / 10;
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
