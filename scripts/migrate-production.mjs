import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("mysql://")) {
  throw new Error("DATABASE_URL must be a mysql:// URL.");
}

const migrationsDirectory = new URL("../database/migrations/", import.meta.url);
const journal = JSON.parse(
  await readFile(new URL("meta/_journal.json", migrationsDirectory), "utf8"),
);
const availableFiles = new Set(await readdir(migrationsDirectory));
const connection = await mysql.createConnection(databaseUrl);

try {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
      \`id\` SERIAL PRIMARY KEY,
      \`hash\` TEXT NOT NULL,
      \`created_at\` BIGINT
    )
  `);
  const [rows] = await connection.execute(
    "SELECT created_at FROM `__drizzle_migrations` ORDER BY created_at DESC LIMIT 1",
  );
  const lastAppliedAt = Number(rows[0]?.created_at ?? 0);

  for (const entry of journal.entries) {
    const filename = `${entry.tag}.sql`;
    if (!availableFiles.has(filename)) {
      throw new Error(`Migration file is missing: ${filename}`);
    }
    if (lastAppliedAt >= Number(entry.when)) continue;

    const sql = await readFile(new URL(filename, migrationsDirectory), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    await connection.beginTransaction();
    try {
      for (const statement of statements) await connection.query(statement);
      await connection.execute(
        "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
        [createHash("sha256").update(sql).digest("hex"), entry.when],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  console.log("Production database migrations are up to date.");
} finally {
  await connection.end();
}
