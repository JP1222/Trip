"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  tripId: string;
  /** Match floating admin chrome (next to Log out) */
  chrome?: boolean;
};

type CapabilitySummary = {
  id: string;
  label: string;
  scopes: Array<"plan" | "comment" | "upload">;
  expiresAt: string;
};

/** Compact control for expiring, revocable collaboration invites. */
export function CollabShareCard({ tripId, chrome }: Props) {
  const router = useRouter();
  const [capabilities, setCapabilities] = useState<CapabilitySummary[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const enabled = capabilities.length > 0;

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/trips/${tripId}/capabilities`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { capabilities?: CapabilitySummary[] };
    setCapabilities(data.capabilities || []);
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  function flash(message: string) {
    setMsg(message);
    setTimeout(() => setMsg(null), 2500);
  }

  async function revokeAll(): Promise<void> {
    const results = await Promise.all(
      capabilities.map((capability) =>
        fetch(
          `/api/admin/trips/${tripId}/capabilities/${capability.id}`,
          { method: "DELETE" },
        ),
      ),
    );
    if (results.some((result) => !result.ok && result.status !== 404)) {
      throw new Error("Could not revoke the current invite");
    }
    setCapabilities([]);
    setShareUrl(null);
  }

  async function createInvite(rotate: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      if (rotate && capabilities.length) await revokeAll();
      const res = await fetch(`/api/admin/trips/${tripId}/capabilities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Trip collaboration",
          scopes: ["plan", "comment", "upload"],
          expiresInDays: 30,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        capability?: CapabilitySummary;
        inviteUrl?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.capability || !data.inviteUrl) {
        throw new Error(data?.error || "Could not create invite");
      }
      setCapabilities([data.capability]);
      setShareUrl(data.inviteUrl);
      flash(rotate ? "New link ready — old link revoked" : "Invite link ready");
      router.refresh();
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not create invite");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      await revokeAll();
      flash("Collaboration disabled");
      router.refresh();
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not revoke invite");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      flash("Link copied");
    } catch {
      flash("Copy failed");
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
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
        {enabled && <span className="h-1.5 w-1.5 rounded-full bg-sea" aria-hidden />}
        Share
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Collaboration invite"
          className="absolute right-0 z-[60] mt-2 w-[min(calc(100vw-2rem),20.5rem)] rounded-2xl border border-sand-200 bg-white p-4 shadow-[0_16px_48px_rgba(42,38,34,0.12)]"
        >
          <p className="text-[11px] font-medium tracking-[0.12em] text-ink-muted uppercase">
            Collaboration invite
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Friends with the link can edit the plan, comment, and upload. Links expire after 30 days.
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {!enabled ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void createInvite(false)}
                className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-soft disabled:opacity-60"
              >
                Create link
              </button>
            ) : (
              <>
                {shareUrl && (
                  <button
                    type="button"
                    onClick={() => void copy()}
                    className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-soft"
                  >
                    Copy link
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createInvite(true)}
                  className="rounded-full border border-sand-200 px-3 py-1.5 text-xs text-ink-soft hover:border-sand-300 disabled:opacity-60"
                >
                  Rotate link
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void disable()}
                  className="rounded-full px-2.5 py-1.5 text-xs text-coral hover:bg-coral/10 disabled:opacity-60"
                >
                  Disable
                </button>
              </>
            )}
          </div>

          {enabled && !shareUrl && (
            <p className="mt-2.5 rounded-lg bg-sand-50 px-2.5 py-2 text-[11px] leading-relaxed text-ink-muted">
              An invite is active. Its secret is not stored, so rotate it to get a copyable link.
            </p>
          )}
          {shareUrl && (
            <p className="mt-2.5 break-all rounded-lg bg-sand-50 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-ink-muted">
              {shareUrl}
            </p>
          )}
          {msg && <p className="mt-2 text-xs text-sea">{msg}</p>}
        </div>
      )}
    </div>
  );
}
