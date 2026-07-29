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

export async function getComments(tripId: string): Promise<Comment[]> {
  await ensure(tripId);
  const raw = await fs.readFile(filePath(tripId), "utf-8");
  const list = JSON.parse(raw) as Comment[];
  return list.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function addComment(
  tripId: string,
  author: string,
  body: string,
): Promise<Comment> {
  const name = author.trim();
  const text = body.trim();
  if (!name) throw new Error("Please add your name");
  if (!text) throw new Error("Comment cannot be empty");
  if (name.length > 40) throw new Error("Name is too long");
  if (text.length > 1000) throw new Error("Comment is too long (max 1000)");

  await ensure(tripId);
  const comment: Comment = {
    id: randomUUID(),
    tripId,
    author: name,
    body: text,
    createdAt: new Date().toISOString(),
  };
  const list = await getComments(tripId);
  list.unshift(comment);
  await fs.writeFile(filePath(tripId), JSON.stringify(list, null, 2), "utf-8");
  return comment;
}

export async function deleteComment(
  tripId: string,
  commentId: string,
): Promise<boolean> {
  await ensure(tripId);
  const list = await getComments(tripId);
  const next = list.filter((c) => c.id !== commentId);
  if (next.length === list.length) return false;
  await fs.writeFile(filePath(tripId), JSON.stringify(next, null, 2), "utf-8");
  return true;
}
