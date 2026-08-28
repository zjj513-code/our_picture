import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createDatabaseClient } from "@/database/client";
import {
  createMoment,
  deleteMoment,
  getMomentById,
  getPublishedMoments,
  MomentPublicationError,
  PhotoRemovalError,
  removePhoto,
  reorderPhotos,
  setMomentStatus,
  updateMoment,
} from "@/database/moments";
import {
  createPendingPhotoUploads,
  getPhotoUpload,
  markPhotoFailed,
  markPhotoProcessing,
  resetPhotoUpload,
} from "@/database/photo-uploads";
import { applyProcessingResult } from "@/database/photo-processing";
import { seedDevelopmentData } from "@/database/seed";
import { developmentSeedMoments } from "@/database/seed-data";
import { adminSessions, adminUsers, moments, photos } from "@/database/schema";
import {
  authenticatePassword,
  createAdminUser,
  createSession,
  getAdminForSessionToken,
} from "@/lib/auth";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required.");
const parsedDatabaseUrl = new URL(testDatabaseUrl);
if (!parsedDatabaseUrl.pathname.endsWith("_test")) {
  throw new Error("Refusing to run integration tests outside a *_test database.");
}

const client = createDatabaseClient(testDatabaseUrl);
let server: ChildProcess | null = null;
let serverOutput = "";

try {
  await migrate(client.db, { migrationsFolder: "database/migrations" });
  await resetTestData();
  await seedDevelopmentData(client.db);

  await verifyPublishedQueries();
  const password = "correct horse battery staple";
  const admin = await verifyAuthentication(password);
  await verifyRepositoryCrud();
  await verifyHttpFlows(admin.username, password);

  console.log("✓ Phase 3C database, authentication, upload-state, reconciliation, admin, and public checks passed.");
} finally {
  stopServer();
  await client.pool.end();
}

function stopServer() {
  if (server && !server.killed) server.kill("SIGTERM");
}

async function resetTestData() {
  await client.db.delete(adminSessions);
  await client.db.delete(photos);
  await client.db.delete(moments);
  await client.db.delete(adminUsers);
}

async function verifyPublishedQueries() {
  await client.db.insert(moments).values({
    id: "private-draft",
    date: "2027-01-02",
    title: "PRIVATE DRAFT SHOULD NOT RENDER",
    status: "draft",
  });
  await client.db.insert(moments).values({
    id: "published-with-pending-only",
    date: "2027-01-03",
    title: "PENDING SHOULD NOT RENDER",
    status: "published",
  });
  await client.db.insert(photos).values({
    id: "pending-public-photo",
    momentId: "published-with-pending-only",
    originalKey: "originals/moments/published-with-pending-only/photos/pending-public-photo/source.jpg",
    webKey: "moments/published-with-pending-only/photos/pending-public-photo/display.webp",
    thumbnailKey: "moments/published-with-pending-only/photos/pending-public-photo/thumbnail.webp",
    status: "pending",
    sortOrder: 0,
  });

  const published = await getPublishedMoments(client.db);
  assert.deepEqual(
    published.map(({ id }) => id),
    ["2026-08-27", "2026-07-13", "2025-12-17"],
    "published Moments must be date-descending and drafts must be excluded",
  );
  for (const moment of published) {
    assert.deepEqual(
      moment.photos.map(({ sortOrder }) => sortOrder),
      [...moment.photos.map(({ sortOrder }) => sortOrder)].sort((a, b) => a - b),
      "photos must be ordered by sortOrder",
    );
  }
  assert.equal(published.some(({ id }) => id === "published-with-pending-only"), false);
}

