"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isAdmin = pathname.startsWith("/admin");

  // Home is just the photo wall — no brand bar
  if (isHome) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-sand-200/50 bg-sand-50/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:h-16 sm:px-8">
        <Link
          href="/"
          className="text-[0.7rem] tracking-[0.16em] text-ink-muted uppercase transition hover:text-ink"
        >
          ← Wall
        </Link>
        {isAdmin ? (
          <span className="text-[0.7rem] tracking-[0.16em] text-ink-muted uppercase">
            Admin
          </span>
        ) : (
          <span />
        )}
      </div>
    </header>
  );
}
