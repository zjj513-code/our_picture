import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-session";

export default async function AdminWorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdminPage();

  return (
    <div className="admin-app">
      <header className="admin-header">
        <Link className="admin-brand" href="/admin">
          Our Pictures / Admin
        </Link>
        <div className="admin-header-actions">
          <span className="admin-username">{admin.username}</span>
          <form action="/admin/auth/logout" method="post">
            <button className="admin-button admin-button--quiet" type="submit">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
