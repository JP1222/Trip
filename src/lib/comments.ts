import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Comment } from "./types";

const commentsRoot = path.join(process.cwd(), "data", "comments");

function filePath(tripId: string) {
  return path.join(commentsRoot, `${tripId}.json`);
}

async function ensure(tripId: string) {
  await fs.mkdir(commentsRoot, { recursive: true });
  try {
    await fs.access(filePath(tripId));
  } catch {
    await fs.writeFile(filePath(tripId), "[]", "utf-8");
  }
}

async function readAll(tripId: string): Promise<Comment[]> {
  await ensure(tripId);
  const raw = await fs.readFile(filePath(tripId), "utf-8");
  return JSON.parse(raw) as Comment[];
}

function sortNewest(list: Comment[]): Comment[] {
  return [...list].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export type CommentScope =
  | { kind: "all" }
  | { kind: "trip" }
  | { kind: "photo"; photoId: string };

/** Trip-level notes only (no photoId). */
export async function getTripComments(tripId: string): Promise<Comment[]> {
  const list = await readAll(tripId);
  return sortNewest(list.filter((c) => !c.photoId));
}

/** Comments on one photo. */
export async function getPhotoComments(
  tripId: string,
  photoId: string,
): Promise<Comment[]> {
  const list = await readAll(tripId);
  return sortNewest(list.filter((c) => c.photoId === photoId));
}

/** Every comment on the trip (trip notes + photo comments). */
export async function getComments(tripId: string): Promise<Comment[]> {
  return sortNewest(await readAll(tripId));
}

export async function getCommentsByScope(
  tripId: string,
  scope: CommentScope,
): Promise<Comment[]> {
  if (scope.kind === "trip") return getTripComments(tripId);
  if (scope.kind === "photo") return getPhotoComments(tripId, scope.photoId);
  return getComments(tripId);
}

/** photoId → count (trip-level notes excluded). */
export async function getPhotoCommentCounts(
  tripId: string,
): Promise<Record<string, number>> {
  const list = await readAll(tripId);
  const counts: Record<string, number> = {};
  for (const c of list) {
    if (!c.photoId) continue;
    counts[c.photoId] = (counts[c.photoId] || 0) + 1;
  }
  return counts;
}

export async function addComment(
  tripId: string,
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

  await ensure(tripId);
  const comment: Comment = {
    id: randomUUID(),
    tripId,
    ...(photoId ? { photoId } : {}),
    author: name,
    body: text,
    createdAt: new Date().toISOString(),
  };
  const list = await readAll(tripId);
  list.unshift(comment);
  await fs.writeFile(filePath(tripId), JSON.stringify(list, null, 2), "utf-8");
  return comment;
}

export async function deleteComment(
  tripId: string,
  commentId: string,
): Promise<boolean> {
  await ensure(tripId);
  const list = await readAll(tripId);
  const next = list.filter((c) => c.id !== commentId);
  if (next.length === list.length) return false;
  await fs.writeFile(filePath(tripId), JSON.stringify(next, null, 2), "utf-8");
  return true;
}
