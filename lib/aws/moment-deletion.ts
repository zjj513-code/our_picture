import { randomUUID } from "node:crypto";
import {
  CloudFrontClient,
  CreateInvalidationCommand,
  waitUntilInvalidationCompleted,
} from "@aws-sdk/client-cloudfront";
import { DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";
import type { Moment } from "@/lib/types";

export class MomentRemoteDeletionError extends Error {}

export type MomentRemoteDeletionPlan = {
  originalKeys: string[];
  webKeys: string[];
  invalidationPaths: string[];
};

let s3Client: S3Client | undefined;
let cloudFrontClient: CloudFrontClient | undefined;

export function buildMomentRemoteDeletionPlan(
  moment: Pick<Moment, "id" | "photos">,
): MomentRemoteDeletionPlan {
  if (moment.photos.some(({ status }) => status === "pending" || status === "processing")) {
    throw new MomentRemoteDeletionError("仍有照片正在上传或处理，请稍后再删除记录。");
  }
  const managedPhotos = moment.photos.filter((photo) => {
    const prefix = `originals/moments/${moment.id}/photos/${photo.id}/source.`;
    const extension = photo.originalKey.slice(prefix.length);
    return photo.originalKey.startsWith(prefix) && extension.length > 0 && !extension.includes("/");
  });

  return {
    originalKeys: managedPhotos.flatMap((photo) => [
      photo.originalKey,
      `processing-results/${photo.id}.json`,
    ]),
    webKeys: managedPhotos.flatMap((photo) => [
      `moments/${moment.id}/photos/${photo.id}/display.webp`,
      `moments/${moment.id}/photos/${photo.id}/thumbnail.webp`,
    ]),
    invalidationPaths: managedPhotos.length > 0 ? [`/moments/${moment.id}/*`] : [],
  };
}

export async function deleteMomentRemoteAssets(moment: Moment): Promise<void> {
  const plan = buildMomentRemoteDeletionPlan(moment);
  if (plan.originalKeys.length === 0) return;
  const config = getDeletionConfig();
  const s3 = getS3Client(config.region);

  await Promise.all([
    deleteObjects(s3, config.originalsBucket, plan.originalKeys),
    deleteObjects(s3, config.webBucket, plan.webKeys),
  ]);

  const cloudFront = getCloudFrontClient();
  const response = await cloudFront.send(new CreateInvalidationCommand({
    DistributionId: config.distributionId,
    InvalidationBatch: {
      CallerReference: randomUUID(),
      Paths: {
        Quantity: plan.invalidationPaths.length,
        Items: plan.invalidationPaths,
      },
    },
  }));
  const invalidationId = response.Invalidation?.Id;
  if (!invalidationId) throw new Error("CloudFront did not return an invalidation ID.");
  await waitUntilInvalidationCompleted(
    { client: cloudFront, maxWaitTime: 180 },
    { DistributionId: config.distributionId, Id: invalidationId },
  );
}

async function deleteObjects(client: S3Client, bucket: string, keys: string[]) {
  const response = await client.send(new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: { Quiet: true, Objects: keys.map((Key) => ({ Key })) },
  }));
  if (response.Errors?.length) {
    throw new Error(`S3 failed to delete ${response.Errors.length} object(s).`);
  }
}

function getDeletionConfig() {
  const region = process.env.AWS_REGION;
  const originalsBucket = process.env.AWS_ORIGINALS_BUCKET;
  const webBucket = process.env.AWS_WEB_BUCKET;
  const distributionId = process.env.AWS_CLOUDFRONT_DISTRIBUTION_ID;
  if (!region || !originalsBucket || !webBucket || !distributionId) {
    throw new Error("Remote deletion AWS configuration is incomplete.");
  }
  return { region, originalsBucket, webBucket, distributionId };
}

function getS3Client(region: string) {
  s3Client ??= new S3Client({ region });
  return s3Client;
}

function getCloudFrontClient() {
  cloudFrontClient ??= new CloudFrontClient({ region: "us-east-1" });
  return cloudFrontClient;
}
