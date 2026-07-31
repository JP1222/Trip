import { ArticleEditorForm } from "@/components/admin/ArticleEditorForm";

export const dynamic = "force-dynamic";

export default function AdminNewArticlePage() {
  return (
    <div className="min-h-screen bg-sand-50">
      <div className="px-5 pt-16 sm:px-8">
        <h1 className="sr-only">New article</h1>
        <ArticleEditorForm />
      </div>
    </div>
  );
}
