import { Comments } from "@/components/Comments";
import type { Comment } from "@/lib/types";

export type NotesSectionProps = {
  tripId?: string;
  articleId?: string;
  initialComments: Comment[];
  description: string;
  /** Optional eyebrow above the Notes heading (e.g. “Conversation”). */
  eyebrow?: string;
  className?: string;
};

/** Shared Notes block for trip + article pages — same width and chrome. */
export function NotesSection({
  tripId,
  articleId,
  initialComments,
  description,
  eyebrow,
  className,
}: NotesSectionProps) {
  return (
    <section
      id="notes"
      className={["mt-14 scroll-mt-28 pb-8 sm:mt-16", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mb-5 max-w-2xl">
        {eyebrow ? (
          <p className="text-[11px] font-medium tracking-[0.16em] text-ink-muted uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2
          className={`font-serif text-3xl text-ink ${eyebrow ? "mt-1.5" : ""}`}
        >
          Notes
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      </div>
      <div className="max-w-2xl">
        <Comments
          tripId={tripId}
          articleId={articleId}
          initialComments={initialComments}
        />
      </div>
    </section>
  );
}
