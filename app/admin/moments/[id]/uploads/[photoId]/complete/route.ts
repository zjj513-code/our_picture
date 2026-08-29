import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getPhotoUpload,
  markPhotoFailed,
  markPhotoProcessing,
} from "@/database/photo-uploads";
import { AdminInputError, parseRecordId } from "@/lib/admin-validation";
import { adminMutationGuard } from "@/lib/admin-session";
import {
  UploadVerificationError,
  verifyOriginalUpload,
} from "@/lib/aws/original-upload";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; photoId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await adminMutationGuard(request);
  if (denied) return denied;

  let momentId: string | undefined;
  let photoId: string | undefined;
  try {
    const resolved = await params;
    momentId = parseRecordId(resolved.id);
    photoId = parseRecordId(resolved.photoId);
    const photo = await getPhotoUpload(momentId, photoId);
    if (!photo) return NextResponse.json({ error: "找不到这张照片。" }, { status: 404 });
    if (photo.status === "processing" || photo.status === "ready") {
      return NextResponse.json({ photoId, status: photo.status });
    }
    if (photo.status !== "pending") {
      return NextResponse.json({ error: "请先重新上传失败的文件，再完成校验。" }, { status: 409 });
    }
    if (!photo.originalContentType || !photo.originalByteSize || !photo.checksum) {
      return NextResponse.json({ error: "照片上传信息不完整。" }, { status: 409 });
    }
    await verifyOriginalUpload({
      key: photo.originalKey,
      contentType: photo.originalContentType,
      byteSize: photo.originalByteSize,
      checksum: photo.checksum,
    });
    const changed = await markPhotoProcessing(momentId, photoId);
    if (!changed) return NextResponse.json({ error: "照片状态已变化，请刷新后重试。" }, { status: 409 });
    return NextResponse.json({ photoId, status: "processing" });
  } catch (error) {
    if (error instanceof AdminInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof UploadVerificationError && momentId && photoId) {
      await markPhotoFailed(momentId, photoId, error.message);
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("Upload completion verification failed", error);
    return NextResponse.json({ error: "无法校验已上传的文件。" }, { status: 502 });
  }
}
