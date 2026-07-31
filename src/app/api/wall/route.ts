import { NextResponse } from "next/server";
import { listWallArticles } from "@/lib/articles";
import { getPhotos } from "@/lib/photos";
import { getPublicTrips } from "@/lib/trips";
import { buildWallItems } from "@/lib/wall";
import { getWallOrder } from "@/lib/wall-order";
import { ensureDefaultWallNotes } from "@/lib/wall-notes";
import { listWallObjects } from "@/lib/wall-objects";
import { ensureDefaultWallPhotos } from "@/lib/wall-photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public cork wall payload — trips, board photos, pinned articles, notes, trinkets.
 */
export async function GET() {
  const trips = await getPublicTrips();
  const [photoLists, boardPhotos, wallArticles, wallOrder, widgets] =
    await Promise.all([
      Promise.all(
        trips.map(async (t) => [t.id, await getPhotos(t.id)] as const),
      ),
      ensureDefaultWallPhotos(),
      listWallArticles(),
      getWallOrder(),
      listWallObjects(),
    ]);
  const boardNotes = await ensureDefaultWallNotes({
    trips,
    boardPhotoCount: boardPhotos.length,
  });
  const photosByTrip = new Map(photoLists);
  const items = buildWallItems(
    trips,
    photosByTrip,
    boardPhotos,
    wallArticles,
    wallOrder,
    boardNotes,
  );
  return NextResponse.json({ items, widgets });
}
