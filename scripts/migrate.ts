import { migrate } from "drizzle-orm/mysql2/migrator";
import { getDatabaseClient } from "@/database/client";

const client = getDatabaseClient();

try {
  await migrate(client.db, { migrationsFolder: "database/migrations" });
  console.log("Database migrations are up to date.");
} finally {
  await client.pool.end();
}
