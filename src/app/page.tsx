import type { Viewport } from "next";
import { HomeScrollTheme } from "@/components/HomeScrollTheme";
import { PolaroidWall } from "@/components/PolaroidWall";
import { listWallArticles } from "@/lib/articles";
import { countGuestbookEntries } from "@/lib/guestbook";
import { getPhotos } from "@/lib/photos";
import { getPublicTrips } from "@/lib/trips";
import { buildWallItems } from "@/lib/wall";
import { getWallOrder } from "@/lib/wall-order";
import { ensureDefaultWallNotes } from "@/lib/wall-notes";
import { ensureDefaultGuestbookObject } from "@/lib/wall-objects";
import { ensureDefaultWallPhotos } from "@/lib/wall-photos";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#c9a87a",
  /* Keep cork layout as-is; trip pages opt into viewport-fit: cover. */
  viewportFit: "auto",
};

export default async function Home() {
  const trips = await getPublicTrips();
  const [photoLists, boardPhotos, wallArticles, wallOrder, guestbookCount] =
    await Promise.all([
      Promise.all(
        trips.map(async (t) => [t.id, await getPhotos(t.id)] as const),
      ),
      ensureDefaultWallPhotos(),
      listWallArticles(),
      getWallOrder(),
      countGuestbookEntries(),
    ]);
  const [boardNotes, widgets] = await Promise.all([
    ensureDefaultWallNotes({
      trips,
      boardPhotoCount: boardPhotos.length,
    }),
    ensureDefaultGuestbookObject(guestbookCount),
  ]);
  const photosByTrip = new Map(photoLists);
  const items = buildWallItems(
    trips,
    photosByTrip,
    boardPhotos,
    wallArticles,
    wallOrder,
    boardNotes,
  );

  return (
    <div className="relative">
      <HomeScrollTheme />
      <h1 className="sr-only">Trips</h1>
      <PolaroidWall items={items} widgets={widgets} />
    </div>
  );
}
