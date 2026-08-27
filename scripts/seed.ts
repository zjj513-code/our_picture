import { getDatabaseClient } from "@/database/client";
import { seedDevelopmentData } from "@/database/seed";

const client = getDatabaseClient();

try {
  const result = await seedDevelopmentData(client.db);
  console.log(
    `Development seed complete: ${result.created} created, ${result.skipped} already present.`,
  );
} finally {
  await client.pool.end();
}
