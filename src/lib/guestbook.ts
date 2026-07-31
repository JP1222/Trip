import { randomUUID } from "crypto";
import type { QueryResultRow } from "pg";
import { query } from "./db";

export type GuestbookEntry = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

type GuestbookRow = QueryResultRow & {
  id: string;
  author: string;
  body: string;
  created_at: Date | string;
};

const AUTHOR_MAX = 40;
const BODY_MAX = 500;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

function isoTimestamp(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function rowToEntry(row: GuestbookRow): GuestbookEntry {
  return {
    id: row.id,
    author: row.author,
    body: row.body,
    createdAt: isoTimestamp(row.created_at),
  };
}

export async function listGuestbookEntries(
  limit = DEFAULT_LIMIT,
): Promise<GuestbookEntry[]> {
  const capped = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
  const result = await query<GuestbookRow>(
    `SELECT id, author, body, created_at
     FROM guestbook_entries
     ORDER BY created_at DESC, id DESC
     LIMIT $1`,
    [capped],
  );
  return result.rows.map(rowToEntry);
}

export async function countGuestbookEntries(): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM guestbook_entries`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function addGuestbookEntry(
  author: string,
  body: string,
): Promise<GuestbookEntry> {
  const name = author.trim();
  const text = body.trim();
  if (!name) throw new Error("Please add your name");
  if (!text) throw new Error("Message cannot be empty");
  if (name.length > AUTHOR_MAX) throw new Error("Name is too long");
  if (text.length > BODY_MAX) throw new Error("Message is too long (max 500)");

  const id = randomUUID();
  const result = await query<GuestbookRow>(
    `INSERT INTO guestbook_entries (id, author, body)
     VALUES ($1, $2, $3)
     RETURNING id, author, body, created_at`,
    [id, name, text],
  );
  return rowToEntry(result.rows[0]);
}

export async function deleteGuestbookEntry(id: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `DELETE FROM guestbook_entries WHERE id = $1 RETURNING id`,
    [id],
  );
  return result.rowCount === 1;
}

export async function updateGuestbookEntry(
  id: string,
  author: string,
  body: string,
): Promise<GuestbookEntry | null> {
  const name = author.trim();
  const text = body.trim();
  if (!name) throw new Error("Please add a name");
  if (!text) throw new Error("Message cannot be empty");
  if (name.length > AUTHOR_MAX) throw new Error("Name is too long");
  if (text.length > BODY_MAX) throw new Error("Message is too long (max 500)");

  const result = await query<GuestbookRow>(
    `UPDATE guestbook_entries
     SET author = $2, body = $3
     WHERE id = $1
     RETURNING id, author, body, created_at`,
    [id, name, text],
  );
  return result.rows[0] ? rowToEntry(result.rows[0]) : null;
}
