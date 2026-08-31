import type { NextRequest } from "next/server";
import { MomentPublicationError, setMomentStatus } from "@/database/moments";
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
    const formData = await request.formData();
    destination = formData.get("returnTo") === "/admin" ? "/admin" : `/admin/moments/${id}`;
    const status = formData.get("status");
    if (status !== "draft" && status !== "published") {
      throw new AdminInputError("发布状态无效。");
    }
    const updated = await setMomentStatus(id, status as MomentStatus);
    if (!updated) throw new AdminInputError("找不到这条记录。");
    return redirectWithNotice(
      request,
      destination,
      "notice",
      status === "published" ? "记录已发布。" : "记录已转回草稿。",
    );
  } catch (error) {
    const message = error instanceof AdminInputError || error instanceof MomentPublicationError
      ? error.message
      : "无法更改发布状态。";
    return redirectWithNotice(request, destination, "error", message);
  }
}
