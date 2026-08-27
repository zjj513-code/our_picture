import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import * as schema from "@/database/schema";

export type Database = MySql2Database<typeof schema>;

type DatabaseClient = {
  db: Database;
  pool: Pool;
};

const globalDatabase = globalThis as typeof globalThis & {
  ourPicturesDatabase?: DatabaseClient;
};

export function createDatabaseClient(databaseUrl: string): DatabaseClient {
  if (!databaseUrl.startsWith("mysql://")) {
    throw new Error("DATABASE_URL must be a mysql:// URL.");
  }

  const pool = createPool({
    uri: databaseUrl,
    waitForConnections: true,
    connectionLimit: 8,
    maxIdle: 4,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    timezone: "Z",
    dateStrings: true,
  });

  return {
    pool,
    db: drizzle(pool, { schema, mode: "default" }),
  };
}

export function getDatabaseClient(): DatabaseClient {
  if (globalDatabase.ourPicturesDatabase) {
    return globalDatabase.ourPicturesDatabase;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Copy .env.example to .env.local and configure MySQL.",
    );
  }

  const client = createDatabaseClient(databaseUrl);
  if (process.env.NODE_ENV !== "production") {
    globalDatabase.ourPicturesDatabase = client;
  }
  return client;
}

export function getDb(): Database {
  return getDatabaseClient().db;
}
