"use client";

import { useState } from "react";
import type { GuestbookEntry } from "@/lib/guestbook";

type Props = {
  entries: GuestbookEntry[];
  /** True when the whole book has no notes (vs. just this page). */
  empty?: boolean;
  canModerate?: boolean;
  onDeleted?: (id: string) => void;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function GuestbookFeed({
  entries,
  empty = false,
  canModerate = false,
  onDeleted,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm("Delete this guestbook note?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/guestbook/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        alert("Could not delete");
        return;
      }
      onDeleted?.(id);
    } finally {
      setBusyId(null);
    }
  }

  if (empty) {
    return (
      <p className="guestbook-blank">
        These pages are still waiting for the first hand.
      </p>
    );
  }

  if (entries.length === 0) {
    return <p className="guestbook-blank">This page is blank.</p>;
  }

  return (
    <ol className="guestbook-entries">
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          className={`guestbook-hand guestbook-hand--${(index % 3) + 1}`}
        >
          <time className="guestbook-hand__date" dateTime={entry.createdAt}>
            {formatWhen(entry.createdAt)}
          </time>
          <p className="guestbook-hand__body">{entry.body}</p>
          <p className="guestbook-hand__sign">— {entry.author}</p>
          {canModerate ? (
            <button
              type="button"
              className="guestbook-hand__erase"
              disabled={busyId === entry.id}
              onClick={() => void remove(entry.id)}
            >
              {busyId === entry.id ? "…" : "Erase"}
            </button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
