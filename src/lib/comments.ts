import { randomUUID } from "crypto";
import type { QueryResultRow } from "pg";
import { query, withTransaction } from "./db";
import type { MediaOwner } from "./media/owner";
import { ownerDbColumn } from "./media/owner";
import type { Comment } from "./types";

type CommentRow = QueryResultRow & {
  id: string;
  trip_id: string | null;
  article_id: string | null;
  media_id: string | null;
  author: string;
  body: string;
  created_at: Date | string;
};

function isoTimestamp(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    ...(row.trip_id ? { tripId: row.trip_id } : {}),
    ...(row.article_id ? { articleId: row.article_id } : {}),
    ...(row.media_id ? { photoId: row.media_id } : {}),
    author: row.author,
    body: row.body,
    createdAt: isoTimestamp(row.created_at),
  };
}

const COMMENT_SELECT = `
  SELECT id, trip_id, article_id, media_id, author, body, created_at
  FROM comments
`;

export type CommentScope =
  | { kind: "all" }
  | { kind: "trip" }
  | { kind: "photo"; photoId: string };

export async function getCommentsForOwner(
  owner: MediaOwner,
  scope: CommentScope = { kind: "all" },
): Promise<Comment[]> {
  const col = ownerDbColumn(owner);
  if (scope.kind === "photo") {
    const result = await query<CommentRow>(
      `${COMMENT_SELECT}
       WHERE ${col} = $1 AND media_id = $2
       ORDER BY created_at DESC, id DESC`,
      [owner.id, scope.photoId],
    );
    return result.rows.map(rowToComment);
  }
  if (scope.kind === "trip") {
    // Owner-level notes only (no media). Name kept for trip API compatibility.
    const result = await query<CommentRow>(
      `${COMMENT_SELECT}
       WHERE ${col} = $1 AND media_id IS NULL
       ORDER BY created_at DESC, id DESC`,
      [owner.id],
    );
    return result.rows.map(rowToComment);
  }
  const result = await query<CommentRow>(
    `${COMMENT_SELECT}
     WHERE ${col} = $1
     ORDER BY created_at DESC, id DESC`,
    [owner.id],
  );
  return result.rows.map(rowToComment);
}

/** Trip-level notes only (no photoId). */
export async function getTripComments(tripId: string): Promise<Comment[]> {
  return getCommentsForOwner({ kind: "trip", id: tripId }, { kind: "trip" });
}

/** Comments on one photo. */
export async function getPhotoComments(
  tripId: string,
  photoId: string,
): Promise<Comment[]> {
  return getCommentsForOwner(
    { kind: "trip", id: tripId },
    { kind: "photo", photoId },
  );
}

/** Every comment on the trip (trip notes + photo comments). */
export async function getComments(tripId: string): Promise<Comment[]> {
  return getCommentsForOwner({ kind: "trip", id: tripId }, { kind: "all" });
}

export async function getCommentsByScope(
  tripId: string,
  scope: CommentScope,
): Promise<Comment[]> {
  return getCommentsForOwner({ kind: "trip", id: tripId }, scope);
}

/** photoId → count (owner-level notes excluded). */
export async function getPhotoCommentCountsForOwner(
  owner: MediaOwner,
): Promise<Record<string, number>> {
  const col = ownerDbColumn(owner);
  const result = await query<{ media_id: string; comment_count: string }>(
    `
    SELECT media_id, count(*)::text AS comment_count
    FROM comments
    WHERE ${col} = $1 AND media_id IS NOT NULL
    GROUP BY media_id
  `,
    [owner.id],
  );
  return Object.fromEntries(
    result.rows.map((row) => [row.media_id, Number(row.comment_count)]),
  );
}

export async function getPhotoCommentCounts(
  tripId: string,
): Promise<Record<string, number>> {
  return getPhotoCommentCountsForOwner({ kind: "trip", id: tripId });
}

export async function addCommentForOwner(
  owner: MediaOwner,
  author: string,
  body: string,
  photoId?: string,
): Promise<Comment> {
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
        INSERT INTO comments (id, trip_id, article_id, media_id, author, body)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, trip_id, article_id, media_id, author, body, created_at
      `,
      [
        id,
        owner.kind === "trip" ? owner.id : null,
        owner.kind === "article" ? owner.id : null,
        photoId || null,
        name,
        text,
      ],
    );
    return rowToComment(result.rows[0]);
  });
}

export async function addComment(
  tripId: string,
  author: string,
  body: string,
  photoId?: string,
): Promise<Comment> {
  return addCommentForOwner(
    { kind: "trip", id: tripId },
    author,
    body,
    photoId,
  );
}

export async function deleteComment(
  tripId: string,
  commentId: string,
): Promise<boolean> {
  return withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `DELETE FROM comments WHERE trip_id = $1 AND id = $2 RETURNING id`,
      [tripId, commentId],
    );
    return result.rowCount === 1;
  });
}
