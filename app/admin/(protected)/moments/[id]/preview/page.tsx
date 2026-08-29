import Link from "next/link";
import { notFound } from "next/navigation";
import { getMomentById } from "@/database/moments";
import { MomentSection } from "@/components/moment-section";
import { momentStatusLabel } from "@/lib/admin-labels";
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
    <div className="admin-preview-page" lang="zh-CN">
      <div className="admin-preview-bar">
        <span>私密预览 · {momentStatusLabel(moment.status)}</span>
        <Link className="admin-link-button" href={`/admin/moments/${moment.id}`}>
          返回编辑
        </Link>
      </div>
      <main id="photography-archive" className="archive-shell">
        <h1 className="sr-only">影像记录预览</h1>
        <MomentSection moment={moment} priority />
      </main>
    </div>
  );
}
