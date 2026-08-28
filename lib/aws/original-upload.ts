import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type OriginalUploadDescriptor = {
  key: string;
  contentType: string;
  byteSize: number;
  checksum: string;
};

export type SignedOriginalUpload = {
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
};

export class UploadVerificationError extends Error {}

let client: S3Client | undefined;

export function getOriginalUploadConfig() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_ORIGINALS_BUCKET;
  const ttl = Number(process.env.AWS_UPLOAD_URL_TTL_SECONDS ?? "900");
  if (!region || !bucket) {
    throw new Error("AWS_REGION and AWS_ORIGINALS_BUCKET are required for uploads.");
  }
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 900) {
    throw new Error("AWS_UPLOAD_URL_TTL_SECONDS must be an integer from 60 to 900.");
  }
  return { region, bucket, ttl };
}

export async function signOriginalUpload(
  descriptor: OriginalUploadDescriptor,
): Promise<SignedOriginalUpload> {
  const config = getOriginalUploadConfig();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: descriptor.key,
    ContentType: descriptor.contentType,
    ChecksumSHA256: descriptor.checksum,
  });
  const url = await getSignedUrl(getS3Client(config.region), command, {
    expiresIn: config.ttl,
    signableHeaders: new Set(["content-type"]),
    unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
  });
  return {
    url,
    headers: {
      "content-type": descriptor.contentType,
      "x-amz-checksum-sha256": descriptor.checksum,
    },
    expiresAt: new Date(Date.now() + config.ttl * 1000).toISOString(),
  };
}

export async function verifyOriginalUpload(
  descriptor: OriginalUploadDescriptor,
): Promise<void> {
  const config = getOriginalUploadConfig();
  const object = await getS3Client(config.region).send(
    new HeadObjectCommand({
      Bucket: config.bucket,
      Key: descriptor.key,
      ChecksumMode: "ENABLED",
    }),
  );
  if (object.ContentLength !== descriptor.byteSize) {
    throw new UploadVerificationError("Stored object size does not match the signed upload.");
  }
  if (object.ContentType?.toLowerCase() !== descriptor.contentType) {
    throw new UploadVerificationError("Stored media type does not match the signed upload.");
  }
  if (object.ChecksumSHA256 !== descriptor.checksum) {
    throw new UploadVerificationError("Stored checksum does not match the selected file.");
  }
}

function getS3Client(region: string): S3Client {
  client ??= new S3Client({ region });
  return client;
}
