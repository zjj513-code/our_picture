import {
  char,
  date,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const moments = mysqlTable(
  "moments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    title: varchar("title", { length: 160 }),
    location: varchar("location", { length: 160 }),
    caption: text("caption"),
    status: mysqlEnum("status", ["draft", "published"])
      .notNull()
      .default("draft"),
    publishedAt: timestamp("published_at", { mode: "string" }),
    createdAt: timestamp("created_at", { mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_moments_status_date").on(table.status, table.date)],
);

export const photos = mysqlTable(
  "photos",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    momentId: varchar("moment_id", { length: 36 })
      .notNull()
      .references(() => moments.id, { onDelete: "cascade" }),
    originalKey: varchar("original_key", { length: 512 }).notNull(),
    webKey: varchar("web_key", { length: 512 }).notNull(),
    thumbnailKey: varchar("thumbnail_key", { length: 512 }),
    originalFilename: varchar("original_filename", { length: 255 }),
    originalContentType: varchar("original_content_type", { length: 100 }),
    originalByteSize: int("original_byte_size", { unsigned: true }),
    checksum: char("checksum", { length: 44 }),
    status: mysqlEnum("status", ["pending", "processing", "ready", "failed"])
      .notNull()
      .default("ready"),
    processingError: text("processing_error"),
    processedAt: datetime("processed_at", { mode: "string", fsp: 3 }),
    width: int("width", { unsigned: true }),
    height: int("height", { unsigned: true }),
    altText: varchar("alt_text", { length: 500 }),
    sortOrder: int("sort_order", { unsigned: true }).notNull(),
    createdAt: timestamp("created_at", { mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_photos_moment_sort_order").on(
      table.momentId,
      table.sortOrder,
    ),
    index("idx_photos_moment_status_sort").on(
      table.momentId,
      table.status,
      table.sortOrder,
    ),
  ],
);

export const adminUsers = mysqlTable(
  "admin_users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    username: varchar("username", { length: 64 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("uq_admin_users_username").on(table.username)],
);

export const adminSessions = mysqlTable(
  "admin_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    expiresAt: datetime("expires_at", { mode: "string", fsp: 3 }).notNull(),
    createdAt: timestamp("created_at", { mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_admin_sessions_token_hash").on(table.tokenHash),
    index("idx_admin_sessions_user_expires").on(table.userId, table.expiresAt),
  ],
);

export type MomentRecord = typeof moments.$inferSelect;
export type NewMomentRecord = typeof moments.$inferInsert;
export type PhotoRecord = typeof photos.$inferSelect;
export type NewPhotoRecord = typeof photos.$inferInsert;
export type AdminUserRecord = typeof adminUsers.$inferSelect;
export type NewAdminUserRecord = typeof adminUsers.$inferInsert;
export type AdminSessionRecord = typeof adminSessions.$inferSelect;
export type NewAdminSessionRecord = typeof adminSessions.$inferInsert;
