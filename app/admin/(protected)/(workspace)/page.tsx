import Link from "next/link";
import { listAdminMoments } from "@/database/moments";
import { momentStatusLabel } from "@/lib/admin-labels";
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
                    <form
                      className="admin-status-form"
                      action={`/admin/moments/${moment.id}/status`}
                      method="post"
                    >
                      <input type="hidden" name="returnTo" value="/admin" />
                      <select
                        className="admin-status-select"
                        name="status"
                        defaultValue={moment.status}
                        aria-label={`${moment.title ?? moment.location ?? "未命名"}的发布状态`}
                      >
                        <option value="draft">{momentStatusLabel("draft")}</option>
                        <option value="published">{momentStatusLabel("published")}</option>
                      </select>
                      <button className="admin-button" type="submit">保存</button>
                    </form>
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
