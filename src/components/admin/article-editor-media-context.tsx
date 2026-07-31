"use client";

import { createContext, useContext } from "react";
import type { PhotoMeta } from "@/lib/types";

export type ArticleEditorMediaContextValue = {
  articleId?: string;
  photos: PhotoMeta[];
  onPhotoUploaded?: (photo: PhotoMeta) => void;
};

const ArticleEditorMediaContext = createContext<ArticleEditorMediaContextValue>({
  photos: [],
});

export function ArticleEditorMediaProvider({
  value,
  children,
}: {
  value: ArticleEditorMediaContextValue;
  children: React.ReactNode;
}) {
  return (
    <ArticleEditorMediaContext.Provider value={value}>
      {children}
    </ArticleEditorMediaContext.Provider>
  );
}

export function useArticleEditorMedia() {
  return useContext(ArticleEditorMediaContext);
}
