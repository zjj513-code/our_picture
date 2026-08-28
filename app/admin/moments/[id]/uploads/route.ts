import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  createPendingPhotoUploads,
  markPhotoFailed,
} from "@/database/photo-uploads";
import { AdminInputError, parseRecordId } from "@/lib/admin-validation";
import {
  getOriginalUploadConfig,
  signOriginalUpload,
} from "@/lib/aws/original-upload";
import { adminMutationGuard } from "@/lib/admin-session";
import { parseUploadBatch } from "@/lib/upload-validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await adminMutationGuard(request);
  if (denied) return denied;

  try {
    const { id: rawId } = await params;
    const momentId = parseRecordId(rawId);
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      throw new AdminInputError("Upload metadata must be JSON.");
    }
    const files = parseUploadBatch(await request.json());
    getOriginalUploadConfig();
    const pending = await createPendingPhotoUploads(momentId, files);
    if (!pending) return NextResponse.json({ error: "Moment not found." }, { status: 404 });

    const uploads = await Promise.all(
      pending.map(async (file) => {
        try {
          const upload = await signOriginalUpload({
            key: file.originalKey,
            contentType: file.contentType,
            byteSize: file.byteSize,
            checksum: file.checksum,
          });
          return { clientId: file.clientId, photoId: file.photoId, upload };
        } catch {
          const error = "Could not create an S3 upload URL.";
          await markPhotoFailed(momentId, file.photoId, error);
          return { clientId: file.clientId, photoId: file.photoId, error };
        }
      }),
    );
    return NextResponse.json({ uploads }, { status: 201 });
  } catch (error) {
    if (error instanceof AdminInputError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: error instanceof AdminInputError ? error.message : "Invalid JSON body." },
        { status: 400 },
      );
    }
    console.error("Upload initialization failed", error);
    return NextResponse.json({ error: "Upload service is not configured or available." }, { status: 503 });
  }
}
