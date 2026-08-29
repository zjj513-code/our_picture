import type { NextRequest } from "next/server";
import { PhotoRemovalError, removePhoto } from "@/database/moments";
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
      throw new AdminInputError("请先确认移除照片。");
    }
    const removed = await removePhoto(id, photoId);
    if (!removed) throw new AdminInputError("找不到这张照片。");
    return redirectWithNotice(request, `/admin/moments/${id}`, "notice", "照片记录已移除。");
  } catch (error) {
    const message = error instanceof AdminInputError || error instanceof PhotoRemovalError
      ? error.message
      : "无法移除照片。";
    return redirectWithNotice(request, destination, "error", message);
  }
}
