import type { ReactNode } from "react";
import type { PhotoMeta } from "@/lib/types";
import {
  photosByIdMap,
  resolveMediaMarkdownSrc,
} from "@/lib/article-media";

type Props = {
  source: string;
  /** Album photos used to resolve `media:<uuid>` image refs. */
  photos?: PhotoMeta[];
};

/**
 * Safe Markdown → React nodes (no HTML passthrough).
 * Supports headings, paragraphs, lists, quotes, code, bold/italic/links,
 * and block images (`/path`, `https://…`, or `media:<uuid>`).
 */
export function MarkdownBody({ source, photos = [] }: Props) {
  const text = source.replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  const byId = photosByIdMap(photos);
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="article-prose">
      {blocks.map((block, i) => (
        <Block key={i} text={block.trim()} photosById={byId} />
      ))}
    </div>
  );
}

function Block({
  text,
  photosById,
}: {
  text: string;
  photosById: Map<string, PhotoMeta>;
}) {
  if (!text) return null;

  const imageOnly = text.match(
    /^!\[([^\]]*)\]\((\/[^)\s]+|https?:\/\/[^)\s]+|media:[0-9a-fA-F-]{36})\)$/,
  );
  if (imageOnly) {
    const resolved = resolveMediaMarkdownSrc(imageOnly[2], photosById);
    if (!resolved) {
      return (
        <p className="rounded-xl border border-dashed border-sand-300 bg-sand-50 px-4 py-6 text-center text-sm text-ink-muted">
          Photo unavailable
        </p>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt={imageOnly[1] || ""}
        className="article-prose__img"
        loading="lazy"
      />
    );
  }

  const heading = text.match(/^(#{1,3})\s+([\s\S]+)$/);
  if (heading) {
    const level = heading[1].length;
    const children = inlineNodes(heading[2].replace(/\n/g, " "));
    if (level === 1) return <h1>{children}</h1>;
    if (level === 2) return <h2>{children}</h2>;
    return <h3>{children}</h3>;
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))) {
    return (
      <ul>
        {lines.map((line, i) => (
          <li key={i}>{inlineNodes(line.replace(/^[-*]\s+/, ""))}</li>
        ))}
      </ul>
    );
  }

  if (lines.length > 0 && lines.every((line) => /^\d+\.\s+/.test(line))) {
    return (
      <ol>
        {lines.map((line, i) => (
          <li key={i}>{inlineNodes(line.replace(/^\d+\.\s+/, ""))}</li>
        ))}
      </ol>
    );
  }

  if (text.startsWith("```") && text.endsWith("```")) {
    const inner = text
      .replace(/^```[a-zA-Z0-9]*\n?/, "")
      .replace(/\n?```$/, "");
    return (
      <pre>
        <code>{inner}</code>
      </pre>
    );
  }

  if (lines.every((line) => line.startsWith("> "))) {
    return (
      <blockquote>
        <p>
          {inlineNodes(lines.map((line) => line.replace(/^>\s?/, "")).join(" "))}
        </p>
      </blockquote>
    );
  }

  return (
    <p>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 ? <br /> : null}
          {inlineNodes(line)}
        </span>
      ))}
    </p>
  );
}

function inlineNodes(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let found = pattern.exec(text);
  let key = 0;

  while (found !== null) {
    if (found.index > last) {
      nodes.push(text.slice(last, found.index));
    }
    const token = found[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (link) {
        nodes.push(
          <a
            key={key++}
            href={link[2]}
            rel="noopener noreferrer"
            target="_blank"
          >
            {link[1]}
          </a>,
        );
      }
    }
    last = found.index + token.length;
    found = pattern.exec(text);
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
