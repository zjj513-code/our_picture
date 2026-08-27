import Link from "next/link";
import { notFound } from "next/navigation";
import { getMomentById } from "@/database/moments";
import { MomentSection } from "@/components/moment-section";
import { requireAdminPage } from "@/lib/admin-session";
import { parseRecordId } from "@/lib/admin-validation";

type PreviewPageProps = { params: Promise<{ id: string }> };

export default async function PreviewPage({ params }: PreviewPageProps) {
  await requireAdminPage();
  const { id: rawId } = await params;
  let id: string;
  try {
    id = parseRecordId(rawId);
  } catch {
    notFound();
  }
  const moment = await getMomentById(id);
  if (!moment) notFound();

  return (
    <div className="admin-preview-page">
      <div className="admin-preview-bar">
        <span>Private preview · {moment.status}</span>
        <Link className="admin-link-button" href={`/admin/moments/${moment.id}`}>Back to edit</Link>
      </div>
      <main id="photography-archive" className="archive-shell">
        <h1 className="sr-only">Moment preview</h1>
        <MomentSection moment={moment} priority />
      </main>
    </div>
  );
}
