import Link from "next/link";
import { MomentForm } from "@/components/admin/moment-form";
import { requireAdminPage } from "@/lib/admin-session";

type NewMomentPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewMomentPage({ searchParams }: NewMomentPageProps) {
  await requireAdminPage();
  const { error } = await searchParams;
  return (
    <>
      <div className="admin-heading-row">
        <div>
          <h1 className="admin-title">新建记录</h1>
          <p className="admin-subtitle">新记录会先保存为草稿，可以暂时不添加照片。</p>
        </div>
        <Link className="admin-link-button" href="/admin">返回</Link>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      <MomentForm action="/admin/moments" submitLabel="创建记录" />
    </>
  );
}
