import Link from "next/link";
import { listArticles } from "@/lib/articles";

export const dynamic = "force-dynamic";

function formatWhen(article: {
  status: string;
  publishedAt?: string;
  updatedAt: string;
}): string {
  const iso =
    article.status === "published" && article.publishedAt
      ? article.publishedAt
      : article.updatedAt;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function AdminArticlesPage() {
  const articles = await listArticles({ status: "all" });

  return (
    <div className="min-h-screen bg-sand-50">
      <div className="mx-auto max-w-3xl space-y-8 px-5 pt-20 pb-16 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl text-ink sm:text-3xl">
              Articles
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Draft and publish writing for the site blog.
            </p>
          </div>
          <Link
            href="/admin/articles/new"
            className="rounded-full bg-white/60 px-4 py-2 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] backdrop-blur-2xl transition hover:bg-white/75"
          >
            New article
          </Link>
        </div>

        {articles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-sand-300 bg-white/60 px-5 py-10 text-center text-sm text-ink-muted">
            No articles yet. Write the first one.
          </p>
        ) : (
          <ul className="divide-y divide-sand-200 overflow-hidden rounded-2xl border border-sand-200 bg-white/80">
            {articles.map((article) => (
              <li key={article.id}>
                <Link
                  href={`/admin/articles/${article.id}`}
                  className="flex items-start justify-between gap-4 px-4 py-4 transition hover:bg-sand-50 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {article.title}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-ink-muted">
                      /blog/{article.slug}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-ink-muted">
                    <span
                      className={
                        article.status === "published"
                          ? "text-sea"
                          : "text-ink-muted"
                      }
                    >
                      {article.status}
                    </span>
                    {article.wallStyle !== "none" ? (
                      <p className="mt-0.5 text-ink-soft">
                        wall · {article.wallStyle}
                      </p>
                    ) : (
                      <p className="mt-0.5">{formatWhen(article)}</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
