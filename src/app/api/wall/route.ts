import { NextResponse } from "next/server";
import { listWallArticles } from "@/lib/articles";
import { getPhotos } from "@/lib/photos";
import { getPublicTrips } from "@/lib/trips";
import { buildWallItems } from "@/lib/wall";
import { ensureDefaultWallPhotos } from "@/lib/wall-photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public cork wall payload — trips, board photos, and pinned articles.
 */
export async function GET() {
  const trips = await getPublicTrips();
  const [photoLists, boardPhotos, wallArticles] = await Promise.all([
    Promise.all(
      trips.map(async (t) => [t.id, await getPhotos(t.id)] as const),
    ),
    ensureDefaultWallPhotos(),
    listWallArticles(),
  ]);
  const photosByTrip = new Map(photoLists);
  const items = buildWallItems(trips, photosByTrip, boardPhotos, wallArticles);
  return NextResponse.json({ items });
}
