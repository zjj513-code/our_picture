import type { MomentStatus, PhotoStatus } from "@/lib/types";

export function momentStatusLabel(status: MomentStatus): string {
  return status === "published" ? "已发布" : "草稿";
}

export function photoStatusLabel(status: PhotoStatus): string {
  switch (status) {
    case "pending":
      return "等待上传";
    case "processing":
      return "处理中";
    case "ready":
      return "已就绪";
    case "failed":
      return "失败";
  }
}

export function photoProcessingErrorLabel(error: string): string {
  const code = error.split(":", 1)[0];
  const labels: Record<string, string> = {
    UNSUPPORTED_EXTENSION: "不支持这种原图扩展名。",
    INVALID_IMAGE: "无法将原文件识别为有效图片。",
    TYPE_MISMATCH: "检测到的图片类型与上传信息不一致。",
    MULTI_PAGE_IMAGE: "暂不支持多页图片。",
    INVALID_SIZE: "原图文件大小无效。",
    CONTENT_TYPE_MISMATCH: "原图媒体类型与文件信息不一致。",
    MISSING_CHECKSUM: "原图缺少 SHA-256 校验值。",
    PROCESSING_FAILED: "图片处理失败，请重新上传或稍后重试。",
  };
  return labels[code] ?? "图片处理失败，请重新上传或稍后重试。";
}
