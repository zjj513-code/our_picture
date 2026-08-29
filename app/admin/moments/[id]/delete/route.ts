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
      throw new AdminInputError("请先确认删除操作。");
    }
    const deleted = await deleteMoment(id);
    if (!deleted) throw new AdminInputError("找不到这条记录。");
    return redirectWithNotice(request, "/admin", "notice", "记录已删除。");
  } catch (error) {
    const message = error instanceof AdminInputError ? error.message : "无法删除记录。";
    return redirectWithNotice(request, destination, "error", message);
  }
}