async function verifyAuthentication(password: string) {
  const admin = await createAdminUser("test-admin", password, client.db);
  assert.equal((await authenticatePassword("test-admin", password, client.db))?.id, admin.id);
  assert.equal(await authenticatePassword("test-admin", "wrong password", client.db), null);
  assert.equal(await authenticatePassword("missing-user", password, client.db), null);

  const session = await createSession(admin, client.db);
  const stored = await client.db
    .select({ tokenHash: adminSessions.tokenHash })
    .from(adminSessions)
    .where(eq(adminSessions.userId, admin.id));
  assert.equal(stored.length, 1);
  assert.notEqual(stored[0].tokenHash, session.token);
  assert.equal(stored[0].tokenHash.length, 64);
  assert.equal((await getAdminForSessionToken(session.token, client.db))?.id, admin.id);
  assert.equal(
    await getAdminForSessionToken(
      session.token,
      client.db,
      new Date(session.expiresAt.getTime() + 1_000),
    ),
    null,
  );
  await client.db.delete(adminSessions);
  return admin;
}

async function verifyRepositoryCrud() {
  const id = await createMoment(
    { date: "2026-01-15", title: null, location: null, caption: null },
    client.db,
  );
  assert.equal((await getMomentById(id, client.db))?.status, "draft");
  assert.equal((await getMomentById(id, client.db))?.photos.length, 0);

  assert.equal(
    await updateMoment(
      id,
      { date: "2026-01-16", title: "Edited", location: "Tokyo", caption: "Caption" },
      client.db,
    ),
    true,
  );
  await assert.rejects(
    setMomentStatus(id, "published", client.db),
    MomentPublicationError,
  );

  const photoIds = ["crud-photo-a", "crud-photo-b", "crud-photo-c"];
  await client.db.insert(photos).values(
    photoIds.map((photoId, sortOrder) => ({
      id: photoId,
      momentId: id,
      originalKey: `original/sample/${photoId}.jpg`,
      webKey: `/photos/sample-0${sortOrder + 1}.jpg`,
      thumbnailKey: `/photos/sample-0${sortOrder + 1}-768.jpg`,
      width: 1536,
      height: 1023,
      sortOrder,
    })),
  );
  assert.equal(await setMomentStatus(id, "published", client.db), true);
  assert.equal((await getMomentById(id, client.db))?.status, "published");
  await reorderPhotos(id, [photoIds[2], photoIds[0], photoIds[1]], client.db);
  assert.deepEqual(
    (await getMomentById(id, client.db))?.photos.map(({ id: photoId }) => photoId),
    [photoIds[2], photoIds[0], photoIds[1]],
  );
  assert.equal(await removePhoto(id, photoIds[0], client.db), true);
  assert.deepEqual(
    (await getMomentById(id, client.db))?.photos.map(({ sortOrder }) => sortOrder),
    [0, 1],
  );
  assert.equal(await removePhoto(id, photoIds[2], client.db), true);
  await assert.rejects(
    removePhoto(id, photoIds[1], client.db),
    PhotoRemovalError,
  );
  assert.equal(await deleteMoment(id, client.db), true);
  assert.equal(await getMomentById(id, client.db), null);
  assert.equal(
    (
      await client.db.select().from(photos).where(inArray(photos.id, photoIds))
    ).length,
    0,
    "Moment deletion must cascade to Photo records",
  );

  const uploadMomentId = await createMoment(
    { date: "2026-02-17", title: "Upload state", location: null, caption: null },
    client.db,
  );
  const pending = await createPendingPhotoUploads(uploadMomentId, [{
    clientId: "test-upload",
    filename: "scan 01.tif",
    contentType: "image/tiff",
    byteSize: 1234,
    checksum: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    extension: "tif",
  }], client.db);
  assert.equal(pending?.length, 1);
  assert.match(pending?.[0].originalKey ?? "", /^originals\/moments\/.+\/source\.tif$/);
  const uploadPhotoId = pending?.[0].photoId;
  assert.ok(uploadPhotoId);
  assert.equal((await getPhotoUpload(uploadMomentId, uploadPhotoId, client.db))?.status, "pending");
  assert.equal(await markPhotoProcessing(uploadMomentId, uploadPhotoId, client.db), true);
  assert.equal((await getPhotoUpload(uploadMomentId, uploadPhotoId, client.db))?.status, "processing");
  await markPhotoFailed(uploadMomentId, uploadPhotoId, "processor failed", client.db);
  assert.equal(await resetPhotoUpload(uploadMomentId, uploadPhotoId, client.db), true);
  assert.equal((await getPhotoUpload(uploadMomentId, uploadPhotoId, client.db))?.status, "pending");
  const pendingPhoto = await getPhotoUpload(uploadMomentId, uploadPhotoId, client.db);
  assert.ok(pendingPhoto);
  await applyProcessingResult(pendingPhoto, {
    schemaVersion: 1,
    momentId: uploadMomentId,
    photoId: uploadPhotoId,
    sourceKey: pendingPhoto.originalKey,
    sourceVersionId: null,
    sourceEtag: "test-etag",
    checksumSha256: pendingPhoto.checksum!,
    sequencer: "001",
    processedAt: new Date().toISOString(),
    status: "ready",
    webKey: pendingPhoto.webKey,
    thumbnailKey: pendingPhoto.thumbnailKey!,
    width: 1536,
    height: 1024,
    thumbnailWidth: 768,
    thumbnailHeight: 512,
  }, client.db);
  assert.deepEqual(
    (({ status, width, height }) => ({ status, width, height }))(
      (await getPhotoUpload(uploadMomentId, uploadPhotoId, client.db))!,
    ),
    { status: "ready", width: 1536, height: 1024 },
  );
  await deleteMoment(uploadMomentId, client.db);
}

