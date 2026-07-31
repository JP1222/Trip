import { randomUUID } from "crypto";
import type { QueryResultRow } from "pg";
import { query, withTransaction } from "./db";
import type { Article, ArticleStatus, ArticleWallStyle } from "./types";

type ArticleRow = QueryResultRow & {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body_md: string;
  cover_image: string | null;
  status: ArticleStatus;
  wall_style: ArticleWallStyle;
  published_at: Date | string | null;
  version: string | number;
  created_at: Date | string;
  updated_at: Date | string;
};

const ARTICLE_SELECT = `
  SELECT
    id, slug, title, excerpt, body_md, cover_image, status, wall_style,
    published_at, version, created_at, updated_at
  FROM articles
`;

function isoTimestamp(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function parseWallStyle(value: string | null | undefined): ArticleWallStyle {
  if (value === "polaroid" || value === "note" || value === "none") return value;
  return "none";
}

function rowToArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMd: row.body_md,
    ...(row.cover_image ? { coverImage: row.cover_image } : {}),
    status: row.status,
    wallStyle: parseWallStyle(row.wall_style),
    ...(row.published_at
      ? { publishedAt: isoTimestamp(row.published_at) }
      : {}),
    version: Number(row.version),
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
  };
}

const SLUG_MAX = 120;

/** Lowercase kebab slug from a title; falls back to "article". */
export function slugifyTitle(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
  return base || "article";
}

async function ensureUniqueSlug(
  desired: string,
  excludeId?: string,
): Promise<string> {
  const base = slugifyTitle(desired).slice(0, SLUG_MAX - 8) || "article";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const result = await query<{ id: string }>(
      `SELECT id FROM articles WHERE slug = $1 LIMIT 1`,
      [candidate],
    );
    const existing = result.rows[0];
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export async function listArticles(options?: {
  status?: ArticleStatus | "all";
  limit?: number;
}): Promise<Article[]> {
  const status = options?.status ?? "all";
  const limit =
    typeof options?.limit === "number" && options.limit > 0
      ? Math.min(options.limit, 200)
      : null;

  const params: unknown[] = [];
  let where = "";
  if (status === "published" || status === "draft") {
    params.push(status);
    where = `WHERE status = $${params.length}`;
  }

  let sql = `${ARTICLE_SELECT}
    ${where}
    ORDER BY
      CASE WHEN status = 'published' THEN 0 ELSE 1 END,
      published_at DESC NULLS LAST,
      updated_at DESC,
      id DESC`;

  if (limit != null) {
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
  }

  const result = await query<ArticleRow>(sql, params);
  return result.rows.map(rowToArticle);
}

export async function listPublishedArticles(limit?: number): Promise<Article[]> {
  return listArticles({ status: "published", limit });
}

/** Published articles pinned to the cork wall (polaroid or sticky note). */
export async function listWallArticles(): Promise<Article[]> {
  const result = await query<ArticleRow>(
    `${ARTICLE_SELECT}
     WHERE status = 'published' AND wall_style IN ('polaroid', 'note')
     ORDER BY published_at DESC NULLS LAST, updated_at DESC, id DESC`,
  );
  return result.rows.map(rowToArticle);
}

export async function getArticle(id: string): Promise<Article | null> {
  const result = await query<ArticleRow>(
    `${ARTICLE_SELECT} WHERE id = $1 LIMIT 1`,
    [id],
  );
  const row = result.rows[0];
  return row ? rowToArticle(row) : null;
}

export async function getArticleBySlug(
  slug: string,
  options?: { includeDraft?: boolean },
): Promise<Article | null> {
  const result = await query<ArticleRow>(
    `${ARTICLE_SELECT}
     WHERE slug = $1
       AND ($2::boolean OR status = 'published')
     LIMIT 1`,
    [slug, Boolean(options?.includeDraft)],
  );
  const row = result.rows[0];
  return row ? rowToArticle(row) : null;
}

export type ArticleEditable = {
  title: string;
  slug?: string;
  excerpt?: string;
  bodyMd?: string;
  coverImage?: string | null;
  status?: ArticleStatus;
  wallStyle?: ArticleWallStyle;
};

export async function createArticle(
  input: ArticleEditable,
): Promise<Article> {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");

  const slug = await ensureUniqueSlug(input.slug?.trim() || title);
  const excerpt = (input.excerpt ?? "").trim().slice(0, 500);
  const bodyMd = input.bodyMd ?? "";
  const coverImage =
    input.coverImage === null
      ? null
      : input.coverImage?.trim() || null;
  const status: ArticleStatus =
    input.status === "published" ? "published" : "draft";
  const wallStyle: ArticleWallStyle =
    input.wallStyle === "polaroid" || input.wallStyle === "note"
      ? input.wallStyle
      : "none";
  const id = randomUUID();

  const result = await query<ArticleRow>(
    `INSERT INTO articles (
       id, slug, title, excerpt, body_md, cover_image, status, wall_style, published_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       CASE WHEN $7 = 'published' THEN now() ELSE NULL END
     )
     RETURNING
       id, slug, title, excerpt, body_md, cover_image, status, wall_style,
       published_at, version, created_at, updated_at`,
    [id, slug, title, excerpt, bodyMd, coverImage, status, wallStyle],
  );

  return rowToArticle(result.rows[0]);
}

export async function updateArticle(
  id: string,
  patch: Partial<ArticleEditable>,
): Promise<Article | null> {
  return withTransaction(async (client) => {
    const current = await client.query<ArticleRow>(
      `${ARTICLE_SELECT} WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = current.rows[0];
    if (!row) return null;

    const title =
      typeof patch.title === "string" ? patch.title.trim() : row.title;
    if (!title) throw new Error("Title is required");

    let slug = row.slug;
    if (typeof patch.slug === "string" && patch.slug.trim()) {
      slug = await ensureUniqueSlug(patch.slug.trim(), id);
    }

    const excerpt =
      typeof patch.excerpt === "string"
        ? patch.excerpt.trim().slice(0, 500)
        : row.excerpt;
    const bodyMd =
      typeof patch.bodyMd === "string" ? patch.bodyMd : row.body_md;
    const coverImage =
      patch.coverImage === null
        ? null
        : typeof patch.coverImage === "string"
          ? patch.coverImage.trim() || null
          : row.cover_image;

    let status = row.status;
    let publishedAt = row.published_at;
    if (patch.status === "published" || patch.status === "draft") {
      status = patch.status;
      if (status === "published" && !publishedAt) {
        publishedAt = new Date();
      }
      if (status === "draft") {
        publishedAt = null;
      }
    }

    const wallStyle =
      patch.wallStyle === "none" ||
      patch.wallStyle === "polaroid" ||
      patch.wallStyle === "note"
        ? patch.wallStyle
        : parseWallStyle(row.wall_style);

    const updated = await client.query<ArticleRow>(
      `UPDATE articles SET
         slug = $2,
         title = $3,
         excerpt = $4,
         body_md = $5,
         cover_image = $6,
         status = $7,
         wall_style = $8,
         published_at = $9,
         version = version + 1,
         updated_at = now()
       WHERE id = $1
       RETURNING
         id, slug, title, excerpt, body_md, cover_image, status, wall_style,
         published_at, version, created_at, updated_at`,
      [
        id,
        slug,
        title,
        excerpt,
        bodyMd,
        coverImage,
        status,
        wallStyle,
        publishedAt,
      ],
    );

    return rowToArticle(updated.rows[0]);
  });
}

export async function deleteArticle(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM articles WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
