import { PolaroidWall } from "@/components/PolaroidWall";
import { getPhotos } from "@/lib/photos";
import { getTrips } from "@/lib/trips";
import { buildWallItems } from "@/lib/wall";

export const dynamic = "force-dynamic";

export default async function Home() {
  const trips = await getTrips();
  const photoLists = await Promise.all(
    trips.map(async (t) => [t.id, await getPhotos(t.id)] as const),
  );
  const photosByTrip = new Map(photoLists);
  const items = buildWallItems(trips, photosByTrip);

  return (
    <div className="relative">
      <h1 className="sr-only">Our trips</h1>
      <PolaroidWall items={items} />
    </div>
  );
}
