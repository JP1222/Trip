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

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="rounded-3xl border border-sand-200/80 bg-white/60 p-5 sm:p-7"
      >
        <h3 className="font-serif text-xl text-ink">Leave a note</h3>
        <p className="mt-1 text-sm text-ink-muted">
          A short comment for the group — no account needed.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-[160px_1fr]">
          <label className="block">
            <span className="mb-1.5 block text-sm text-ink-soft">Name *</span>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              maxLength={40}
              placeholder="Your name"
              className="w-full rounded-2xl border border-sand-200 bg-sand-50/80 px-4 py-3 text-ink outline-none transition focus:border-sea/50 focus:ring-2 focus:ring-sea/15"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-ink-soft">Comment *</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="That sunset was unreal…"
              className="w-full resize-y rounded-2xl border border-sand-200 bg-sand-50/80 px-4 py-3 text-ink outline-none transition focus:border-sea/50 focus:ring-2 focus:ring-sea/15"
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 text-sm text-coral">{error}</p>
        )}
        {okMsg && <p className="mt-3 text-sm text-sea">{okMsg}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 rounded-full bg-ink px-6 py-2.5 text-sm text-white transition hover:bg-ink-soft disabled:opacity-60"
        >
          {busy ? "Posting…" : "Post comment"}
        </button>
      </form>

      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-ink-muted">No comments yet — say hello.</p>
        ) : (
          comments.map((c) => (
            <article
              key={c.id}
              className="rounded-2xl border border-sand-200/70 bg-white/40 px-5 py-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink">{c.author}</p>
                <time className="text-xs text-ink-muted">
                  {formatWhen(c.createdAt)}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                {c.body}
              </p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
