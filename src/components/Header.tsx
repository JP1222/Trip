"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const pill =
  "pointer-events-auto inline-flex h-9 items-center rounded-full bg-white/55 text-[15px] font-medium tracking-tight text-ink/90 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150 transition-[transform,background-color,box-shadow] duration-200 hover:bg-white/72 active:scale-[0.96] sm:h-10";

type Props = {
  /** Owner session — visitors never see the edit entry. */
  signedIn?: boolean;
};

/** Native share / copy link for the current page (trip). */
function SharePageButton() {
  const [msg, setMsg] = useState<string | null>(null);

  async function share() {
    const url = window.location.href;
    const title = document.title || "Trip";
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMsg("Copied");
      window.setTimeout(() => setMsg(null), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setMsg("Copied");
        window.setTimeout(() => setMsg(null), 2000);
      } catch {
        setMsg("Failed");
        window.setTimeout(() => setMsg(null), 2000);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className={`${pill} px-3.5 sm:px-4`}
    >
      {msg || "Share"}
    </button>
  );
}

/**
 * Public site chrome (console uses AdminChrome).
 * Home: Blog for everyone; Edit only when signed in.
 * Trip pages: Wall + Share (page-level).
 * Other pages: back to Wall.
 */
export function Header({ signedIn = false }: Props) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isAdminPath = pathname.startsWith("/admin");
  const isTripPage = /^\/trips\/[^/]+$/.test(pathname);

  if (isAdminPath) return null;

  if (isHome) {
    return (
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-end gap-2 px-3 sm:gap-3 sm:px-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
        }}
      >
        <Link href="/blog" className={`${pill} px-3.5 sm:px-4`}>
          Blog
        </Link>
        {signedIn ? (
          <Link
            href="/admin"
            className={`${pill} px-3.5 sm:px-4`}
            aria-label="Open editor"
          >
            Edit
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 px-3 sm:px-5"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
      }}
    >
      <Link
        href="/"
        aria-label="Back to wall"
        className={`${pill} gap-0.5 pl-2 pr-3.5 sm:pl-2.5 sm:pr-4`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          className="-ml-0.5 text-ink/80"
          aria-hidden
        >
          <path
            d="M14.5 6.5L9 12l5.5 5.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Wall</span>
      </Link>

      {isTripPage ? (
        <div className="pointer-events-auto flex items-center gap-2">
          <SharePageButton />
        </div>
      ) : null}
    </div>
  );
}
