import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/database/client";
import { getDb } from "@/database/client";
import { toMySqlDateTime } from "@/database/datetime";
import { photos } from "@/database/schema";
import { getProcessingResult, type ProcessingResult } from "@/lib/aws/processing-result";
import type { PhotoStatus } from "@/lib/types";

export type ReconciliationOutcome = {
  photoId: string;
  status: PhotoStatus;
  error?: string;
};

export async function reconcileMomentProcessingResults(
  momentId: string,
  db: Database = getDb(),
): Promise<ReconciliationOutcome[]> {
  const candidates = await db
    .select()
    .from(photos)
    .where(and(
      eq(photos.momentId, momentId),
      inArray(photos.status, ["pending", "processing", "failed"]),
    ));
  const outcomes: ReconciliationOutcome[] = [];
  await runWithConcurrency(candidates, 5, async (photo) => {
    try {
      const result = await getProcessingResult(photo.id);
      if (!result) {
        outcomes.push({ photoId: photo.id, status: photo.status });
        return;
      }
      const outcome = await applyProcessingResult(photo, result, db);
      outcomes.push(outcome);
    } catch (error) {
      console.error("Photo result reconciliation failed", { photoId: photo.id, error });
      outcomes.push({
        photoId: photo.id,
        status: photo.status,
        error: "Processing status could not be refreshed.",
      });
    }
  });
  return outcomes;
}

export async function applyProcessingResult(
  photo: typeof photos.$inferSelect,
  result: ProcessingResult,
  db: Database,
): Promise<ReconciliationOutcome> {
  if (
    result.photoId !== photo.id ||
    result.momentId !== photo.momentId ||
    result.sourceKey !== photo.originalKey ||
    result.checksumSha256 !== photo.checksum
  ) {
    throw new Error("Processing result does not match the current source.");
  }
  const processedAt = toMySqlDateTime(new Date(result.processedAt));
  if (result.status === "ready") {
    if (
      result.webKey !== photo.webKey ||
      result.thumbnailKey !== photo.thumbnailKey ||
      !result.width ||
      !result.height
    ) {
      throw new Error("Processing result contains unexpected derivative metadata.");
    }
    await db
      .update(photos)
      .set({
        status: "ready",
        width: result.width,
        height: result.height,
        processedAt,
        processingError: null,
      })
      .where(and(
        eq(photos.id, photo.id),
        eq(photos.momentId, photo.momentId),
        eq(photos.originalKey, photo.originalKey),
        eq(photos.checksum, photo.checksum ?? ""),
      ));
    return { photoId: photo.id, status: "ready" };
  }
  const message = `${result.errorCode}: ${result.errorMessage}`.slice(0, 10_000);
  await db
    .update(photos)
    .set({ status: "failed", processingError: message, processedAt })
    .where(and(
      eq(photos.id, photo.id),
      eq(photos.momentId, photo.momentId),
      eq(photos.originalKey, photo.originalKey),
      eq(photos.checksum, photo.checksum ?? ""),
    ));
  return { photoId: photo.id, status: "failed", error: message };
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  }));
}
