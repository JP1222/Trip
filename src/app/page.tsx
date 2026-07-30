import { HomeScrollTheme } from "@/components/HomeScrollTheme";
import { PolaroidWall } from "@/components/PolaroidWall";
import { getPhotos } from "@/lib/photos";
import { getTrips } from "@/lib/trips";
import { buildWallItems } from "@/lib/wall";
import { listWallObjects } from "@/lib/wall-objects";
import { ensureDefaultWallPhotos } from "@/lib/wall-photos";

export const dynamic = "force-dynamic";

export default async function Home() {
  const trips = await getTrips();
  const [photoLists, boardPhotos, widgets] = await Promise.all([
    Promise.all(
      trips.map(async (t) => [t.id, await getPhotos(t.id)] as const),
    ),
    ensureDefaultWallPhotos(),
    listWallObjects(),
  ]);
  const photosByTrip = new Map(photoLists);
  const items = buildWallItems(trips, photosByTrip, boardPhotos);

  return (
    <div className="relative">
      <HomeScrollTheme />
      <h1 className="sr-only">Our trips</h1>
      <PolaroidWall items={items} widgets={widgets} />
    </div>
  );
}
