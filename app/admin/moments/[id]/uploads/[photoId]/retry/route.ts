import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPhotoUpload, resetPhotoUpload } from "@/database/photo-uploads";
import { AdminInputError, parseRecordId } from "@/lib/admin-validation";
import { adminMutationGuard } from "@/lib/admin-session";
import { signOriginalUpload } from "@/lib/aws/original-upload";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; photoId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await adminMutationGuard(request);
  if (denied) return denied;

  try {
    const { id: rawId, photoId: rawPhotoId } = await params;
    const momentId = parseRecordId(rawId);
    const photoId = parseRecordId(rawPhotoId);
    let photo = await getPhotoUpload(momentId, photoId);
    if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    if (photo.status === "processing" || photo.status === "ready") {
      return NextResponse.json({ photoId, status: photo.status });
    }
    if (photo.status === "failed") {
      await resetPhotoUpload(momentId, photoId);
      photo = await getPhotoUpload(momentId, photoId);
    }
    if (photo?.status !== "pending") {
      return NextResponse.json({ error: "Only pending or failed uploads can be retried." }, { status: 409 });
    }
    if (!photo.originalContentType || !photo.originalByteSize || !photo.checksum) {
      return NextResponse.json({ error: "Photo upload metadata is incomplete." }, { status: 409 });
    }
    const upload = await signOriginalUpload({
      key: photo.originalKey,
      contentType: photo.originalContentType,
      byteSize: photo.originalByteSize,
      checksum: photo.checksum,
    });
    return NextResponse.json({ photoId, upload });
  } catch (error) {
    if (error instanceof AdminInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Upload retry failed", error);
    return NextResponse.json({ error: "Could not refresh the upload URL." }, { status: 503 });
  }
}
