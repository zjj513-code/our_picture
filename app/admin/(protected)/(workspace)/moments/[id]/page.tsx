import Link from "next/link";
import { notFound } from "next/navigation";
import { getMomentById } from "@/database/moments";
import { reconcileMomentProcessingResults } from "@/database/photo-processing";
import { MomentForm } from "@/components/admin/moment-form";
import { PhotoOrderEditor } from "@/components/admin/photo-order-editor";
import { PhotoUploadPanel } from "@/components/admin/photo-upload-panel";
import { momentStatusLabel } from "@/lib/admin-labels";
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
          <h1 className="admin-title">编辑记录</h1>
          <p className="admin-subtitle">
            {moment.date} · {momentStatusLabel(moment.status)}
          </p>
        </div>
        <div className="admin-actions">
          <Link className="admin-link-button" href={`/admin/moments/${moment.id}/preview`}>
            预览
          </Link>
          <Link className="admin-link-button" href="/admin">返回</Link>
        </div>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      {notice ? <p className="admin-notice">{notice}</p> : null}

      <MomentForm
        action={`/admin/moments/${moment.id}/update`}
        moment={moment}
        submitLabel="保存基本信息"
      />

      <section className="admin-section">
        <h2 className="admin-section-title">发布状态</h2>
        <p className="admin-copy">
          {moment.status === "published"
            ? "这条记录已显示在公开首页。"
            : "这条草稿只会显示在管理后台的预览中。"}
        </p>
        <form className="admin-form-actions" action={`/admin/moments/${moment.id}/status`} method="post">
          <input type="hidden" name="status" value={moment.status === "published" ? "draft" : "published"} />
          <button className="admin-button" type="submit">
            {moment.status === "published" ? "转回草稿" : "发布记录"}
          </button>
        </form>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">照片</h2>
        <PhotoUploadPanel momentId={moment.id} />
        {moment.photos.length === 0 ? (
          <p className="admin-empty">这条草稿中还没有照片。</p>
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
        <h2 className="admin-section-title">删除记录</h2>
        <p className="admin-copy">
          删除后，数据库记录、已上传的 S3 原图、展示图、缩略图及 CloudFront 缓存都会被永久清除，无法恢复。
        </p>
        <form action={`/admin/moments/${moment.id}/delete`} method="post">
          <label className="admin-confirm">
            <input type="checkbox" name="confirm" value="yes" required />
            我明白记录和已上传的远程图片都会被永久删除。
          </label>
          <button className="admin-button admin-button--danger" type="submit">
            永久删除记录
          </button>
        </form>
      </section>
    </>
  );
}
