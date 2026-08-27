import type { NextRequest } from "next/server";
import { deleteMoment } from "@/database/moments";
import { AdminInputError, parseRecordId } from "@/lib/admin-validation";
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
    const formData = await request.formData();
    if (formData.get("confirm") !== "yes") {
      throw new AdminInputError("Deletion was not confirmed.");
    }
    const deleted = await deleteMoment(id);
    if (!deleted) throw new AdminInputError("Moment not found.");
    return redirectWithNotice(request, "/admin", "notice", "Moment deleted.");
  } catch (error) {
    const message = error instanceof AdminInputError ? error.message : "Could not delete Moment.";
    return redirectWithNotice(request, destination, "error", message);
  }
}
