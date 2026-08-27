import type { NextRequest } from "next/server";
import { updateMoment } from "@/database/moments";
import { AdminInputError, parseMomentForm, parseRecordId } from "@/lib/admin-validation";
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
    const updated = await updateMoment(id, parseMomentForm(await request.formData()));
    if (!updated) throw new AdminInputError("Moment not found.");
    return redirectWithNotice(request, `/admin/moments/${id}`, "notice", "Metadata saved.");
  } catch (error) {
    const message = error instanceof AdminInputError ? error.message : "Could not save Moment.";
    return redirectWithNotice(request, destination, "error", message);
  }
}
