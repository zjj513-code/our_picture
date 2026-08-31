import type { NextRequest } from "next/server";
import { MomentPublicationError, setMomentStatus } from "@/database/moments";
import { AdminInputError, parseRecordId } from "@/lib/admin-validation";
import { adminMutationGuard, redirectWithNotice } from "@/lib/admin-session";
import type { MomentStatus } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const wantsJson = request.headers.get("accept")?.includes("application/json") ?? false;
  const denied = await adminMutationGuard(request);
  if (denied) {
    return wantsJson
      ? Response.json(
          { error: denied.status === 403 ? "请求来源无效。" : "登录已失效，请刷新页面后重新登录。" },
          { status: denied.status === 403 ? 403 : 401 },
        )
      : denied;
  }
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
    if (wantsJson) return Response.json({ status });
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
    if (wantsJson) return Response.json({ error: message }, { status: 400 });
    return redirectWithNotice(request, destination, "error", message);
  }
}
