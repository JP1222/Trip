import { importLegacyArticleAlbumFiles } from "../src/lib/media/import-legacy-article";
import { getArticlePhotos } from "../src/lib/photos";
import { closeDatabase } from "../src/lib/db";

async function main() {
  const id = process.argv[2] || "e7649bb1-d315-4b8f-a327-9069e0c5d786";
  const result = await importLegacyArticleAlbumFiles(id);
  const photos = await getArticlePhotos(id, { includePending: true });
  console.log(
    JSON.stringify(
      {
        articleId: id,
        result,
        count: photos.length,
        sample: photos.slice(0, 2).map((p) => ({
          id: p.id,
          filename: p.filename,
          w: p.width,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
