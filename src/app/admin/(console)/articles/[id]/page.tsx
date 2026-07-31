import { notFound } from "next/navigation";
import { ArticleEditorForm } from "@/components/admin/ArticleEditorForm";
import { getArticle } from "@/lib/articles";
import { importLegacyArticleAlbumFiles } from "@/lib/media/import-legacy-article";
import { getArticlePhotos } from "@/lib/photos";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function AdminEditArticlePage({ params }: Props) {
  const { id } = await params;
  const article = await getArticle(id);
  if (!article) notFound();

  // One-shot: index flat JPGs dumped before the unified media pipeline.
  await importLegacyArticleAlbumFiles(id).catch(() => ({
    imported: 0,
    skipped: 0,
  }));
  const photos = await getArticlePhotos(id, { includePending: true });

  return (
    <div className="min-h-screen bg-sand-50">
      <div className="px-5 pt-16 sm:px-8">
        <h1 className="sr-only">Edit article</h1>
        <ArticleEditorForm article={article} photos={photos} />
      </div>
    </div>
  );
}
