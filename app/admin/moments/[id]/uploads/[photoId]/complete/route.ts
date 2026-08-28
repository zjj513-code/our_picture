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
    if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    if (photo.status === "processing" || photo.status === "ready") {
      return NextResponse.json({ photoId, status: photo.status });
    }
    if (photo.status !== "pending") {
      return NextResponse.json({ error: "Retry this failed upload before completing it." }, { status: 409 });
    }
    if (!photo.originalContentType || !photo.originalByteSize || !photo.checksum) {
      return NextResponse.json({ error: "Photo upload metadata is incomplete." }, { status: 409 });
    }
    await verifyOriginalUpload({
      key: photo.originalKey,
      contentType: photo.originalContentType,
      byteSize: photo.originalByteSize,
      checksum: photo.checksum,
    });
    const changed = await markPhotoProcessing(momentId, photoId);
    if (!changed) return NextResponse.json({ error: "Photo state changed; refresh and try again." }, { status: 409 });
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
    return NextResponse.json({ error: "Could not verify the uploaded object." }, { status: 502 });
  }
}
