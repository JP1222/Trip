import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";

export default async function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-sand-100/40">
      <div className="border-b border-sand-200/80 bg-white/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-sm font-medium text-ink">
              Admin
            </Link>
            <Link
              href="/"
              className="text-sm text-ink-muted transition hover:text-sea"
            >
              View site
            </Link>
          </div>
          <AdminLogoutButton />
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">{children}</div>
    </div>
  );
}
