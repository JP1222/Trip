/**
 * One-off: publish Dudu Cat article + pin album stills to the cork wall.
 *
 *   set -a && source .env.local && set +a
 *   pnpm exec tsx scripts/import-dudu-cat.ts
 */
import { promises as fs } from "fs";
import path from "path";
import { createArticle, updateArticle } from "../src/lib/articles";
import { closeDatabase } from "../src/lib/db";
import { createWallPhoto } from "../src/lib/wall-photos";

const EXPORT_DIR = "/tmp/dudu-cat-export";

const BODY = `He's gone. He's been sent back to where he came from. It's quiet, just like when he came here. My cousin never said a word before using my $100 to bring him home. I don't have the ability to take care of him well in the future. He's gone, after more than a month together. I found out when I was heading out of my room to get my pizza. He was with me while I was eating my curry at noon. It's kind of sad when I write this down. It's already 6:20 PM.

I know this feeling. I've felt this before. One day when I was a kid, I heard my dog had passed away. I just pretended to be normal, pretended it's okay. I don't want anyone else to think I'm a kid. I don't want my family to see the vulnerable part of me. I hate that feeling. And I was scared they would make fun of me. Maybe someday in the future, at a family party, when they see a dog, they would say, "Peng loves dogs so much, he was crying so hard when his dog passed away," blabla, to another family member. My adult family members can never feel the same way I do. Seems like they're living in another world. I think that's one of the reasons I don't talk to them much.

It is what it is. Bruce is no longer by my side. Bruce is the name the animal shelter gave him, but I like to call him Dudu Cat. Maybe it's because he likes making sounds like dudududu~~. Maybe it's a good thing for me and for him that he went back to the animal shelter. I'm not a good cat owner; I'm poor; I don't have enough time or energy to play with him. It's hard to accept things getting away from me, whether it's my friends or my pets who are very close to me.

Writing here. I know it's very sad, the thing about Dudu Cat reminds me a lot of old memories. Overall, Dudu Cat is a good cat. He's naughty, he likes biting me. He's very clingy. He's a friend of mine in some sort of way. I don't really want him to leave me like this. We've already got some feelings. But that's just how it is. Hope he finds a good owner who can let him be clingy.`;

const EXCERPT =
  "He's gone, after more than a month together.";

function mimeFor(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".heic" || ext === ".heif") return "image/heic";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

/** Prefer JPEG over HEIC when both exist for the same stem. Skip DNG/video. */
async function listStills(): Promise<string[]> {
  const names = await fs.readdir(EXPORT_DIR);
  const stills = names.filter((n) =>
    /\.(jpe?g|png|webp|hei[cf])$/i.test(n),
  );
  const byStem = new Map<string, string[]>();
  for (const name of stills) {
    const stem = name.replace(/\.[^.]+$/, "").toLowerCase();
    const list = byStem.get(stem) || [];
    list.push(name);
    byStem.set(stem, list);
  }
  const chosen: string[] = [];
  for (const list of byStem.values()) {
    const jpeg = list.find((n) => /\.jpe?g$/i.test(n));
    chosen.push(jpeg || list[0]);
  }
  return chosen.sort((a, b) => a.localeCompare(b));
}

async function main() {
  const stills = await listStills();
  if (!stills.length) {
    throw new Error(`No stills in ${EXPORT_DIR}`);
  }
  console.info(`[dudu] stills=${stills.length}`);

  // Cover: prefer a later portrait-ish shot; fall back to first.
  const coverName =
    stills.find((n) => /IMG_4633/i.test(n)) ||
    stills.find((n) => /IMG_4291/i.test(n)) ||
    stills[Math.floor(stills.length / 2)] ||
    stills[0];

  console.info(`[dudu] creating article…`);
  let article = await createArticle({
    title: "Dudu Cat",
    slug: "dudu-cat",
    excerpt: EXCERPT,
    bodyMd: BODY,
    status: "draft",
    wallStyle: "polaroid",
  });

  // Upload cover first so we can set cover_image from its public src.
  console.info(`[dudu] uploading cover ${coverName}`);
  const coverBuf = await fs.readFile(path.join(EXPORT_DIR, coverName));
  const coverPhoto = await createWallPhoto({
    buffer: coverBuf,
    originalName: coverName,
    mimeType: mimeFor(coverName),
    caption: "Dudu Cat",
    meta: "Jul 30, 2026",
  });

  article = (await updateArticle(article.id, {
    coverImage: coverPhoto.src,
    status: "published",
    wallStyle: "polaroid",
  }))!;

  // Stamp the diary time the author wrote.
  const { query } = await import("../src/lib/db");
  await query(
    `UPDATE articles
     SET published_at = $2::timestamptz, updated_at = now()
     WHERE id = $1`,
    [article.id, "2026-07-30T18:46:00-05:00"],
  );

  console.info(
    `[dudu] article published id=${article.id} slug=${article.slug} cover=${coverPhoto.src}`,
  );

  let uploaded = 1; // cover already pinned
  for (const name of stills) {
    if (name === coverName) continue;
    const buffer = await fs.readFile(path.join(EXPORT_DIR, name));
    try {
      await createWallPhoto({
        buffer,
        originalName: name,
        mimeType: mimeFor(name),
        caption: "",
        meta: "Dudu Cat",
      });
      uploaded += 1;
      console.info(`[dudu] pinned ${uploaded}/${stills.length} ${name}`);
    } catch (err) {
      console.error(
        `[dudu] failed ${name}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.info(
    `[dudu] done. article=/blog/${article.slug} wallPhotos=${uploaded}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
