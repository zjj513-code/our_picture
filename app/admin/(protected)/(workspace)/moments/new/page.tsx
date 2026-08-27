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
          <h1 className="admin-title">New Moment</h1>
          <p className="admin-subtitle">New Moments begin as drafts and may contain zero photos.</p>
        </div>
        <Link className="admin-link-button" href="/admin">Back</Link>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      <MomentForm action="/admin/moments" submitLabel="Create Moment" />
    </>
  );
}
