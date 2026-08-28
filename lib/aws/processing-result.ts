import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type ProcessingResult = {
  schemaVersion: 1;
  momentId: string;
  photoId: string;
  sourceKey: string;
  sourceVersionId: string | null;
  sourceEtag: string | null;
  checksumSha256: string;
  sequencer: string | null;
  processedAt: string;
  status: "ready" | "failed";
  webKey?: string;
  thumbnailKey?: string;
  width?: number;
  height?: number;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  errorCode?: string;
  errorMessage?: string;
};

let client: S3Client | undefined;

export async function getProcessingResult(photoId: string): Promise<ProcessingResult | null> {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_ORIGINALS_BUCKET;
  if (!region || !bucket) throw new Error("AWS_REGION and AWS_ORIGINALS_BUCKET are required.");
  try {
    const response = await getS3Client(region).send(new GetObjectCommand({
      Bucket: bucket,
      Key: `processing-results/${photoId}.json`,
    }));
    if (!response.Body) throw new Error("Processing result has no body.");
    return parseProcessingResult(JSON.parse(await response.Body.transformToString()));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function parseProcessingResult(value: unknown): ProcessingResult {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error("Unsupported processing result.");
  const base = {
    schemaVersion: 1 as const,
    momentId: requiredString(value.momentId, "momentId"),
    photoId: requiredString(value.photoId, "photoId"),
    sourceKey: requiredString(value.sourceKey, "sourceKey"),
    sourceVersionId: optionalString(value.sourceVersionId),
    sourceEtag: optionalString(value.sourceEtag),
    checksumSha256: requiredString(value.checksumSha256, "checksumSha256"),
    sequencer: optionalString(value.sequencer),
    processedAt: requiredIsoDate(value.processedAt),
  };
  if (value.status === "ready") {
    return {
      ...base,
      status: "ready",
      webKey: requiredString(value.webKey, "webKey"),
      thumbnailKey: requiredString(value.thumbnailKey, "thumbnailKey"),
      width: positiveInteger(value.width, "width"),
      height: positiveInteger(value.height, "height"),
      thumbnailWidth: positiveInteger(value.thumbnailWidth, "thumbnailWidth"),
      thumbnailHeight: positiveInteger(value.thumbnailHeight, "thumbnailHeight"),
    };
  }
  if (value.status === "failed") {
    return {
      ...base,
      status: "failed",
      errorCode: requiredString(value.errorCode, "errorCode"),
      errorMessage: requiredString(value.errorMessage, "errorMessage").slice(0, 10_000),
    };
  }
  throw new Error("Invalid processing result status.");
}

function getS3Client(region: string) {
  client ??= new S3Client({ region });
  return client;
}

function isNotFound(error: unknown) {
  if (!isRecord(error)) return false;
  return error.name === "NoSuchKey" || isRecord(error.$metadata) && error.$metadata.httpStatusCode === 404;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length < 1) throw new Error(`Invalid ${field}.`);
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("Invalid optional string.");
  return value;
}

function positiveInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Invalid ${field}.`);
  }
  return value;
}

function requiredIsoDate(value: unknown) {
  const text = requiredString(value, "processedAt");
  if (!Number.isFinite(Date.parse(text))) throw new Error("Invalid processedAt.");
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
