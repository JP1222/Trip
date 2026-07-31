/** Shared owner identity for trip vs article media. */

export type MediaOwnerKind = "trip" | "article";

export type MediaOwner = {
  kind: MediaOwnerKind;
  id: string;
};

export function tripOwner(tripId: string): MediaOwner {
  return { kind: "trip", id: tripId };
}

export function articleOwner(articleId: string): MediaOwner {
  return { kind: "article", id: articleId };
}

export function ownerFromIds(ids: {
  tripId?: string | null;
  articleId?: string | null;
}): MediaOwner {
  if (ids.articleId) return articleOwner(ids.articleId);
  if (ids.tripId) return tripOwner(ids.tripId);
  throw new Error("Media has no trip or article owner");
}

export function ownerStorageRoot(owner: MediaOwner): "trips" | "articles" {
  return owner.kind === "trip" ? "trips" : "articles";
}

export function ownerDbColumn(owner: MediaOwner): "trip_id" | "article_id" {
  return owner.kind === "trip" ? "trip_id" : "article_id";
}
