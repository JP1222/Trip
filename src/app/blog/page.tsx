import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedArticles } from "@/lib/articles";
import { getSiteName } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `Blog · ${getSiteName()}`,
    description: "Writing and notes.",
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

export default async function BlogIndexPage() {
  const articles = await listPublishedArticles();

  return (
    <div className="mx-auto max-w-2xl px-5 pt-24 pb-20 sm:px-8">
      <header className="mb-10">
        <p className="text-xs font-medium tracking-[0.16em] text-ink-muted uppercase">
          Blog
        </p>
        <h1 className="mt-2 font-serif text-4xl text-ink sm:text-5xl">
          Writing
        </h1>
        <p className="mt-3 text-ink-soft">
          Notes, reflections, and longer pieces — separate from trip albums.
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-sand-300 bg-sand-100/40 px-5 py-10 text-center text-sm text-ink-muted">
          No published articles yet.
        </p>
      ) : (
        <ul className="space-y-6">
          {articles.map((article) => (
            <li key={article.id}>
              <Link
                href={`/blog/${article.slug}`}
                className="group block rounded-2xl border border-sand-200/80 bg-white/70 px-5 py-5 transition hover:border-sand-300 hover:bg-white"
              >
                <p className="text-xs tracking-wide text-ink-muted">
                  {formatDate(article.publishedAt)}
                </p>
                <h2 className="mt-1 font-serif text-2xl text-ink transition group-hover:text-sea">
                  {article.title}
                </h2>
                {article.excerpt ? (
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    {article.excerpt}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
