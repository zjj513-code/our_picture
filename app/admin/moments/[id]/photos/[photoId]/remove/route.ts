import type { NextRequest } from "next/server";
import { removePhoto } from "@/database/moments";
import { AdminInputError, parseRecordId } from "@/lib/admin-validation";
import { adminMutationGuard, redirectWithNotice } from "@/lib/admin-session";

type RouteContext = { params: Promise<{ id: string; photoId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await adminMutationGuard(request);
  if (denied) return denied;
  const { id: rawId, photoId: rawPhotoId } = await params;
  let destination = "/admin";

  try {
    const id = parseRecordId(rawId);
    destination = `/admin/moments/${id}`;
    const photoId = parseRecordId(rawPhotoId);
    const formData = await request.formData();
    if (formData.get("confirm") !== "yes") {
      throw new AdminInputError("Photo removal was not confirmed.");
    }
    const removed = await removePhoto(id, photoId);
    if (!removed) throw new AdminInputError("Photo not found.");
    return redirectWithNotice(request, `/admin/moments/${id}`, "notice", "Photo record removed.");
  } catch (error) {
    const message = error instanceof AdminInputError ? error.message : "Could not remove photo.";
    return redirectWithNotice(request, destination, "error", message);
  }
}
