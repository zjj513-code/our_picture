import type { NextRequest } from "next/server";
import { setMomentStatus } from "@/database/moments";
import { AdminInputError, parseRecordId } from "@/lib/admin-validation";
import { adminMutationGuard, redirectWithNotice } from "@/lib/admin-session";
import type { MomentStatus } from "@/lib/types";

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
    const status = formData.get("status");
    if (status !== "draft" && status !== "published") {
      throw new AdminInputError("Invalid publication status.");
    }
    const updated = await setMomentStatus(id, status as MomentStatus);
    if (!updated) throw new AdminInputError("Moment not found.");
    return redirectWithNotice(
      request,
      `/admin/moments/${id}`,
      "notice",
      status === "published" ? "Moment published." : "Moment returned to draft.",
    );
  } catch (error) {
    const message = error instanceof AdminInputError ? error.message : "Could not change status.";
    return redirectWithNotice(request, destination, "error", message);
  }
}
