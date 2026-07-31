"use client";

import { forwardRef, useCallback, useMemo } from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  DiffSourceToggleWrapper,
  InsertImage,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  Separator,
  UndoRedo,
  codeBlockPlugin,
  diffSourcePlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  type MDXEditorMethods,
  type MDXEditorProps,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { ArticleImageDialog } from "@/components/admin/ArticleImageDialog";
import { useArticleEditorMedia } from "@/components/admin/article-editor-media-context";
import {
  isMediaId,
  mediaIdFromMarkdownRef,
  mediaMarkdownRef,
  normalizeArticleImageSrc,
} from "@/lib/article-media";
import { photoFullPublicUrl } from "@/lib/media-url";
import { isVideoMedia } from "@/lib/photos-client";
import type { PhotoMeta } from "@/lib/types";

type Props = Omit<MDXEditorProps, "plugins" | "ref">;

/**
 * Client-only MDXEditor with article-media-aware image insert.
 * Toolbar Insert Image uploads into the album (or picks media:<uuid>),
 * and markdown source can use the same `![alt](media:<uuid>)` refs.
 */
const InitializedMDXEditor = forwardRef<MDXEditorMethods, Props>(
  function InitializedMDXEditor(props, ref) {
    const { articleId, photos, onPhotoUploaded } = useArticleEditorMedia();

    const suggestions = useMemo(
      () =>
        photos
          .filter((p) => !isVideoMedia(p) && p.state !== "failed")
          .map((p) => mediaMarkdownRef(p.id)),
      [photos],
    );

    const imageUploadHandler = useCallback(
      async (file: File) => {
        if (!articleId) {
          throw new Error("Save the article once before uploading images");
        }
        const form = new FormData();
        form.append("files", file);
        form.append("uploader", "Admin");
        const res = await fetch(`/api/admin/articles/${articleId}/photos`, {
          method: "POST",
          body: form,
        });
        const data = (await res.json()) as {
          photos?: PhotoMeta[];
          error?: string;
        };
        const photo = data.photos?.[0];
        if (!res.ok || !photo) {
          throw new Error(data.error || "Upload failed");
        }
        onPhotoUploaded?.(photo);
        return mediaMarkdownRef(photo.id);
      },
      [articleId, onPhotoUploaded],
    );

    const imagePreviewHandler = useCallback(
      async (imageSource: string) => {
        const normalized = normalizeArticleImageSrc(imageSource);
        const mediaId =
          mediaIdFromMarkdownRef(normalized) ||
          (isMediaId(normalized) ? normalized.trim() : undefined);
        if (mediaId) {
          const photo = photos.find((p) => p.id === mediaId);
          if (photo) return photoFullPublicUrl(photo);
          // Still render something so the node doesn't look broken mid-upload.
          return normalized;
        }
        return normalized;
      },
      [photos],
    );

    return (
      <MDXEditor
        ref={ref}
        className="article-mdx-editor"
        contentEditableClassName="article-mdx-editor__content prose prose-neutral max-w-none"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          imagePlugin({
            imageUploadHandler: articleId ? imageUploadHandler : null,
            imagePreviewHandler,
            imageAutocompleteSuggestions: suggestions,
            ImageDialog: ArticleImageDialog,
          }),
          codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
          diffSourcePlugin({ viewMode: "rich-text" }),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <DiffSourceToggleWrapper>
                  <UndoRedo />
                  <Separator />
                  <BoldItalicUnderlineToggles />
                  <Separator />
                  <BlockTypeSelect />
                  <Separator />
                  <ListsToggle />
                  <Separator />
                  <CreateLink />
                  <InsertImage />
                  <InsertThematicBreak />
                </DiffSourceToggleWrapper>
              </>
            ),
          }),
          markdownShortcutPlugin(),
        ]}
        {...props}
      />
    );
  },
);

export default InitializedMDXEditor;
