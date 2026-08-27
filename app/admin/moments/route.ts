import type { NextRequest } from "next/server";
import { createMoment } from "@/database/moments";
import { AdminInputError, parseMomentForm } from "@/lib/admin-validation";
import { adminMutationGuard, redirectWithNotice } from "@/lib/admin-session";

export async function POST(request: NextRequest) {
  const denied = await adminMutationGuard(request);
  if (denied) return denied;

  try {
    const id = await createMoment(parseMomentForm(await request.formData()));
    return redirectWithNotice(request, `/admin/moments/${id}`, "notice", "Moment created.");
  } catch (error) {
    const message = error instanceof AdminInputError ? error.message : "Could not create Moment.";
    return redirectWithNotice(request, "/admin/moments/new", "error", message);
  }
}
