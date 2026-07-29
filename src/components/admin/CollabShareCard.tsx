"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collabEditUrl, generateCollabToken } from "@/lib/collab";

type Props = {
  tripId: string;
  collabToken?: string;
  /** Match floating admin chrome (next to Log out) */
  chrome?: boolean;
};

/** Compact control: Share edit → popover with link actions */
export function CollabShareCard({ tripId, collabToken, chrome }: Props) {
  const router = useRouter();
  const [token, setToken] = useState(collabToken || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const enabled = Boolean(token);

  useEffect(() => {
    setToken(collabToken || "");
  }, [collabToken]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function saveToken(next: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collabToken: next }),
      });
      if (!res.ok) throw new Error("Failed");
      setToken(next);
      setMsg(next ? "Collab link ready" : "Collab disabled");
      router.refresh();
    } catch {
      setMsg("Could not update");
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 2000);
    }
  }

  async function copy() {
    if (!token) return;
    const full =
      typeof window !== "undefined"
        ? collabEditUrl(tripId, token, window.location.origin)
        : collabEditUrl(tripId, token);
    try {
      await navigator.clipboard.writeText(full);
      setMsg("Link copied");
      setTimeout(() => setMsg(null), 2000);
    } catch {
      setMsg("Copy failed");
    }
  }

  const displayLink =
    typeof window !== "undefined" && token
      ? collabEditUrl(tripId, token, window.location.origin)
      : token
        ? `/trips/${tripId}?edit=${token}`
        : "";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={
          chrome
            ? `inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] transition ${
                open
                  ? "bg-white/80 font-medium text-ink"
                  : enabled
                    ? "text-ink-soft hover:bg-white/70 hover:text-ink"
                    : "text-ink-muted hover:bg-white/70 hover:text-ink"
              }`
            : `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                open
                  ? "border-ink bg-ink text-white"
                  : enabled
                    ? "border-sand-200 bg-white text-ink-soft hover:border-sand-300 hover:text-ink"
                    : "border-dashed border-sand-300 bg-white/80 text-ink-muted hover:border-sea/40 hover:text-sea"
              }`
        }
      >
        {enabled && (
          <span className="h-1.5 w-1.5 rounded-full bg-sea" aria-hidden />
        )}
        Share
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Collab edit link"
          className="absolute right-0 z-[60] mt-2 w-[min(calc(100vw-2rem),20.5rem)] rounded-2xl border border-sand-200 bg-white p-4 shadow-[0_16px_48px_rgba(42,38,34,0.12)]"
        >
          <p className="text-[11px] font-medium tracking-[0.12em] text-ink-muted uppercase">
            Collab edit
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Friends with the link can edit plan & budget (not photos).
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {!enabled ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveToken(generateCollabToken())}
                className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-soft disabled:opacity-60"
              >
                Enable
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-soft"
                >
                  Copy link
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveToken(generateCollabToken())}
                  className="rounded-full border border-sand-200 px-3 py-1.5 text-xs text-ink-soft hover:border-sand-300"
                >
                  New link
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveToken("")}
                  className="rounded-full px-3 py-1.5 text-xs text-coral hover:bg-coral/10"
                >
                  Disable
                </button>
              </>
            )}
          </div>

          {enabled && (
            <p className="mt-2.5 break-all rounded-lg bg-sand-50 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-ink-muted">
              {displayLink}
            </p>
          )}
          {msg && <p className="mt-2 text-xs text-sea">{msg}</p>}
        </div>
      )}
    </div>
  );
}
