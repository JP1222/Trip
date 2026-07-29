"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={busy}
      className="rounded-full px-3.5 py-1.5 text-[13px] text-ink-soft transition hover:bg-white/70 hover:text-coral disabled:opacity-60"
    >
      {busy ? "…" : "Log out"}
    </button>
  );
}
