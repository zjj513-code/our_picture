import type { NextRequest } from "next/server";
import { deleteMoment, getMomentById } from "@/database/moments";
import { AdminInputError, parseRecordId } from "@/lib/admin-validation";
import { adminMutationGuard, redirectWithNotice } from "@/lib/admin-session";
import {
  deleteMomentRemoteAssets,
  MomentRemoteDeletionError,
} from "@/lib/aws/moment-deletion";

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
    const moment = await getMomentById(id);
    if (!moment) throw new AdminInputError("找不到这条记录。");
    await deleteMomentRemoteAssets(moment);
    const deleted = await deleteMoment(id);
    if (!deleted) throw new AdminInputError("找不到这条记录。");
    return redirectWithNotice(
      request,
      "/admin",
      "notice",
      "记录、远程图片及缓存已永久删除。",
    );
  } catch (error) {
    if (!(error instanceof AdminInputError || error instanceof MomentRemoteDeletionError)) {
      console.error("Permanent Moment deletion failed", error);
    }
    const message = error instanceof AdminInputError || error instanceof MomentRemoteDeletionError
      ? error.message
      : "无法永久删除记录，请稍后重试。";
    return redirectWithNotice(request, destination, "error", message);
  }
}
