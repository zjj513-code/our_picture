import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

const originalsBucket = process.env.ORIGINALS_BUCKET;
const webBucket = process.env.WEB_BUCKET;
const maxSourceBytes = Number(process.env.MAX_SOURCE_BYTES ?? 250 * 1024 * 1024);
const s3 = new S3Client({});

const formats = {
  jpg: { detected: "jpeg", contentType: "image/jpeg" },
  png: { detected: "png", contentType: "image/png" },
  webp: { detected: "webp", contentType: "image/webp" },
  tif: { detected: "tiff", contentType: "image/tiff" },
};

export class SourceValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SourceValidationError";
    this.code = code;
  }
}

export async function handler(event) {
  assertConfiguration();
  const records = Array.isArray(event?.Records) ? event.Records : [];
  const outcomes = [];
  for (const record of records) outcomes.push(await processRecord(record));
  return { processed: outcomes.length, outcomes };
}

export async function processRecord(record, dependencies = {}) {
  const client = dependencies.s3 ?? s3;
  const bucket = record?.s3?.bucket?.name;
  const encodedKey = record?.s3?.object?.key;
  if (bucket !== originalsBucket || typeof encodedKey !== "string") {
    throw new Error("Unexpected S3 event source.");
  }
  const sourceKey = decodeURIComponent(encodedKey.replace(/\+/g, " "));
  const identity = parseSourceKey(sourceKey);
  if (!identity) {
    console.log(JSON.stringify({ status: "ignored", sourceKey }));
    return { status: "ignored", sourceKey };
  }

  const source = await client.send(new GetObjectCommand({
    Bucket: originalsBucket,
    Key: sourceKey,
    VersionId: record.s3.object.versionId,
    ChecksumMode: "ENABLED",
  }));
  const bytes = await source.Body?.transformToByteArray();
  if (!bytes) throw new Error("S3 returned an empty source body.");
  const body = Buffer.from(bytes);
  const checksumSha256 = source.ChecksumSHA256;
  const sourceVersionId = source.VersionId ?? record.s3.object.versionId ?? null;
  const sourceEtag = source.ETag?.replaceAll('"', "") ?? record.s3.object.eTag ?? null;
  const resultKey = `processing-results/${identity.photoId}.json`;

  if (checksumSha256) {
    const existing = await readExistingResult(client, resultKey);
    if (
      existing?.status === "ready" &&
      existing.sourceKey === sourceKey &&
      existing.checksumSha256 === checksumSha256
    ) {
      console.log(JSON.stringify({ status: "duplicate", sourceKey, photoId: identity.photoId }));
      return { status: "duplicate", photoId: identity.photoId };
    }
  }

  const baseResult = {
    schemaVersion: 1,
    momentId: identity.momentId,
    photoId: identity.photoId,
    sourceKey,
    sourceVersionId,
    sourceEtag,
    checksumSha256: checksumSha256 ?? null,
    sequencer: record.s3.object.sequencer ?? null,
    processedAt: new Date().toISOString(),
  };

  try {
    validateSourceObject({
      body,
      contentLength: source.ContentLength,
      contentType: source.ContentType,
      checksumSha256,
      extension: identity.extension,
    });
    const derivatives = await createDerivatives(body, identity.extension);
    const prefix = `moments/${identity.momentId}/photos/${identity.photoId}`;
    const webKey = `${prefix}/display.webp`;
    const thumbnailKey = `${prefix}/thumbnail.webp`;
    const metadata = {
      "source-key": sourceKey,
      ...(checksumSha256 ? { "source-checksum-sha256": checksumSha256 } : {}),
    };
    await Promise.all([
      putDerivative(client, webKey, derivatives.display.data, metadata),
      putDerivative(client, thumbnailKey, derivatives.thumbnail.data, metadata),
    ]);
    const result = {
      ...baseResult,
      status: "ready",
      webKey,
      thumbnailKey,
      width: derivatives.display.width,
      height: derivatives.display.height,
      thumbnailWidth: derivatives.thumbnail.width,
      thumbnailHeight: derivatives.thumbnail.height,
    };
    await writeResult(client, resultKey, result);
    console.log(JSON.stringify({ status: "ready", sourceKey, photoId: identity.photoId }));
    return { status: "ready", photoId: identity.photoId };
  } catch (error) {
    const result = {
      ...baseResult,
      status: "failed",
      errorCode: error instanceof SourceValidationError ? error.code : "PROCESSING_FAILED",
      errorMessage: safeErrorMessage(error),
    };
    await writeResult(client, resultKey, result);
    console.error(JSON.stringify({ status: "failed", sourceKey, photoId: identity.photoId, error: result.errorMessage }));
    return { status: "failed", photoId: identity.photoId };
  }
}

