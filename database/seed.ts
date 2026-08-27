import { eq } from "drizzle-orm";
import type { Database } from "@/database/client";
import { getDb } from "@/database/client";
import { moments, photos } from "@/database/schema";
import { developmentSeedMoments } from "@/database/seed-data";

export async function seedDevelopmentData(
  db: Database = getDb(),
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const seedMoment of developmentSeedMoments) {
    const existing = await db
      .select({ id: moments.id })
      .from(moments)
      .where(eq(moments.id, seedMoment.id))
      .limit(1);
    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    const { photos: seedPhotos, ...moment } = seedMoment;
    await db.transaction(async (transaction) => {
      await transaction.insert(moments).values(moment);
      if (seedPhotos.length > 0) {
        await transaction.insert(photos).values(seedPhotos);
      }
    });
    created += 1;
  }

  return { created, skipped };
}
