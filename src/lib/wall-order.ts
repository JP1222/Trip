import { query, withTransaction } from "./db";

/** Cork-board slot keys: trip:<id> | photo:<id> | article:<id> | note:<id> */
export type WallSlotKey =
  | `trip:${string}`
  | `photo:${string}`
  | `article:${string}`
  | `note:${string}`;

const SLOT_RE = /^(trip|photo|article|note):.+$/;

export function isWallSlotKey(value: string): value is WallSlotKey {
  return SLOT_RE.test(value);
}

export function wallSlotKey(
  kind: "trip" | "photo" | "article" | "note",
  id: string,
): WallSlotKey {
  return `${kind}:${id}` as WallSlotKey;
}

/** Saved interleaved order; empty when the admin has never reordered. */
export async function getWallOrder(): Promise<string[]> {
  const { rows } = await query<{ slot_key: string }>(
    `SELECT slot_key FROM wall_order ORDER BY position ASC, slot_key ASC`,
  );
  return rows.map((r) => r.slot_key);
}

/**
 * Replace the board order. Unknown/invalid keys are dropped; this is the
 * full ordered list of pins the admin currently sees.
 */
export async function setWallOrder(order: string[]): Promise<string[]> {
  const unique = [
    ...new Set(order.map(String).filter((key) => isWallSlotKey(key))),
  ];

  await withTransaction(async (client) => {
    await client.query("SET CONSTRAINTS wall_order_position_unique DEFERRED");
    await client.query("DELETE FROM wall_order");
    for (let i = 0; i < unique.length; i++) {
      await client.query(
        `INSERT INTO wall_order (slot_key, position) VALUES ($1, $2)`,
        [unique[i], i],
      );
    }
  });

  return unique;
}

/**
 * Sort items by saved wall order. Keys missing from `order` keep their
 * relative order and append after the known ones.
 */
export function applyWallOrder<T>(
  items: T[],
  order: string[],
  keyOf: (item: T) => string,
): T[] {
  if (order.length === 0 || items.length <= 1) return items;

  const byKey = new Map<string, T>();
  const originalKeys: string[] = [];
  for (const item of items) {
    const key = keyOf(item);
    byKey.set(key, item);
    originalKeys.push(key);
  }

  const used = new Set<string>();
  const result: T[] = [];
  for (const key of order) {
    const item = byKey.get(key);
    if (item && !used.has(key)) {
      result.push(item);
      used.add(key);
    }
  }
  for (const key of originalKeys) {
    if (!used.has(key)) {
      result.push(byKey.get(key)!);
      used.add(key);
    }
  }
  return result;
}
