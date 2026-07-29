import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { AdminChrome } from "@/components/admin/AdminChrome";

export default async function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-screen">
      <AdminChrome>{children}</AdminChrome>
    </div>
  );
}
