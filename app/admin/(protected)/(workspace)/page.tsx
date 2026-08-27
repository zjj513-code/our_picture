import Link from "next/link";
import { listAdminMoments } from "@/database/moments";
import { requireAdminPage } from "@/lib/admin-session";

type AdminIndexPageProps = {
  searchParams: Promise<{ notice?: string }>;
};

export default async function AdminIndexPage({ searchParams }: AdminIndexPageProps) {
  await requireAdminPage();
  const moments = await listAdminMoments();
  const { notice } = await searchParams;

  return (
    <>
      <div className="admin-heading-row">
        <div>
          <h1 className="admin-title">Moments</h1>
          <p className="admin-subtitle">Create, review, and publish the archive.</p>
        </div>
        <Link className="admin-link-button admin-button--primary" href="/admin/moments/new">
          New Moment
        </Link>
      </div>

      {notice ? <p className="admin-notice">{notice}</p> : null}

      {moments.length === 0 ? (
        <p className="admin-empty">No Moments yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Title / location</th>
                <th>Status</th>
                <th>Photos</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {moments.map((moment) => (
                <tr key={moment.id}>
                  <td>{moment.date}</td>
                  <td>{moment.title ?? moment.location ?? "Untitled"}</td>
                  <td>
                    <span className={`admin-status admin-status--${moment.status}`}>
                      {moment.status}
                    </span>
                  </td>
                  <td>{moment.photoCount}</td>
                  <td>
                    <div className="admin-actions">
                      <Link className="admin-link-button" href={`/admin/moments/${moment.id}`}>
                        Edit
                      </Link>
                      <Link className="admin-link-button" href={`/admin/moments/${moment.id}/preview`}>
                        Preview
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
