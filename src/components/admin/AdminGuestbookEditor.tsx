"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GuestbookEntry } from "@/lib/guestbook";

type Props = {
  initialEntries: GuestbookEntry[];
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

export function AdminGuestbookEditor({ initialEntries }: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAuthor, setDraftAuthor] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit(entry: GuestbookEntry) {
    setEditingId(entry.id);
    setDraftAuthor(entry.author);
    setDraftBody(entry.body);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftAuthor("");
    setDraftBody("");
    setError(null);
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/guestbook/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: draftAuthor, body: draftBody }),
      });
      const data = (await res.json()) as GuestbookEntry & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save");
      setEntries((prev) => prev.map((e) => (e.id === id ? data : e)));
      cancelEdit();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this guestbook note?")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/guestbook/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "Could not delete");
      }
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (editingId === id) cancelEdit();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-ink sm:text-3xl">
            Guestbook
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Edit or remove visitor notes. Public book is at{" "}
            <Link href="/guestbook" className="text-sea underline-offset-2 hover:underline">
              /guestbook
            </Link>
            .
          </p>
        </div>
        <p className="text-sm text-ink-muted">
          {entries.length === 0
            ? "No notes yet"
            : entries.length === 1
              ? "1 note"
              : `${entries.length} notes`}
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-coral/30 bg-coral/5 px-4 py-3 text-sm text-coral" role="alert">
          {error}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-sand-300 bg-white/60 px-5 py-10 text-center text-sm text-ink-muted">
          No guestbook notes yet. Visitors can sign the public book.
        </p>
      ) : (
        <ul className="divide-y divide-sand-200 overflow-hidden rounded-2xl border border-sand-200 bg-white/80">
          {entries.map((entry) => {
            const editing = editingId === entry.id;
            const busy = busyId === entry.id;
            return (
              <li key={entry.id} className="px-4 py-4 sm:px-5">
                {editing ? (
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium tracking-wide text-ink-muted uppercase">
                        Name
                      </span>
                      <input
                        value={draftAuthor}
                        onChange={(e) => setDraftAuthor(e.target.value)}
                        maxLength={40}
                        className="w-full rounded-xl border border-sand-200 bg-sand-50/80 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-sea/50 focus:ring-2 focus:ring-sea/15"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium tracking-wide text-ink-muted uppercase">
                        Message
                      </span>
                      <textarea
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        maxLength={500}
                        rows={4}
                        className="w-full resize-y rounded-xl border border-sand-200 bg-sand-50/80 px-3.5 py-2.5 text-sm leading-relaxed text-ink outline-none focus:border-sea/50 focus:ring-2 focus:ring-sea/15"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveEdit(entry.id)}
                        className="rounded-full bg-ink px-4 py-2 text-sm text-white hover:bg-ink-soft disabled:opacity-60"
                      >
                        {busy ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={cancelEdit}
                        className="rounded-full border border-sand-300 bg-white px-4 py-2 text-sm text-ink-soft hover:bg-sand-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <p className="font-medium text-ink">{entry.author}</p>
                        <time className="text-xs text-ink-muted" dateTime={entry.createdAt}>
                          {formatWhen(entry.createdAt)}
                        </time>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                        {entry.body}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => startEdit(entry)}
                        className="rounded-full border border-sand-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-sand-50 disabled:opacity-60"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(entry.id)}
                        className="rounded-full border border-coral/40 px-3 py-1.5 text-xs font-medium text-coral hover:bg-coral/10 disabled:opacity-60"
                      >
                        {busy ? "…" : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
