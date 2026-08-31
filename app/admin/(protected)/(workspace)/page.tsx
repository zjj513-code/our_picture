import Link from "next/link";
import { MomentStatusSelect } from "@/components/admin/moment-status-select";
import { listAdminMoments } from "@/database/moments";
import { requireAdminPage } from "@/lib/admin-session";

type AdminIndexPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function AdminIndexPage({ searchParams }: AdminIndexPageProps) {
  await requireAdminPage();
  const moments = await listAdminMoments();
  const { error, notice } = await searchParams;

  return (
    <>
      <div className="admin-heading-row">
        <div>
          <h1 className="admin-title">影像记录</h1>
          <p className="admin-subtitle">发布影像记录。</p>
        </div>
        <Link className="admin-link-button admin-button--primary" href="/admin/moments/new">
          新建记录
        </Link>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}
      {notice ? <p className="admin-notice">{notice}</p> : null}

      {moments.length === 0 ? (
        <p className="admin-empty">还没有影像记录。</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>标题 / 地点</th>
                <th>状态</th>
                <th>照片</th>
                <th><span className="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {moments.map((moment) => (
                <tr key={moment.id}>
                  <td>{moment.date}</td>
                  <td>{moment.title ?? moment.location ?? "未命名"}</td>
                  <td>
                    <MomentStatusSelect
                      initialStatus={moment.status}
                      label={moment.title ?? moment.location ?? "未命名"}
                      momentId={moment.id}
                    />
                  </td>
                  <td>{moment.photoCount}</td>
                  <td>
                    <div className="admin-actions">
                      <Link className="admin-link-button" href={`/admin/moments/${moment.id}`}>
                        编辑
                      </Link>
                      <Link className="admin-link-button" href={`/admin/moments/${moment.id}/preview`}>
                        预览
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
