import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-session";

export default async function AdminWorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdminPage();

  return (
    <div className="admin-app" lang="zh-CN">
      <header className="admin-header">
        <Link className="admin-brand" href="/">
          Our Pictures / 管理后台
        </Link>
        <div className="admin-header-actions">
          <span className="admin-username">{admin.username}</span>
          <form action="/admin/auth/logout" method="post">
            <button className="admin-button admin-button--quiet" type="submit">
              退出登录
            </button>
          </form>
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
