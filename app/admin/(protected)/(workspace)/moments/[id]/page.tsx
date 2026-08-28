import Link from "next/link";
import { notFound } from "next/navigation";
import { getMomentById } from "@/database/moments";
import { reconcileMomentProcessingResults } from "@/database/photo-processing";
import { MomentForm } from "@/components/admin/moment-form";
import { PhotoOrderEditor } from "@/components/admin/photo-order-editor";
import { PhotoUploadPanel } from "@/components/admin/photo-upload-panel";
import { requireAdminPage } from "@/lib/admin-session";
import { parseRecordId } from "@/lib/admin-validation";

type EditMomentPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function EditMomentPage({ params, searchParams }: EditMomentPageProps) {
  await requireAdminPage();
  const { id: rawId } = await params;
  let id: string;
  try {
    id = parseRecordId(rawId);
  } catch {
    notFound();
  }
  await reconcileMomentProcessingResults(id);
  const moment = await getMomentById(id);
  if (!moment) notFound();
  const { error, notice } = await searchParams;

  return (
    <>
      <div className="admin-heading-row">
        <div>
          <h1 className="admin-title">Edit Moment</h1>
          <p className="admin-subtitle">{moment.date} · {moment.status}</p>
        </div>
        <div className="admin-actions">
          <Link className="admin-link-button" href={`/admin/moments/${moment.id}/preview`}>
            Preview
          </Link>
          <Link className="admin-link-button" href="/admin">Back</Link>
        </div>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      {notice ? <p className="admin-notice">{notice}</p> : null}

      <MomentForm
        action={`/admin/moments/${moment.id}/update`}
        moment={moment}
        submitLabel="Save metadata"
      />

      <section className="admin-section">
        <h2 className="admin-section-title">Publication</h2>
        <p className="admin-copy">
          {moment.status === "published"
            ? "This Moment is visible on the public homepage."
            : "This draft is visible only in the admin preview."}
        </p>
        <form className="admin-form-actions" action={`/admin/moments/${moment.id}/status`} method="post">
          <input type="hidden" name="status" value={moment.status === "published" ? "draft" : "published"} />
          <button className="admin-button" type="submit">
            {moment.status === "published" ? "Return to draft" : "Publish Moment"}
          </button>
        </form>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">Photos</h2>
        <PhotoUploadPanel momentId={moment.id} />
        {moment.photos.length === 0 ? (
          <p className="admin-empty">No photos in this draft yet.</p>
        ) : (
          <PhotoOrderEditor
            key={moment.photos.map(({ id, status }) => `${id}:${status}`).join("|")}
            momentId={moment.id}
            initialPhotos={moment.photos.map(({
              id,
              thumbnailUrl,
              webKey,
              webUrl,
              originalFilename,
              status,
              processingError,
            }) => ({
              id,
              thumbnailUrl,
              webKey,
              webUrl,
              filename: originalFilename,
              status,
              error: processingError,
            }))}
          />
        )}
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">Delete Moment</h2>
        <p className="admin-copy">This deletes the Moment and its Photo records. Local files and remote S3 objects are kept.</p>
        <form action={`/admin/moments/${moment.id}/delete`} method="post">
          <label className="admin-confirm">
            <input type="checkbox" name="confirm" value="yes" required />
            I understand that this database deletion cannot be undone.
          </label>
          <button className="admin-button admin-button--danger" type="submit">
            Delete Moment
          </button>
        </form>
      </section>
    </>
  );
}