async function verifyHttpFlows(username: string, password: string) {
  const port = 3127;
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      SITE_URL: origin,
      SESSION_COOKIE_SECURE: "false",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (chunk) => (serverOutput += chunk.toString()));
  server.stderr?.on("data", (chunk) => (serverOutput += chunk.toString()));
  await waitForServer(`${origin}/`);

  const publicResponse = await fetch(`${origin}/`);
  assert.equal(publicResponse.status, 200);
  const publicHtml = await publicResponse.text();
  assert.match(publicHtml, /<title>Our Pictures<\/title>/i);
  assert.match(publicHtml, /id="2026-08-27"/);
  assert.match(publicHtml, /id="2025-12-17"/);
  assert.match(publicHtml, /aria-label="Photography timeline"/);
  assert.match(publicHtml, /sample-01\.jpg/);
  assert.doesNotMatch(publicHtml, /PRIVATE DRAFT SHOULD NOT RENDER/);
  assert.doesNotMatch(publicHtml, /fonts\.googleapis|googleusercontent|unpkg|jsdelivr/i);
  assert.ok(publicHtml.indexOf("2026-08-27") < publicHtml.indexOf("2026-07-13"));

  const protectedResponse = await fetch(`${origin}/admin`, { redirect: "manual" });
  assert.equal(protectedResponse.status, 307);
  assert.equal(protectedResponse.headers.get("location"), "/admin/login");

  const failedLogin = await postForm(`${origin}/admin/auth/login`, origin, {
    username,
    password: "wrong password",
  });
  assert.equal(failedLogin.status, 303);
  assert.match(failedLogin.headers.get("location") ?? "", /error=Invalid/);
  assert.equal(failedLogin.headers.get("set-cookie"), null);

  const successfulLogin = await postForm(`${origin}/admin/auth/login`, origin, {
    username,
    password,
  });
  assert.equal(successfulLogin.status, 303);
  const cookie = (successfulLogin.headers.get("set-cookie") ?? "").split(";", 1)[0];
  assert.match(cookie, /^our_pictures_session=/);
  assert.match(successfulLogin.headers.get("set-cookie") ?? "", /HttpOnly/i);
  assert.match(successfulLogin.headers.get("set-cookie") ?? "", /SameSite=lax/i);

  const adminResponse = await fetch(`${origin}/admin`, { headers: { cookie } });
  assert.equal(adminResponse.status, 200);
  assert.match(await adminResponse.text(), /test-admin/);

  const created = await postForm(
    `${origin}/admin/moments`,
    origin,
    { date: "2026-04-05", title: "HTTP Moment", location: "Tokyo", caption: "Created in test" },
    cookie,
  );
  assert.equal(created.status, 303);
  const createdLocation = created.headers.get("location") ?? "";
  const createdId = /\/admin\/moments\/([^?]+)/.exec(createdLocation)?.[1];
  assert.ok(createdId);
  assert.equal((await getMomentById(createdId, client.db))?.status, "draft");

  const blockedPublish = await postForm(
    `${origin}/admin/moments/${createdId}/status`,
    origin,
    { status: "published" },
    cookie,
  );
  assert.equal(blockedPublish.status, 303);
  assert.match(blockedPublish.headers.get("location") ?? "", /error=/);
  assert.equal((await getMomentById(createdId, client.db))?.status, "draft");

  const invalidUpload = await fetch(`${origin}/admin/moments/${createdId}/uploads`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ files: [] }),
  });
  assert.equal(invalidUpload.status, 400);

  const crossOriginUpload = await fetch(`${origin}/admin/moments/${createdId}/uploads`, {
    method: "POST",
    headers: { cookie, origin: "https://attacker.example", "content-type": "application/json" },
    body: JSON.stringify({ files: [] }),
    redirect: "manual",
  });
  assert.equal(crossOriginUpload.status, 403);

  const reconciled = await fetch(`${origin}/admin/moments/${createdId}/photos/reconcile`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(reconciled.status, 200);
  assert.deepEqual(await reconciled.json(), { photos: [] });

  const httpPhotoIds = ["http-photo-a", "http-photo-b", "http-photo-c"];
  await client.db.insert(photos).values(
    httpPhotoIds.map((photoId, sortOrder) => ({
      id: photoId,
      momentId: createdId,
      originalKey: `original/sample/${photoId}.jpg`,
      webKey: `/photos/sample-0${sortOrder + 1}.jpg`,
      thumbnailKey: `/photos/sample-0${sortOrder + 1}-768.jpg`,
      width: 1536,
      height: 1023,
      sortOrder,
    })),
  );

  const reordered = await postForm(
    `${origin}/admin/moments/${createdId}/photos/reorder`,
    origin,
    { order: JSON.stringify([httpPhotoIds[2], httpPhotoIds[0], httpPhotoIds[1]]) },
    cookie,
  );
  assert.equal(reordered.status, 303);
  assert.deepEqual(
    (await getMomentById(createdId, client.db))?.photos.map(({ id }) => id),
    [httpPhotoIds[2], httpPhotoIds[0], httpPhotoIds[1]],
  );

  await access("public/photos/sample-01.jpg");
  const removed = await postForm(
    `${origin}/admin/moments/${createdId}/photos/${httpPhotoIds[0]}/remove`,
    origin,
    { confirm: "yes" },
    cookie,
  );
  assert.equal(removed.status, 303);
  await access("public/photos/sample-01.jpg");

  const published = await postForm(
    `${origin}/admin/moments/${createdId}/status`,
    origin,
    { status: "published" },
    cookie,
  );
  assert.equal(published.status, 303);
  assert.equal((await getMomentById(createdId, client.db))?.status, "published");

  const preview = await fetch(`${origin}/admin/moments/${createdId}/preview`, {
    headers: { cookie },
  });
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Private preview/);

  const deleted = await postForm(
    `${origin}/admin/moments/${createdId}/delete`,
    origin,
    { confirm: "yes" },
    cookie,
  );
  assert.equal(deleted.status, 303);
  assert.equal(await getMomentById(createdId, client.db), null);

  await client.db
    .update(moments)
    .set({ status: "draft", publishedAt: null })
    .where(eq(moments.status, "published"));
  const emptyHome = await fetch(`${origin}/`);
  assert.match(await emptyHome.text(), /No moments have been published yet\./);
  await client.db
    .update(moments)
    .set({ status: "published" })
    .where(
      inArray(
        moments.id,
        developmentSeedMoments.map(({ id }) => id),
      ),
    );
}

async function postForm(
  url: string,
  origin: string,
  values: Record<string, string>,
  cookie?: string,
) {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  const headers: Record<string, string> = { origin };
  if (cookie) headers.cookie = cookie;
  return fetch(url, { method: "POST", body, headers, redirect: "manual" });
}

async function waitForServer(url: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(200);
  }
  throw new Error(`Next.js test server did not start.\n${serverOutput}`);
}
