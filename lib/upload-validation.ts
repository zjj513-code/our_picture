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
    throw new AdminInputError("Upload files are required.");
  }
  if (value.files.length < 1 || value.files.length > MAX_UPLOAD_BATCH_SIZE) {
    throw new AdminInputError(`Choose between 1 and ${MAX_UPLOAD_BATCH_SIZE} files.`);
  }
  const files = value.files.map(parseUploadFile);
  if (new Set(files.map(({ clientId }) => clientId)).size !== files.length) {
    throw new AdminInputError("Upload identifiers must be unique within a batch.");
  }
  return files;
}

function parseUploadFile(value: unknown): UploadFileRequest {
  if (!isRecord(value)) throw new AdminInputError("Invalid upload metadata.");
  const clientId = requiredString(value.clientId, 64, "Upload identifier");
  if (!/^[A-Za-z0-9-]+$/.test(clientId)) {
    throw new AdminInputError("Invalid upload identifier.");
  }
  const filename = requiredString(value.filename, 255, "Filename");
  if (filename.includes("\0")) throw new AdminInputError("Invalid filename.");
  const contentType = requiredString(value.contentType, 100, "Media type").toLowerCase();
  const extension = contentTypes.get(contentType);
  if (!extension) {
    throw new AdminInputError("Only JPEG, PNG, WebP, and TIFF images can be uploaded.");
  }
  const byteSize = value.byteSize;
  if (typeof byteSize !== "number" || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > MAX_UPLOAD_BYTES) {
    throw new AdminInputError("Each image must be between 1 byte and 250 MiB.");
  }
  const checksum = requiredString(value.checksum, 44, "SHA-256 checksum");
  if (!/^[A-Za-z0-9+/]{43}=$/.test(checksum)) {
    throw new AdminInputError("Invalid SHA-256 checksum.");
  }
  return { clientId, filename, contentType, byteSize, checksum, extension };
}

function requiredString(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > maxLength) {
    throw new AdminInputError(`${label} is invalid.`);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
