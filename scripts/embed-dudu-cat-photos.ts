/**
 * Re-import Dudu Cat stills into article media (not wall pins).
 *
 *   pnpm exec tsx scripts/embed-dudu-cat-photos.ts
 */
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import convert from "heic-convert";
import sharp from "sharp";
import { getArticleBySlug, updateArticle } from "../src/lib/articles";
import { closeDatabase, query } from "../src/lib/db";
import { localMediaStorage } from "../src/lib/media/storage";

const EXPORT_DIR = "/tmp/dudu-cat-export";
const MAX_EDGE = 2400;
const JPEG_QUALITY = 88;

const BODY = `He's gone. He's been sent back to where he came from. It's quiet, just like when he came here. My cousin never said a word before using my $100 to bring him home. I don't have the ability to take care of him well in the future. He's gone, after more than a month together. I found out when I was heading out of my room to get my pizza. He was with me while I was eating my curry at noon. It's kind of sad when I write this down. It's already 6:20 PM.

I know this feeling. I've felt this before. One day when I was a kid, I heard my dog had passed away. I just pretended to be normal, pretended it's okay. I don't want anyone else to think I'm a kid. I don't want my family to see the vulnerable part of me. I hate that feeling. And I was scared they would make fun of me. Maybe someday in the future, at a family party, when they see a dog, they would say, "Peng loves dogs so much, he was crying so hard when his dog passed away," blabla, to another family member. My adult family members can never feel the same way I do. Seems like they're living in another world. I think that's one of the reasons I don't talk to them much.

It is what it is. Bruce is no longer by my side. Bruce is the name the animal shelter gave him, but I like to call him Dudu Cat. Maybe it's because he likes making sounds like dudududu~~. Maybe it's a good thing for me and for him that he went back to the animal shelter. I'm not a good cat owner; I'm poor; I don't have enough time or energy to play with him. It's hard to accept things getting away from me, whether it's my friends or my pets who are very close to me.

Writing here. I know it's very sad, the thing about Dudu Cat reminds me a lot of old memories. Overall, Dudu Cat is a good cat. He's naughty, he likes biting me. He's very clingy. He's a friend of mine in some sort of way. I don't really want him to leave me like this. We've already got some feelings. But that's just how it is. Hope he finds a good owner who can let him be clingy.`;

async function listStills(): Promise<string[]> {
  const names = await fs.readdir(EXPORT_DIR);
  const stills = names.filter((n) => /\.(jpe?g|png|webp|hei[cf])$/i.test(n));
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

async function toJpeg(buffer: Buffer, originalName: string): Promise<Buffer> {
  let input = buffer;
  if (/\.hei[cf]$/i.test(originalName)) {
    const converted = await convert({
      buffer,
      format: "JPEG",
      quality: 0.92,
    });
    input = Buffer.from(converted);
  }
  return sharp(input, { failOn: "none", limitInputPixels: 100_000_000 })
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColorspace("srgb")
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

async function main() {
  const article = await getArticleBySlug("dudu-cat", { includeDraft: true });
  if (!article) throw new Error("Dudu Cat article not found");

  const stills = await listStills();
  if (!stills.length) throw new Error(`No stills in ${EXPORT_DIR}`);

  await localMediaStorage.ensureRoots();
  const urls: string[] = [];

  for (const name of stills) {
    const raw = await fs.readFile(path.join(EXPORT_DIR, name));
    const jpeg = await toJpeg(raw, name);
    const id = randomUUID();
    const storageKey = `articles/${article.id}/${id}.jpg`;
    const target = await localMediaStorage.createAtomicTarget(
      "public",
      storageKey,
    );
    try {
      await fs.writeFile(target.tempPath, jpeg);
      await target.commit();
    } catch (err) {
      await target.abort();
      throw err;
    }
    const url = `/media/${storageKey}`;
    urls.push(url);
    console.info(`[dudu] embedded ${urls.length}/${stills.length} ${name} → ${url}`);
  }

  const cover =
    urls[
      Math.max(
        0,
        stills.findIndex((n) => /IMG_4633/i.test(n)),
      )
    ] || urls[0];

  const gallery = urls.map((src) => `![Dudu Cat](${src})`).join("\n\n");
  const bodyMd = `${BODY}\n\n## Photos\n\n${gallery}`;

  await updateArticle(article.id, {
    bodyMd,
    coverImage: cover,
    wallStyle: "polaroid",
    status: "published",
  });

  await query(
    `UPDATE articles
     SET published_at = $2::timestamptz, updated_at = now()
     WHERE id = $1`,
    [article.id, "2026-07-30T18:46:00-05:00"],
  );

  console.info(
    `[dudu] done. /blog/${article.slug} photos=${urls.length} cover=${cover}`,
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
