import { randomUUID } from "crypto";
import { getPool } from "./db";
import {
  getDecorById,
  type BoardDecorItem,
  type DecorCategory,
} from "./board-decor";

export type WallObjectKind = DecorCategory;

export type WallObject = {
  id: string;
  catalogId: string;
  kind: WallObjectKind;
  /** Percent of cork surface width (0–100) */
  x: number;
  /** Percent of cork surface height (0–100) */
  y: number;
  rotate: number;
  scale: number;
  z: number;
  label: string;
  createdAt: string;
  updatedAt: string;
};

type WallObjectRow = {
  id: string;
  catalog_id: string;
  kind: string;
  x: string | number;
  y: string | number;
  rotate: string | number;
  scale: string | number;
  z: number;
  label: string;
  created_at: Date | string;
  updated_at: Date | string;
};

const SELECT = `
  id, catalog_id, kind, x, y, rotate, scale, z, label,
  created_at, updated_at
`;

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function mapRow(row: WallObjectRow): WallObject {
  const kind =
    row.kind === "pin" ||
    row.kind === "clip" ||
    row.kind === "note" ||
    row.kind === "widget"
      ? row.kind
      : "widget";
  return {
    id: row.id,
    catalogId: row.catalog_id,
    kind,
    x: Number(row.x),
    y: Number(row.y),
    rotate: Number(row.rotate),
    scale: Number(row.scale),
    z: row.z,
    label: row.label || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listWallObjects(): Promise<WallObject[]> {
  const { rows } = await getPool().query<WallObjectRow>(
    `SELECT ${SELECT}
     FROM wall_objects
     ORDER BY z ASC, created_at ASC, id ASC`,
  );
  return rows.map(mapRow);
}

export async function getWallObject(id: string): Promise<WallObject | null> {
  const { rows } = await getPool().query<WallObjectRow>(
    `SELECT ${SELECT} FROM wall_objects WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export type CreateWallObjectInput = {
  catalogId: string;
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  label?: string;
};

export async function createWallObject(
  input: CreateWallObjectInput,
): Promise<WallObject> {
  const decor = getDecorById(input.catalogId);
  if (!decor) throw new Error("Unknown decoration");

  const id = randomUUID();
  const x = clamp(input.x ?? 20 + Math.random() * 60, -10, 110);
  const y = clamp(input.y ?? 15 + Math.random() * 55, -10, 110);
  const rotate =
    input.rotate ??
    (Math.random() * 16 - 8);
  const scale = clamp(input.scale ?? decor.defaultScale, 0.25, 4);
  const label = (input.label ?? decor.vinylLabel ?? decor.defaultText ?? "")
    .trim()
    .slice(0, 80);

  const { rows: zRows } = await getPool().query<{ next: number }>(
    `SELECT COALESCE(MAX(z), 0) + 1 AS next FROM wall_objects`,
  );
  const z = Number(zRows[0]?.next ?? 1);

  const { rows } = await getPool().query<WallObjectRow>(
    `INSERT INTO wall_objects (
       id, catalog_id, kind, x, y, rotate, scale, z, label
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${SELECT}`,
    [id, decor.id, decor.category, x, y, rotate, scale, z, label],
  );
  return mapRow(rows[0]);
}

export type UpdateWallObjectInput = {
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  z?: number;
  label?: string;
  bringToFront?: boolean;
};

export async function updateWallObject(
  id: string,
  input: UpdateWallObjectInput,
): Promise<WallObject | null> {
  const current = await getWallObject(id);
  if (!current) return null;

  let z = current.z;
  if (input.bringToFront) {
    const { rows } = await getPool().query<{ next: number }>(
      `SELECT COALESCE(MAX(z), 0) + 1 AS next FROM wall_objects`,
    );
    z = Number(rows[0]?.next ?? current.z + 1);
  } else if (input.z !== undefined) {
    z = Math.floor(input.z);
  }

  const x =
    input.x !== undefined ? clamp(input.x, -25, 125) : current.x;
  const y =
    input.y !== undefined ? clamp(input.y, -25, 125) : current.y;
  const rotate = input.rotate !== undefined ? input.rotate : current.rotate;
  const scale =
    input.scale !== undefined
      ? clamp(input.scale, 0.25, 4)
      : current.scale;
  const label =
    input.label !== undefined
      ? input.label.trim().slice(0, 80)
      : current.label;

  const { rows } = await getPool().query<WallObjectRow>(
    `UPDATE wall_objects
     SET x = $2, y = $3, rotate = $4, scale = $5, z = $6, label = $7,
         updated_at = now()
     WHERE id = $1
     RETURNING ${SELECT}`,
    [id, x, y, rotate, scale, z, label],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteWallObject(id: string): Promise<boolean> {
  const result = await getPool().query(
    `DELETE FROM wall_objects WHERE id = $1`,
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Resolve catalog metadata for a placed object (null if catalog entry removed). */
export function decorForObject(obj: WallObject): BoardDecorItem | null {
  return getDecorById(obj.catalogId) ?? null;
}
