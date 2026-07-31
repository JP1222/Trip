import { randomUUID } from "crypto";
import { getPool } from "./db";
import {
  GUESTBOOK_CATALOG_ID,
  GUESTBOOK_DECOR,
  getDecorById,
  isGuestbookCatalogId,
  type BoardDecorItem,
} from "./board-decor";
import {
  withWallObjectTransform,
  type WallLayout,
  type WallObject,
} from "./wall-object-layout";

export type {
  WallLayout,
  WallObject,
  WallObjectKind,
  WallObjectTransform,
} from "./wall-object-layout";
export {
  WALL_LAYOUT_BREAKPOINT,
  wallLayoutFromWidth,
  wallObjectTransform,
  withWallObjectTransform,
} from "./wall-object-layout";

const LABEL_MAX = 2000;
export const GUESTBOOK_OBJECT_ID = "wall-guestbook";

type WallObjectRow = {
  id: string;
  catalog_id: string;
  kind: string;
  x: string | number;
  y: string | number;
  rotate: string | number;
  scale: string | number;
  mobile_x: string | number;
  mobile_y: string | number;
  mobile_rotate: string | number;
  mobile_scale: string | number;
  z: number;
  label: string;
  created_at: Date | string;
  updated_at: Date | string;
};

const SELECT = `
  id, catalog_id, kind, x, y, rotate, scale,
  mobile_x, mobile_y, mobile_rotate, mobile_scale,
  z, label, created_at, updated_at
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
  const x = Number(row.x);
  const y = Number(row.y);
  const rotate = Number(row.rotate);
  const scale = Number(row.scale);
  return {
    id: row.id,
    catalogId: row.catalog_id,
    kind,
    x,
    y,
    rotate,
    scale,
    mobileX: Number(row.mobile_x),
    mobileY: Number(row.mobile_y),
    mobileRotate: Number(row.mobile_rotate),
    mobileScale: Number(row.mobile_scale),
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
  /** Which layout the initial x/y/rotate/scale apply to (other layout mirrors). */
  layout?: WallLayout;
};

export async function createWallObject(
  input: CreateWallObjectInput,
): Promise<WallObject> {
  const decor = getDecorById(input.catalogId);
  if (!decor) throw new Error("Unknown decoration");

  const id = randomUUID();
  const x = clamp(input.x ?? 20 + Math.random() * 60, -10, 110);
  const y = clamp(input.y ?? 15 + Math.random() * 55, -10, 110);
  const rotate = input.rotate ?? Math.random() * 16 - 8;
  const scale = clamp(input.scale ?? decor.defaultScale, 0.25, 4);
  const label = (input.label ?? decor.vinylLabel ?? decor.defaultText ?? "")
    .trim()
    .slice(0, LABEL_MAX);

  const { rows: zRows } = await getPool().query<{ next: number }>(
    `SELECT COALESCE(MAX(z), 0) + 1 AS next FROM wall_objects`,
  );
  const z = Number(zRows[0]?.next ?? 1);

  // New widgets start mirrored on both layouts until edited separately.
  const { rows } = await getPool().query<WallObjectRow>(
    `INSERT INTO wall_objects (
       id, catalog_id, kind, x, y, rotate, scale,
       mobile_x, mobile_y, mobile_rotate, mobile_scale,
       z, label
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $4, $5, $6, $7,
       $8, $9
     )
     RETURNING ${SELECT}`,
    [id, decor.id, decor.category, x, y, rotate, scale, z, label],
  );
  return mapRow(rows[0]);
}

export type UpdateWallObjectInput = {
  layout?: WallLayout;
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  z?: number;
  label?: string;
  /** Recolor by switching to a sibling catalog item (same shape family). */
  catalogId?: string;
  bringToFront?: boolean;
};

export async function updateWallObject(
  id: string,
  input: UpdateWallObjectInput,
): Promise<WallObject | null> {
  const current = await getWallObject(id);
  if (!current) return null;

  if (id === GUESTBOOK_OBJECT_ID && input.catalogId !== undefined) {
    throw new Error("Guestbook catalog cannot change");
  }

  let catalogId = current.catalogId;
  let kind = current.kind;
  if (input.catalogId !== undefined) {
    const decor = getDecorById(input.catalogId);
    if (!decor) throw new Error("Unknown decoration");
    if (isGuestbookCatalogId(input.catalogId)) {
      throw new Error("Cannot become guestbook");
    }
    catalogId = decor.id;
    kind = decor.category;
  }

  let z = current.z;
  if (input.bringToFront) {
    const { rows } = await getPool().query<{ next: number }>(
      `SELECT COALESCE(MAX(z), 0) + 1 AS next FROM wall_objects`,
    );
    z = Number(rows[0]?.next ?? current.z + 1);
  } else if (input.z !== undefined) {
    z = Math.floor(input.z);
  }

  const layout: WallLayout = input.layout === "mobile" ? "mobile" : "desktop";
  const next = withWallObjectTransform(current, layout, {
    x:
      input.x !== undefined ? clamp(input.x, -25, 125) : undefined,
    y:
      input.y !== undefined ? clamp(input.y, -25, 125) : undefined,
    rotate: input.rotate,
    scale:
      input.scale !== undefined
        ? clamp(input.scale, 0.25, 4)
        : undefined,
  });
  const label =
    input.label !== undefined
      ? input.label.trim().slice(0, LABEL_MAX)
      : current.label;

  const { rows } = await getPool().query<WallObjectRow>(
    `UPDATE wall_objects
     SET catalog_id = $2, kind = $3,
         x = $4, y = $5, rotate = $6, scale = $7,
         mobile_x = $8, mobile_y = $9, mobile_rotate = $10, mobile_scale = $11,
         z = $12, label = $13, updated_at = now()
     WHERE id = $1
     RETURNING ${SELECT}`,
    [
      id,
      catalogId,
      kind,
      next.x,
      next.y,
      next.rotate,
      next.scale,
      next.mobileX,
      next.mobileY,
      next.mobileRotate,
      next.mobileScale,
      z,
      label,
    ],
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

export function guestbookCountLabel(entryCount: number): string {
  if (entryCount <= 0) return "Sign the book";
  if (entryCount === 1) return "1 note inside";
  return `${entryCount} notes inside`;
}

/**
 * Seed the cork guestbook book as a free-placed widget (once), and refresh
 * its count label without resetting position / rotation / scale.
 */
export async function ensureDefaultGuestbookObject(
  entryCount: number,
): Promise<WallObject[]> {
  const label = guestbookCountLabel(entryCount).slice(0, LABEL_MAX);
  const existing = await getWallObject(GUESTBOOK_OBJECT_ID);
  if (!existing) {
    const { rows: zRows } = await getPool().query<{ next: number }>(
      `SELECT COALESCE(MAX(z), 0) + 1 AS next FROM wall_objects`,
    );
    const z = Number(zRows[0]?.next ?? 1);
    const x = 88;
    const y = 14;
    const rotate = 7;
    const scale = GUESTBOOK_DECOR.defaultScale;
    // Slightly lower / more centered on phone by default.
    const mobileX = 82;
    const mobileY = 10;
    await getPool().query(
      `INSERT INTO wall_objects (
         id, catalog_id, kind, x, y, rotate, scale,
         mobile_x, mobile_y, mobile_rotate, mobile_scale,
         z, label
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $6, $7,
         $10, $11
       )`,
      [
        GUESTBOOK_OBJECT_ID,
        GUESTBOOK_CATALOG_ID,
        GUESTBOOK_DECOR.category,
        x,
        y,
        rotate,
        scale,
        mobileX,
        mobileY,
        z,
        label,
      ],
    );
  } else if (existing.label !== label) {
    await getPool().query(
      `UPDATE wall_objects SET label = $2, updated_at = now() WHERE id = $1`,
      [GUESTBOOK_OBJECT_ID, label],
    );
  }
  return listWallObjects();
}
