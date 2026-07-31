import { getPool, query, withTransaction } from "./db";
import { buildBoardStatsNoteLabel } from "./sticky-note";
import type { Trip } from "./types";

const LABEL_MAX = 2000;
export const DEFAULT_WALL_NOTE_ID = "wall-note-board";
/** Legacy free-floating seed from wall_objects — remove once grid notes exist. */
const LEGACY_FLOATING_NOTE_ID = "wall-note-board";

export type WallNote = {
  id: string;
  label: string;
  /** When true, label is regenerated from trips/photos (classic stats sticky). */
  autoStats: boolean;
  createdAt: string;
  updatedAt: string;
};

type WallNoteRow = {
  id: string;
  label: string;
  auto_stats: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function mapRow(row: WallNoteRow): WallNote {
  return {
    id: row.id,
    label: row.label || "",
    autoStats: Boolean(row.auto_stats),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listWallNotes(): Promise<WallNote[]> {
  const { rows } = await query<WallNoteRow>(
    `SELECT id, label, auto_stats, created_at, updated_at
     FROM wall_notes
     ORDER BY created_at ASC, id ASC`,
  );
  return rows.map(mapRow);
}

export async function getWallNote(id: string): Promise<WallNote | null> {
  const { rows } = await query<WallNoteRow>(
    `SELECT id, label, auto_stats, created_at, updated_at
     FROM wall_notes WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateWallNote(
  id: string,
  label: string,
): Promise<WallNote | null> {
  // Manual edit turns off auto stats so custom copy sticks.
  const { rows } = await query<WallNoteRow>(
    `UPDATE wall_notes
     SET label = $2, auto_stats = false, updated_at = now()
     WHERE id = $1
     RETURNING id, label, auto_stats, created_at, updated_at`,
    [id, label.trim().slice(0, LABEL_MAX)],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Ensure the classic stats sticky exists as a grid cell, with the same
 * dynamic copy as before (years / memories / Next…). Also drops the old
 * floating wall_objects seed.
 */
export async function ensureDefaultWallNotes(input: {
  trips: Trip[];
  boardPhotoCount: number;
}): Promise<WallNote[]> {
  const label = buildBoardStatsNoteLabel(input).slice(0, LABEL_MAX);

  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(872342)");

    const { rows } = await client.query<{ id: string; auto_stats: boolean }>(
      `SELECT id, auto_stats FROM wall_notes WHERE id = $1`,
      [DEFAULT_WALL_NOTE_ID],
    );

    if (!rows[0]) {
      await client.query(
        `INSERT INTO wall_notes (id, label, auto_stats)
         VALUES ($1, $2, true)
         ON CONFLICT (id) DO NOTHING`,
        [DEFAULT_WALL_NOTE_ID, label],
      );
    } else if (rows[0].auto_stats) {
      await client.query(
        `UPDATE wall_notes
         SET label = $2, updated_at = now()
         WHERE id = $1 AND auto_stats = true`,
        [DEFAULT_WALL_NOTE_ID, label],
      );
    }
  });

  await removeLegacyFloatingNote();
  return listWallNotes();
}

async function removeLegacyFloatingNote() {
  await getPool().query(
    `DELETE FROM wall_objects WHERE id = $1 AND kind = 'note'`,
    [LEGACY_FLOATING_NOTE_ID],
  );
}
