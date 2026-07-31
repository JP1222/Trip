"use client";

import { useState } from "react";
import type { GuestbookEntry } from "@/lib/guestbook";

type Props = {
  onPosted: (entry: GuestbookEntry) => void;
};

export function GuestbookComposer({ onPosted }: Props) {
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
      const res = await fetch("/api/guestbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, body }),
      });
      const data = (await res.json()) as GuestbookEntry & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not post");
      onPosted(data);
      setBody("");
      setOkMsg("Noted.");
      setTimeout(() => setOkMsg(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="guestbook-write">
      <label className="guestbook-write__block">
        <span className="sr-only">Your note</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          rows={6}
          placeholder="Dear travelers…"
          required
          className="guestbook-write__lines"
        />
      </label>

      <label className="guestbook-write__sign">
        <span className="guestbook-write__dash" aria-hidden>
          —
        </span>
        <span className="sr-only">Your name</span>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          maxLength={40}
          placeholder="your name"
          autoComplete="name"
          required
          className="guestbook-write__name"
        />
      </label>

      {(error || okMsg) && (
        <p
          className={`guestbook-write__status${error ? " guestbook-write__status--error" : ""}`}
          role="status"
        >
          {error || okMsg}
        </p>
      )}

      <button type="submit" disabled={busy} className="guestbook-write__ink">
        {busy ? "Drying…" : "Leave your mark"}
      </button>
    </form>
  );
}
