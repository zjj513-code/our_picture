import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/database/client";
import { getDb } from "@/database/client";
import { toMySqlDateTime } from "@/database/datetime";
import { moments, photos } from "@/database/schema";
import type { Moment, MomentStatus, Photo } from "@/lib/types";

export type MomentInput = {
  date: string;
  title: string | null;
  location: string | null;
  caption: string | null;
};

export type AdminMomentSummary = {
  id: string;
  date: string;
  title: string | null;
  location: string | null;
  status: MomentStatus;
  photoCount: number;
  updatedAt: string;
};

export class PhotoOrderError extends Error {}

export async function getPublishedMoments(
  db: Database = getDb(),
): Promise<Moment[]> {
  const rows = await db
    .select()
    .from(moments)
    .where(eq(moments.status, "published"))
    .orderBy(desc(moments.date), desc(moments.createdAt));

  return attachPhotos(rows, db);
}

export async function listAdminMoments(
  db: Database = getDb(),
): Promise<AdminMomentSummary[]> {
  const rows = await db
    .select({
      id: moments.id,
      date: moments.date,
      title: moments.title,
      location: moments.location,
      status: moments.status,
      photoCount: count(photos.id),
      updatedAt: moments.updatedAt,
    })
    .from(moments)
    .leftJoin(photos, eq(photos.momentId, moments.id))
    .groupBy(moments.id)
    .orderBy(desc(moments.date), desc(moments.createdAt));

  return rows;
}

export async function getMomentById(
  id: string,
  db: Database = getDb(),
): Promise<Moment | null> {
  const rows = await db
    .select()
    .from(moments)
    .where(eq(moments.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  return (await attachPhotos(rows, db))[0] ?? null;
}

export async function createMoment(
  input: MomentInput,
  db: Database = getDb(),
): Promise<string> {
  const id = randomUUID();
  await db.insert(moments).values({ id, ...input });
  return id;
}

export async function updateMoment(
  id: string,
  input: MomentInput,
  db: Database = getDb(),
): Promise<boolean> {
  const result = await db
    .update(moments)
    .set({ ...input, updatedAt: toMySqlDateTime(new Date()) })
    .where(eq(moments.id, id));
  return result[0].affectedRows > 0;
}

export async function setMomentStatus(
  id: string,
  status: MomentStatus,
  db: Database = getDb(),
): Promise<boolean> {
  const now = toMySqlDateTime(new Date());
  const result = await db
    .update(moments)
    .set({
      status,
      publishedAt: status === "published" ? now : null,
      updatedAt: now,
    })
    .where(eq(moments.id, id));
  return result[0].affectedRows > 0;
}

export async function deleteMoment(
  id: string,
  db: Database = getDb(),
): Promise<boolean> {
  const result = await db.delete(moments).where(eq(moments.id, id));
  return result[0].affectedRows > 0;
}

export async function reorderPhotos(
  momentId: string,
  orderedPhotoIds: string[],
  db: Database = getDb(),
): Promise<void> {
  await db.transaction(async (transaction) => {
    const existing = await transaction
      .select({ id: photos.id, sortOrder: photos.sortOrder })
      .from(photos)
      .where(eq(photos.momentId, momentId))
      .orderBy(asc(photos.sortOrder));
    const existingIds = existing.map(({ id }) => id);

    if (
      orderedPhotoIds.length !== existingIds.length ||
      new Set(orderedPhotoIds).size !== orderedPhotoIds.length ||
      orderedPhotoIds.some((id) => !existingIds.includes(id))
    ) {
      throw new PhotoOrderError(
        "Photo order must contain every photo exactly once.",
      );
    }
    const temporaryBase =
      Math.max(-1, ...existing.map(({ sortOrder }) => sortOrder)) + 1;

    for (const [index, photoId] of orderedPhotoIds.entries()) {
      await transaction
        .update(photos)
        .set({ sortOrder: temporaryBase + index })
        .where(and(eq(photos.id, photoId), eq(photos.momentId, momentId)));
    }

    for (const [index, photoId] of orderedPhotoIds.entries()) {
      await transaction
        .update(photos)
        .set({ sortOrder: index })
        .where(and(eq(photos.id, photoId), eq(photos.momentId, momentId)));
    }
  });
}

export async function removePhoto(
  momentId: string,
  photoId: string,
  db: Database = getDb(),
): Promise<boolean> {
  return db.transaction(async (transaction) => {
    const result = await transaction
      .delete(photos)
      .where(and(eq(photos.id, photoId), eq(photos.momentId, momentId)));
    if (result[0].affectedRows === 0) return false;

    const remaining = await transaction
      .select({ id: photos.id, sortOrder: photos.sortOrder })
      .from(photos)
      .where(eq(photos.momentId, momentId))
      .orderBy(asc(photos.sortOrder));
    const temporaryBase =
      Math.max(-1, ...remaining.map(({ sortOrder }) => sortOrder)) + 1;

    for (const [index, row] of remaining.entries()) {
      await transaction
        .update(photos)
        .set({ sortOrder: temporaryBase + index })
        .where(eq(photos.id, row.id));
    }
    for (const [index, row] of remaining.entries()) {
      await transaction
        .update(photos)
        .set({ sortOrder: index })
        .where(eq(photos.id, row.id));
    }
    return true;
  });
}

async function attachPhotos(
  momentRows: Array<typeof moments.$inferSelect>,
  db: Database,
): Promise<Moment[]> {
  if (momentRows.length === 0) return [];

  const photoRows = await db
    .select()
    .from(photos)
    .where(
      inArray(
        photos.momentId,
        momentRows.map(({ id }) => id),
      ),
    )
    .orderBy(asc(photos.momentId), asc(photos.sortOrder));
  const photosByMoment = new Map<string, Photo[]>();

  for (const row of photoRows) {
    const grouped = photosByMoment.get(row.momentId) ?? [];
    grouped.push(row);
    photosByMoment.set(row.momentId, grouped);
  }

  return momentRows.map((row) => ({
    ...row,
    photos: photosByMoment.get(row.id) ?? [],
  }));
}
