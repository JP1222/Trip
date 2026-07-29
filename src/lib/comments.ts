import { randomUUID } from "crypto";
import type { QueryResultRow } from "pg";
import { query, withTransaction } from "./db";
import type { Comment } from "./types";
import * as commentsJson from "./comments-json";

function useDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

type CommentRow = QueryResultRow & {
  id: string;
  trip_id: string;
  media_id: string | null;
  author: string;
  body: string;
  created_at: Date | string;
};

function isoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    tripId: row.trip_id,
    ...(row.media_id ? { photoId: row.media_id } : {}),
    author: row.author,
    body: row.body,
    createdAt: isoTimestamp(row.created_at),
  };
}

const COMMENT_SELECT = `
  SELECT id, trip_id, media_id, author, body, created_at
  FROM comments
`;

export type CommentScope =
  | { kind: "all" }
  | { kind: "trip" }
  | { kind: "photo"; photoId: string };

/** Trip-level notes only (no photoId). */
export async function getTripComments(tripId: string): Promise<Comment[]> {
  if (!useDatabase()) return commentsJson.getTripComments(tripId);
  const result = await query<CommentRow>(`${COMMENT_SELECT}
    WHERE trip_id = $1 AND media_id IS NULL
    ORDER BY created_at DESC, id DESC
  `, [tripId]);
  return result.rows.map(rowToComment);
}

/** Comments on one photo. */
export async function getPhotoComments(
  tripId: string,
  photoId: string,
): Promise<Comment[]> {
  if (!useDatabase()) return commentsJson.getPhotoComments(tripId, photoId);
  const result = await query<CommentRow>(`${COMMENT_SELECT}
    WHERE trip_id = $1 AND media_id = $2
    ORDER BY created_at DESC, id DESC
  `, [tripId, photoId]);
  return result.rows.map(rowToComment);
}

/** Every comment on the trip (trip notes + photo comments). */
export async function getComments(tripId: string): Promise<Comment[]> {
  if (!useDatabase()) return commentsJson.getComments(tripId);
  const result = await query<CommentRow>(`${COMMENT_SELECT}
    WHERE trip_id = $1
    ORDER BY created_at DESC, id DESC
  `, [tripId]);
  return result.rows.map(rowToComment);
}

export async function getCommentsByScope(
  tripId: string,
  scope: CommentScope,
): Promise<Comment[]> {
  if (!useDatabase()) return commentsJson.getCommentsByScope(tripId, scope);
  if (scope.kind === "trip") return getTripComments(tripId);
  if (scope.kind === "photo") return getPhotoComments(tripId, scope.photoId);
  return getComments(tripId);
}

/** photoId → count (trip-level notes excluded). */
export async function getPhotoCommentCounts(
  tripId: string,
): Promise<Record<string, number>> {
  if (!useDatabase()) return commentsJson.getPhotoCommentCounts(tripId);
  const result = await query<{ media_id: string; comment_count: string }>(`
    SELECT media_id, count(*)::text AS comment_count
    FROM comments
    WHERE trip_id = $1 AND media_id IS NOT NULL
    GROUP BY media_id
  `, [tripId]);
  return Object.fromEntries(
    result.rows.map((row) => [row.media_id, Number(row.comment_count)]),
  );
}

export async function addComment(
  tripId: string,
  author: string,
  body: string,
  photoId?: string,
): Promise<Comment> {
  if (!useDatabase()) {
    return commentsJson.addComment(tripId, author, body, photoId);
  }
  const name = author.trim();
  const text = body.trim();
  if (!name) throw new Error("Please add your name");
  if (!text) throw new Error("Comment cannot be empty");
  if (name.length > 40) throw new Error("Name is too long");
  if (text.length > 1000) throw new Error("Comment is too long (max 1000)");
  if (photoId && photoId.length > 80) throw new Error("Invalid photo");

  return withTransaction(async (client) => {
    const id = randomUUID();
    const result = await client.query<CommentRow>(
      `
        INSERT INTO comments (id, trip_id, media_id, author, body)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, trip_id, media_id, author, body, created_at
      `,
      [id, tripId, photoId || null, name, text],
    );
    return rowToComment(result.rows[0]);
  });
}

export async function deleteComment(
  tripId: string,
  commentId: string,
): Promise<boolean> {
  if (!useDatabase()) return commentsJson.deleteComment(tripId, commentId);
  return withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `DELETE FROM comments WHERE trip_id = $1 AND id = $2 RETURNING id`,
      [tripId, commentId],
    );
    return result.rowCount === 1;
  });
}
