/**
 * Fast path: extract poster WebP frames for every video missing one.
 * Does not remux/transcode playback — only the gallery cover.
 *
 *   pnpm exec tsx scripts/generate-video-posters.ts
 *   pnpm exec tsx scripts/generate-video-posters.ts --trip=fall-creek-falls
 */
import path from "path";
import { pathToFileURL } from "url";
import { closeDatabase, query } from "../src/lib/db";
import { getMediaById, publishProcessedMedia } from "../src/lib/media/repository";
import { generateVideoPoster } from "../src/lib/media/video";
import { localMediaStorage } from "../src/lib/media/storage";

async function main(): Promise<void> {
  const tripArg = process.argv.find((arg) => arg.startsWith("--trip="));
  const tripId = tripArg?.slice("--trip=".length).trim() || null;
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required");
  }

  const params: unknown[] = [];
  let where = `
    m.kind = 'video'
    AND m.state <> 'deleted'
    AND NOT EXISTS (
      SELECT 1 FROM media_assets a
      WHERE a.media_id = m.id AND a.role = 'poster'
    )
  `;
  if (tripId) {
    params.push(tripId);
    where += ` AND m.trip_id = $1`;
  }

  const result = await query<{ id: string; trip_id: string; original_name: string }>(
    `SELECT m.id, m.trip_id, m.original_name
     FROM media m
     WHERE ${where}
     ORDER BY m.uploaded_at DESC, m.id`,
    params,
  );

  console.info(`[video-posters] candidates=${result.rows.length}`);
  await localMediaStorage.ensureRoots();

  let ok = 0;
  let failed = 0;
  for (const [index, row] of result.rows.entries()) {
    try {
      const media = await getMediaById(row.id);
      if (!media) throw new Error("missing media row");
      const poster = await generateVideoPoster(media);
      await publishProcessedMedia(media.id, [poster]);
      ok += 1;
      console.info(
        `[video-posters] ${index + 1}/${result.rows.length} ok ${row.trip_id}/${row.original_name}`,
      );
    } catch (error) {
      failed += 1;
      console.error(
        `[video-posters] failed ${row.id}`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.info(JSON.stringify({ ok, failed, total: result.rows.length }));
  if (failed) process.exitCode = 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  main()
    .catch((error) => {
      console.error("[video-posters] crashed", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDatabase().catch(() => undefined);
    });
}
