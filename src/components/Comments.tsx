"use client";

import { useState } from "react";
import type { Comment } from "@/lib/types";

type Props = {
  tripId: string;
  initialComments: Comment[];
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function Comments({ tripId, initialComments }: Props) {
  const [comments, setComments] = useState(initialComments);
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, body }),
      });
      const data = (await res.json()) as Comment & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not post");
      setComments((prev) => [data, ...prev]);
      setBody("");
      setOkMsg("Posted");
      setTimeout(() => setOkMsg(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full rounded-xl border border-sand-200 bg-sand-50/80 px-3.5 py-2.5 text-sm leading-normal text-ink outline-none transition placeholder:text-ink-muted/60 focus:border-sea/50 focus:ring-2 focus:ring-sea/15";

  return (
    <div className="w-full space-y-6">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full rounded-2xl border border-sand-200/80 bg-white/70 p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="font-serif text-lg text-ink">Leave a note</h3>
          <p className="text-xs text-ink-muted">No account needed</p>
        </div>

        {/* Stacked full-width fields — same width / radius so the form feels even */}
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs text-ink-soft">Name *</span>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              maxLength={40}
              placeholder="Your name"
              autoComplete="name"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-ink-soft">Note *</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="That sunset was unreal…"
              className={`${fieldClass} min-h-[7rem] resize-y`}
            />
          </label>
        </div>

        {(error || okMsg) && (
          <p
            className={`mt-3 text-sm ${error ? "text-coral" : "text-sea"}`}
          >
            {error || okMsg}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-ink px-5 py-2.5 text-sm text-white transition hover:bg-ink-soft disabled:opacity-60"
          >
            {busy ? "Posting…" : "Post note"}
          </button>
        </div>
      </form>

      <div className="w-full space-y-3">
        {comments.length === 0 ? (
          <p className="text-sm text-ink-muted">No notes yet — say hello.</p>
        ) : (
          comments.map((c) => (
            <article
              key={c.id}
              className="rounded-xl border border-sand-200/70 bg-white/50 px-4 py-3 sm:px-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-ink">{c.author}</p>
                <time className="text-xs text-ink-muted">
                  {formatWhen(c.createdAt)}
                </time>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                {c.body}
              </p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
