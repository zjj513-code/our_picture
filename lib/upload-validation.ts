import { AdminInputError } from "@/lib/admin-validation";

export const MAX_UPLOAD_BATCH_SIZE = 30;
export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

const contentTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/tiff", "tif"],
]);

export type UploadFileRequest = {
  clientId: string;
  filename: string;
  contentType: string;
  byteSize: number;
  checksum: string;
  extension: string;
};

export function parseUploadBatch(value: unknown): UploadFileRequest[] {
  if (!isRecord(value) || !Array.isArray(value.files)) {
    throw new AdminInputError("请选择要上传的文件。");
  }
  if (value.files.length < 1 || value.files.length > MAX_UPLOAD_BATCH_SIZE) {
    throw new AdminInputError(`每次请选择 1–${MAX_UPLOAD_BATCH_SIZE} 个文件。`);
  }
  const files = value.files.map(parseUploadFile);
  if (new Set(files.map(({ clientId }) => clientId)).size !== files.length) {
    throw new AdminInputError("同一批次中的上传标识不能重复。");
  }
  return files;
}

function parseUploadFile(value: unknown): UploadFileRequest {
  if (!isRecord(value)) throw new AdminInputError("上传信息无效。");
  const clientId = requiredString(value.clientId, 64, "上传标识");
  if (!/^[A-Za-z0-9-]+$/.test(clientId)) {
    throw new AdminInputError("上传标识无效。");
  }
  const filename = requiredString(value.filename, 255, "文件名");
  if (filename.includes("\0")) throw new AdminInputError("文件名无效。");
  const contentType = requiredString(value.contentType, 100, "媒体类型").toLowerCase();
  const extension = contentTypes.get(contentType);
  if (!extension) {
    throw new AdminInputError("仅支持上传 JPEG、PNG、WebP 和 TIFF 图片。");
  }
  const byteSize = value.byteSize;
  if (typeof byteSize !== "number" || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > MAX_UPLOAD_BYTES) {
    throw new AdminInputError("单张图片必须在 1 字节到 250 MiB 之间。");
  }
  const checksum = requiredString(value.checksum, 44, "SHA-256 校验值");
  if (!/^[A-Za-z0-9+/]{43}=$/.test(checksum)) {
    throw new AdminInputError("SHA-256 校验值无效。");
  }
  return { clientId, filename, contentType, byteSize, checksum, extension };
}

function requiredString(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > maxLength) {
    throw new AdminInputError(`${label}无效。`);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
