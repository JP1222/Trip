"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Comment } from "@/lib/types";

export function AdminComments({
  tripId,
  comments: initial,
}: {
  tripId: string;
  comments: Comment[];
}) {
  const router = useRouter();
  const [comments, setComments] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(commentId: string) {
    if (!confirm("Delete this comment?")) return;
    setBusyId(commentId);
    const res = await fetch(
      `/api/admin/trips/${tripId}/comments/${commentId}`,
      { method: "DELETE" },
    );
    setBusyId(null);
    if (res.ok) {
      setComments((c) => c.filter((x) => x.id !== commentId));
      router.refresh();
    } else {
      alert("Could not delete");
    }
  }

  if (comments.length === 0) {
    return <p className="text-sm text-ink-muted">No comments yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {comments.map((c) => (
        <li
          key={c.id}
          className="rounded-2xl border border-sand-200 bg-white px-4 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-ink">{c.author}</p>
              <p className="mt-1 text-sm text-ink-soft whitespace-pre-wrap">
                {c.body}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {new Date(c.createdAt).toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              disabled={busyId === c.id}
              onClick={() => void remove(c.id)}
              className="shrink-0 rounded-full border border-coral/40 px-3 py-1 text-xs text-coral hover:bg-coral/10"
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
