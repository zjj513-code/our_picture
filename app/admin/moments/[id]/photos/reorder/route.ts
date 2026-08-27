import type { NextRequest } from "next/server";
import { PhotoOrderError, reorderPhotos } from "@/database/moments";
import { AdminInputError, parsePhotoOrder, parseRecordId } from "@/lib/admin-validation";
import { adminMutationGuard, redirectWithNotice } from "@/lib/admin-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await adminMutationGuard(request);
  if (denied) return denied;
  const { id: rawId } = await params;
  let destination = "/admin";

  try {
    const id = parseRecordId(rawId);
    destination = `/admin/moments/${id}`;
    const order = parsePhotoOrder(await request.formData());
    await reorderPhotos(id, order);
    return redirectWithNotice(request, `/admin/moments/${id}`, "notice", "Photo order saved.");
  } catch (error) {
    const message = error instanceof AdminInputError || error instanceof PhotoOrderError
      ? error.message
      : "Could not reorder photos.";
    return redirectWithNotice(request, destination, "error", message);
  }
}
