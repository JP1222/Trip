import type { PhotoMeta } from "@/lib/types";
import { photoFullPublicUrl } from "@/lib/media-url";

export type ArticleImage = {
  src: string;
  alt: string;
};

/** Absolute path, http(s), or stable `media:<uuid>` album ref. */
const IMAGE_SRC =
  "(\\/[^)\\s]+|https?:\\/\\/[^)\\s]+|media:[0-9a-fA-F-]{36})";
const IMAGE_LINE = new RegExp(`^!\\[([^\\]]*)\\]\\(${IMAGE_SRC}\\)$`);

const MEDIA_REF = /^media:([0-9a-fA-F-]{36})$/i;
const MEDIA_ID = /^[0-9a-fA-F-]{36}$/i;

export function isMediaMarkdownRef(src: string): boolean {
  return MEDIA_REF.test(src.trim());
}

export function mediaIdFromMarkdownRef(src: string): string | undefined {
  const match = src.trim().match(MEDIA_REF);
  return match?.[1];
}

/** Stable markdown image target that survives derivative version bumps. */
export function mediaMarkdownRef(mediaId: string): string {
  return `media:${mediaId.trim()}`;
}

export function mediaMarkdownImage(mediaId: string, alt = ""): string {
  return `![${alt}](${mediaMarkdownRef(mediaId)})`;
}

export function isMediaId(value: string): boolean {
  return MEDIA_ID.test(value.trim());
}

/**
 * Normalize pasted/typed image targets to stable `media:<uuid>` when possible.
 * Leaves absolute/http(s) paths untouched.
 */
export function normalizeArticleImageSrc(src: string): string {
  const trimmed = src.trim();
  if (!trimmed) return trimmed;
  if (isMediaMarkdownRef(trimmed)) {
    return mediaMarkdownRef(mediaIdFromMarkdownRef(trimmed)!);
  }
  if (isMediaId(trimmed)) return mediaMarkdownRef(trimmed);
  return trimmed;
}

/** Rewrite bare UUID image targets in markdown to `media:<uuid>`. */
export function normalizeBodyMediaRefs(markdown: string): string {
  return markdown.replace(
    /!\[([^\]]*)\]\(\s*([0-9a-fA-F-]{36})\s*\)/g,
    (_match, alt: string, id: string) => `![${alt}](${mediaMarkdownRef(id)})`,
  );
}

/**
 * Resolve a markdown image src to a public URL.
 * `media:<uuid>` looks up the album; plain paths/URLs pass through.
 */
export function resolveMediaMarkdownSrc(
  src: string,
  photosById: Map<string, PhotoMeta> | ReadonlyMap<string, PhotoMeta>,
): string | null {
  const trimmed = src.trim();
  const mediaId = mediaIdFromMarkdownRef(trimmed);
  if (mediaId) {
    const photo = photosById.get(mediaId);
    if (!photo) return null;
    return photoFullPublicUrl(photo);
  }
  if (trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function photosByIdMap(photos: PhotoMeta[]): Map<string, PhotoMeta> {
  return new Map(photos.map((photo) => [photo.id, photo]));
}

/**
 * Split article markdown into prose + trailing gallery images.
 * Images under a final "## Photos" section (or consecutive image blocks
 * at the end) are treated as an unpositioned stream — not inline inserts.
 *
 * Mid-prose `media:<uuid>` images stay in prose (not peeled).
 */
export function splitArticleBodyAndGallery(source: string): {
  proseMd: string;
  gallery: ArticleImage[];
} {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  if (!normalized) return { proseMd: "", gallery: [] };

  const photosHeading = normalized.match(
    /\n##\s+Photos\s*\n([\s\S]*)$/i,
  );
  if (photosHeading) {
    const proseMd = normalized.slice(0, photosHeading.index).trimEnd();
    const gallery = extractImageBlocks(photosHeading[1]);
    return { proseMd, gallery };
  }

  // No Photos heading: peel consecutive trailing image blocks.
  // Leave `media:` refs in prose — they are intentional inline inserts.
  const blocks = normalized.split(/\n{2,}/);
  const gallery: ArticleImage[] = [];
  let end = blocks.length;
  while (end > 0) {
    const block = blocks[end - 1]?.trim() ?? "";
    const match = block.match(IMAGE_LINE);
    if (!match) break;
    if (isMediaMarkdownRef(match[2])) break;
    gallery.unshift({ alt: match[1] || "", src: match[2] });
    end -= 1;
  }

  if (gallery.length === 0) {
    return { proseMd: normalized, gallery: [] };
  }

  return {
    proseMd: blocks.slice(0, end).join("\n\n").trim(),
    gallery,
  };
}

function extractImageBlocks(section: string): ArticleImage[] {
  const images: ArticleImage[] = [];
  for (const block of section.split(/\n{2,}/)) {
    const match = block.trim().match(IMAGE_LINE);
    if (match) images.push({ alt: match[1] || "", src: match[2] });
  }
  return images;
}

export { IMAGE_LINE };