export function parseSourceKey(key) {
  const match = /^originals\/moments\/([A-Za-z0-9-]{1,36})\/photos\/([A-Za-z0-9-]{1,36})\/source\.(jpg|png|webp|tif)$/.exec(key);
  if (!match) return null;
  return { momentId: match[1], photoId: match[2], extension: match[3] };
}

export async function createDerivatives(body, extension) {
  const expected = formats[extension];
  if (!expected) throw new SourceValidationError("UNSUPPORTED_EXTENSION", "Unsupported source extension.");
  let metadata;
  try {
    metadata = await sharp(body, { failOn: "error", limitInputPixels: 300_000_000 }).metadata();
  } catch {
    throw new SourceValidationError("INVALID_IMAGE", "The source could not be decoded as an image.");
  }
  if (metadata.format !== expected.detected || !metadata.width || !metadata.height) {
    throw new SourceValidationError("TYPE_MISMATCH", "The detected image type does not match the signed source type.");
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new SourceValidationError("MULTI_PAGE_IMAGE", "Multi-page images are not supported.");
  }

  const inputOptions = { failOn: "error", limitInputPixels: 300_000_000 };
  const [display, thumbnail] = await Promise.all([
    sharp(body, inputOptions)
      .rotate()
      .resize({ width: 1536, withoutEnlargement: true, fit: "inside" })
      .webp({ quality: 84, effort: 4 })
      .toBuffer({ resolveWithObject: true }),
    sharp(body, inputOptions)
      .rotate()
      .resize({ width: 768, withoutEnlargement: true, fit: "inside" })
      .webp({ quality: 80, effort: 4 })
      .toBuffer({ resolveWithObject: true }),
  ]);
  return {
    display: { data: display.data, width: display.info.width, height: display.info.height },
    thumbnail: { data: thumbnail.data, width: thumbnail.info.width, height: thumbnail.info.height },
  };
}

function validateSourceObject({ body, contentLength, contentType, checksumSha256, extension }) {
  const expected = formats[extension];
  if (body.byteLength < 1 || body.byteLength > maxSourceBytes || contentLength !== body.byteLength) {
    throw new SourceValidationError("INVALID_SIZE", "The stored source size is invalid.");
  }
  if (contentType?.toLowerCase() !== expected.contentType) {
    throw new SourceValidationError("CONTENT_TYPE_MISMATCH", "The stored media type does not match its source key.");
  }
  if (!checksumSha256) {
    throw new SourceValidationError("MISSING_CHECKSUM", "The stored source has no SHA-256 checksum.");
  }
}

async function putDerivative(client, key, body, metadata) {
  await client.send(new PutObjectCommand({
    Bucket: webBucket,
    Key: key,
    Body: body,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
    Metadata: metadata,
  }));
}

async function writeResult(client, key, result) {
  await client.send(new PutObjectCommand({
    Bucket: originalsBucket,
    Key: key,
    Body: JSON.stringify(result),
    ContentType: "application/json",
    CacheControl: "no-store",
  }));
}

async function readExistingResult(client, key) {
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: originalsBucket, Key: key }));
    return JSON.parse(await response.Body.transformToString());
  } catch (error) {
    // With object-only GetObject permission and no ListBucket, S3 intentionally
    // reports a missing allowed key as 403 instead of revealing its absence.
    if (
      error?.name === "NoSuchKey" ||
      error?.$metadata?.httpStatusCode === 404 ||
      error?.name === "AccessDenied" && error?.$metadata?.httpStatusCode === 403
    ) return null;
    throw error;
  }
}

function assertConfiguration() {
  if (!originalsBucket || !webBucket) throw new Error("ORIGINALS_BUCKET and WEB_BUCKET are required.");
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes < 1) throw new Error("MAX_SOURCE_BYTES is invalid.");
}

function safeErrorMessage(error) {
  if (error instanceof SourceValidationError) return error.message;
  return "Image processing failed.";
}
