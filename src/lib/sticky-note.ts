import type { Trip } from "./types";

/** Parse board sticky `label` into wall-note fields.
 *  Format: first line = title, more lines = body, optional `\n---\n` signature.
 */
export function parseStickyNoteLabel(label: string): {
  title: string;
  lines: string[];
  signature?: string;
} {
  const raw = label.replace(/\r\n/g, "\n").trim();
  if (!raw) return { title: "Note", lines: [] };

  const splitAt = raw.indexOf("\n---\n");
  const body = splitAt >= 0 ? raw.slice(0, splitAt) : raw;
  const signature =
    splitAt >= 0 ? raw.slice(splitAt + "\n---\n".length).trim() : undefined;

  const parts = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    title: parts[0] || "Note",
    lines: parts.slice(1),
    signature: signature || undefined,
  };
}

export function formatStickyNoteLabel(
  title: string,
  lines: string[],
  signature?: string,
): string {
  const body = [title.trim(), ...lines.map((l) => l.trim())]
    .filter(Boolean)
    .join("\n");
  const sig = signature?.trim();
  return sig ? `${body}\n---\n${sig}` : body;
}

/** Same copy as the original hardcoded wall sticky. */
export const BOARD_NOTE_SIGNATURE =
  "Peng · Carlie · Joel · Michelle · Beau · Shreya";

/**
 * Rebuild the classic board stats sticky:
 * Trips / years / N memories pinned / Next… / signature
 */
export function buildBoardStatsNoteLabel(input: {
  trips: Trip[];
  boardPhotoCount: number;
}): string {
  const { trips, boardPhotoCount } = input;
  const planned = trips.filter((t) => t.status === "planned");
  const livedCount = trips.length - planned.length;
  const memoryCount = livedCount + boardPhotoCount;

  const years = trips
    .map((t) => new Date(`${t.startDate}T12:00:00`).getFullYear())
    .filter((y) => !Number.isNaN(y));
  const yMin = years.length ? Math.min(...years) : null;
  const yMax = years.length ? Math.max(...years) : null;
  const yearLine =
    yMin && yMax
      ? yMin === yMax
        ? `${yMin}`
        : `${yMin}–${yMax}`
      : "Our board";

  const nextLine =
    planned.length > 0
      ? planned.length === 1
        ? `Next: ${planned[0]!.title}`
        : `${planned.length} trips in the works`
      : "Where to next?";

  return formatStickyNoteLabel(
    "Trips",
    [
      yearLine,
      `${memoryCount} ${memoryCount === 1 ? "memory" : "memories"} pinned`,
      nextLine,
    ],
    BOARD_NOTE_SIGNATURE,
  );
}

/** @deprecated use buildBoardStatsNoteLabel */
export const DEFAULT_BOARD_NOTE_LABEL = buildBoardStatsNoteLabel({
  trips: [],
  boardPhotoCount: 0,
});
