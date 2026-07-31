import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { randomUUID } from "crypto";
import { NotesSection } from "@/components/NotesSection";
import { MarkdownBody } from "@/components/MarkdownBody";
import { PhotoGallery } from "@/components/PhotoGallery";
import { TripSectionNav } from "@/components/TripSectionNav";
import { getArticleBySlug } from "@/lib/articles";
import { splitArticleBodyAndGallery } from "@/lib/article-media";
import { getCommentsForOwner } from "@/lib/comments";
import { articleOwner } from "@/lib/media/owner";
import { photoFullPublicUrl } from "@/lib/media-url";
import { getArticlePhotos } from "@/lib/photos";
import { getSiteName } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return { title: `Not found · ${getSiteName()}` };
  return {
    title: `${article.title} · ${getSiteName()}`,
    description: article.excerpt || undefined,
  };
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const NAV_TABS = [
  { id: "writing", label: "Writing" },
  { id: "photos", label: "Photos" },
  { id: "notes", label: "Notes" },
];

export default async function BlogArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const { proseMd } = splitArticleBodyAndGallery(article.bodyMd);
  const owner = articleOwner(article.id);
  const [photos, allComments, articleNotes] = await Promise.all([
    getArticlePhotos(article.id),
    getCommentsForOwner(owner),
    getCommentsForOwner(owner, { kind: "trip" }),
  ]);
  // Avoid repeating the cover when it is already in the album stream.
  const showHeroCover =
    Boolean(article.coverImage) &&
    !photos.some(
      (photo) =>
        photoFullPublicUrl(photo) === article.coverImage ||
        photo.filename === article.coverImage ||
        photo.previewFilename === article.coverImage,
    );

  return (
    <div className="article-page relative overflow-hidden pb-24">
      <div
        className="ambient -left-16 top-10 h-64 w-64 bg-sea/15 sm:-left-10 sm:top-16 sm:h-80 sm:w-80"
        aria-hidden
      />
      <div
        className="ambient -right-10 top-40 h-52 w-52 bg-coral/12 sm:right-0 sm:top-48 sm:h-72 sm:w-72"
        aria-hidden
      />

      <div className="relative mx-auto max-w-2xl px-5 pt-20 sm:px-8 sm:pt-24">
        <header className="article-page__header animate-fade-up mb-2">
          <p className="text-[11px] font-medium tracking-[0.18em] text-ink-muted uppercase">
            {formatDate(article.publishedAt) || "Writing"}
          </p>
          <h1 className="mt-3 font-serif text-[2.65rem] leading-[1.08] tracking-[-0.01em] text-ink sm:text-5xl sm:leading-[1.06]">
            {article.title}
          </h1>
          {article.excerpt ? (
            <p className="article-page__dek mt-5 max-w-xl font-serif text-xl leading-snug text-ink-soft sm:text-[1.35rem] sm:leading-snug">
              {article.excerpt}
            </p>
          ) : null}
        </header>
      </div>

      <TripSectionNav
        tabs={NAV_TABS}
        ariaLabel="Article sections"
        variant="dock"
      />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8 xl:px-10">
        <section id="writing" className="scroll-mt-28 pt-6 sm:pt-10">
          <div className="mx-auto max-w-2xl">
            {showHeroCover ? (
              <figure className="article-page__cover mb-12">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={article.coverImage}
                  alt=""
                  className="aspect-[16/10] w-full object-cover sm:aspect-[5/3]"
                />
              </figure>
            ) : null}

            {proseMd.trim() ? (
              <MarkdownBody source={proseMd} photos={photos} />
            ) : (
              <p className="text-sm text-ink-muted">No writing yet.</p>
            )}
          </div>
        </section>

        <section
          id="photos"
          className="article-page__section mt-16 scroll-mt-28 sm:mt-20"
        >
          <div className="mb-6 max-w-2xl">
            <p className="text-[11px] font-medium tracking-[0.16em] text-ink-muted uppercase">
              Album
            </p>
            <h2 className="mt-1.5 font-serif text-3xl text-ink sm:text-[2.1rem]">
              Photos
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {photos.length === 0
                ? "No photos in this album yet."
                : "Open any shot to preview · comment on individual frames."}
            </p>
          </div>

          {photos.length > 0 ? (
            <PhotoGallery
              ownerKind="article"
              ownerId={article.id}
              randomSeed={randomUUID()}
              initialPhotos={photos}
              initialComments={allComments}
              allowShare={false}
              allowComments
            />
          ) : (
            <div className="rounded-3xl border border-dashed border-sand-300/90 bg-white/50 px-6 py-14 text-center">
              <p className="font-serif text-xl text-ink">Album empty</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
                Photos for this piece will show up here.
              </p>
            </div>
          )}
        </section>

        <NotesSection
          className="article-page__section"
          articleId={article.id}
          initialComments={articleNotes}
          eyebrow="Conversation"
          description="Readers’ notes for this piece. Photo comments live on each photo."
        />
      </div>
    </div>
  );
}
