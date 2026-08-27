import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { and, count, eq, gt, lt } from "drizzle-orm";
import type { Database } from "@/database/client";
import { getDb } from "@/database/client";
import { toMySqlDateTime } from "@/database/datetime";
import { adminSessions, adminUsers } from "@/database/schema";
import { parseNewPassword, parseUsername } from "@/lib/admin-validation";

export const SESSION_COOKIE_NAME = "our_pictures_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

const argonOptions: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
};

export type AdminIdentity = {
  id: string;
  username: string;
};

export type NewSession = {
  token: string;
  expiresAt: Date;
  admin: AdminIdentity;
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(parseNewPassword(password), argonOptions);
}

export async function createAdminUser(
  rawUsername: string,
  rawPassword: string,
  db: Database = getDb(),
): Promise<AdminIdentity> {
  const username = parseUsername(rawUsername);
  const passwordHash = await hashPassword(rawPassword);

  return db.transaction(async (transaction) => {
    const existing = await transaction
      .select({ total: count() })
      .from(adminUsers);
    if ((existing[0]?.total ?? 0) >= 2) {
      throw new Error("This application is limited to two admin accounts.");
    }

    const id = randomUUID();
    await transaction.insert(adminUsers).values({ id, username, passwordHash });
    return { id, username };
  });
}

export async function authenticatePassword(
  rawUsername: string,
  password: string,
  db: Database = getDb(),
): Promise<AdminIdentity | null> {
  let username: string;
  try {
    username = parseUsername(rawUsername);
  } catch {
    return null;
  }

  const rows = await db
    .select({
      id: adminUsers.id,
      username: adminUsers.username,
      passwordHash: adminUsers.passwordHash,
    })
    .from(adminUsers)
    .where(eq(adminUsers.username, username))
    .limit(1);
  const user = rows[0];
  if (!user) {
    await argon2.hash(password || "invalid-password", argonOptions);
    return null;
  }

  try {
    const valid = await argon2.verify(user.passwordHash, password);
    return valid ? { id: user.id, username: user.username } : null;
  } catch {
    return null;
  }
}

export async function createSession(
  admin: AdminIdentity,
  db: Database = getDb(),
  now = new Date(),
): Promise<NewSession> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000);
  await db.insert(adminSessions).values({
    id: randomUUID(),
    userId: admin.id,
    tokenHash: hashSessionToken(token),
    expiresAt: toMySqlDateTime(expiresAt),
  });
  return { token, expiresAt, admin };
}

export async function getAdminForSessionToken(
  token: string | null | undefined,
  db: Database = getDb(),
  now = new Date(),
): Promise<AdminIdentity | null> {
  if (!token || token.length > 128) return null;
  const rows = await db
    .select({ id: adminUsers.id, username: adminUsers.username })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(
      and(
        eq(adminSessions.tokenHash, hashSessionToken(token)),
        gt(adminSessions.expiresAt, toMySqlDateTime(now)),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function revokeSessionToken(
  token: string | null | undefined,
  db: Database = getDb(),
): Promise<void> {
  if (!token || token.length > 128) return;
  await db
    .delete(adminSessions)
    .where(eq(adminSessions.tokenHash, hashSessionToken(token)));
}

export async function deleteExpiredSessions(
  db: Database = getDb(),
  now = new Date(),
): Promise<void> {
  await db
    .delete(adminSessions)
    .where(lt(adminSessions.expiresAt, toMySqlDateTime(now)));
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(expiresAt: Date) {
  const secure =
    process.env.SESSION_COOKIE_SECURE === "false"
      ? false
      : process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
