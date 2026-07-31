"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";

/** Frosted glass pill — Wall / Edit / action clusters / Log out. */
export const adminChromePillClass =
  "inline-flex h-9 items-center gap-1.5 rounded-full bg-white/60 px-3.5 text-[13px] font-medium tracking-tight text-ink/90 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150 transition hover:bg-white/75 active:scale-[0.96] sm:h-10 sm:px-4 sm:text-[14px]";

export const adminChromeClusterClass =
  "flex items-center gap-0.5 rounded-full bg-white/60 p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150 empty:hidden";

type ChromeCtx = {
  actionsEl: HTMLElement | null;
  shareEl: HTMLElement | null;
};

const AdminChromeContext = createContext<ChromeCtx>({
  actionsEl: null,
  shareEl: null,
});

/** Page actions (status / visibility / Save) — portals into the top bar. */
export function AdminChromeActions({ children }: { children: ReactNode }) {
  const { actionsEl } = useContext(AdminChromeContext);
  if (!actionsEl) return null;
  return createPortal(children, actionsEl);
}

/** Share control — portals into the top bar (trips). */
export function AdminChromeShare({ children }: { children: ReactNode }) {
  const { shareEl } = useContext(AdminChromeContext);
  if (!shareEl) return null;
  return createPortal(children, shareEl);
}

export function AdminChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onEditHome = pathname === "/admin";
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null);
  const [shareEl, setShareEl] = useState<HTMLElement | null>(null);
  const value = useMemo(
    () => ({ actionsEl, shareEl }),
    [actionsEl, shareEl],
  );

  return (
    <AdminChromeContext.Provider value={value}>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 px-3 sm:px-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
        }}
      >
        {/* Places: leave to public wall ↔ edit home */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <Link href="/" className={adminChromePillClass}>
            Wall
          </Link>
          <Link
            href="/admin"
            aria-current={onEditHome ? "page" : undefined}
            className={`${adminChromePillClass} ${
              onEditHome ? "bg-white/85 text-ink ring-black/[0.1]" : ""
            }`}
          >
            Edit
          </Link>
        </div>

        <div className="pointer-events-auto flex max-w-[min(100%,48rem)] flex-wrap items-center justify-end gap-1.5">
          {/* Page actions supply their own pill groups (status ≠ visibility ≠ save). */}
          <div
            ref={setActionsEl}
            className="flex flex-wrap items-center justify-end gap-1.5 empty:hidden"
          />
          <div ref={setShareEl} className="contents" />
          <div className={adminChromeClusterClass}>
            <AdminLogoutButton />
          </div>
        </div>
      </div>
      {children}
    </AdminChromeContext.Provider>
  );
}
