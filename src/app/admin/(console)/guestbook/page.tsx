import { AdminGuestbookEditor } from "@/components/admin/AdminGuestbookEditor";
import { listGuestbookEntries } from "@/lib/guestbook";

export const dynamic = "force-dynamic";

export default async function AdminGuestbookPage() {
  const entries = await listGuestbookEntries(200);

  return (
    <div className="min-h-screen bg-sand-50">
      <div className="mx-auto max-w-3xl px-5 pt-20 pb-16 sm:px-8">
        <AdminGuestbookEditor initialEntries={entries} />
      </div>
    </div>
  );
}
