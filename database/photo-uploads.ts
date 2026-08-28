import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/database/client";
import { getDb } from "@/database/client";
import { moments, photos } from "@/database/schema";
import type { UploadFileRequest } from "@/lib/upload-validation";

export type PendingPhotoUpload = UploadFileRequest & {
  photoId: string;
  originalKey: string;
  webKey: string;
  thumbnailKey: string;
};

export async function createPendingPhotoUploads(
  momentId: string,
  files: UploadFileRequest[],
  db: Database = getDb(),
): Promise<PendingPhotoUpload[] | null> {
  return db.transaction(async (transaction) => {
    const parent = await transaction
      .select({ id: moments.id })
      .from(moments)
      .where(eq(moments.id, momentId))
      .limit(1)
      .for("update");
    if (parent.length === 0) return null;

    const existing = await transaction
      .select({ sortOrder: photos.sortOrder })
      .from(photos)
      .where(eq(photos.momentId, momentId))
      .orderBy(asc(photos.sortOrder));
    const firstSortOrder = (existing.at(-1)?.sortOrder ?? -1) + 1;
    const pending = files.map((file): PendingPhotoUpload => {
      const photoId = randomUUID();
      const prefix = `moments/${momentId}/photos/${photoId}`;
      return {
        ...file,
        photoId,
        originalKey: `originals/${prefix}/source.${file.extension}`,
        webKey: `${prefix}/display.webp`,
        thumbnailKey: `${prefix}/thumbnail.webp`,
      };
    });

    await transaction.insert(photos).values(
      pending.map((file, index) => ({
        id: file.photoId,
        momentId,
        originalKey: file.originalKey,
        webKey: file.webKey,
        thumbnailKey: file.thumbnailKey,
        originalFilename: file.filename,
        originalContentType: file.contentType,
        originalByteSize: file.byteSize,
        checksum: file.checksum,
        status: "pending" as const,
        sortOrder: firstSortOrder + index,
      })),
    );
    return pending;
  });
}

export async function getPhotoUpload(
  momentId: string,
  photoId: string,
  db: Database = getDb(),
) {
  const rows = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.momentId, momentId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function resetPhotoUpload(
  momentId: string,
  photoId: string,
  db: Database = getDb(),
): Promise<boolean> {
  const result = await db
    .update(photos)
    .set({ status: "pending", processingError: null })
    .where(
      and(
        eq(photos.id, photoId),
        eq(photos.momentId, momentId),
        eq(photos.status, "failed"),
      ),
    );
  return result[0].affectedRows > 0;
}

export async function markPhotoProcessing(
  momentId: string,
  photoId: string,
  db: Database = getDb(),
): Promise<boolean> {
  const result = await db
    .update(photos)
    .set({ status: "processing", processingError: null })
    .where(
      and(
        eq(photos.id, photoId),
        eq(photos.momentId, momentId),
        eq(photos.status, "pending"),
      ),
    );
  return result[0].affectedRows > 0;
}

export async function markPhotoFailed(
  momentId: string,
  photoId: string,
  message: string,
  db: Database = getDb(),
): Promise<void> {
  await db
    .update(photos)
    .set({ status: "failed", processingError: message.slice(0, 10_000) })
    .where(and(eq(photos.id, photoId), eq(photos.momentId, momentId)));
}
