import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});
const cookieName = "our_pictures_session";
const sessionSeconds = 30 * 24 * 60 * 60;
const maxUploadBytes = 250 * 1024 * 1024;
const uploadTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/tiff", "tif"],
]);

export async function handler(event) {
  try {
    const method = event.requestContext?.http?.method ?? "GET";
    const path = (event.rawPath ?? "/").replace(/\/$/, "") || "/";
    if (event.source === "our-pictures-migration" && path === "/internal/refresh") {
      await writeSiteData();
      return json(200, { ok: true });
    }
    if (method === "GET" && path === "/api/health") return json(200, { status: "ok" });
    if (method === "POST" && path === "/api/auth/login") return await login(event);
    if (method === "POST" && path === "/api/auth/logout") return await logout(event);
    if (!validOrigin(event)) throw new HttpError(403, "请求来源无效。");

    const admin = await requireAdmin(event);
    if (method === "GET" && path === "/api/admin/moments") {
      return json(200, { admin, moments: await listMomentSummaries() });
    }
    if (method === "POST" && path === "/api/admin/moments") {
      const input = validateMomentInput(body(event));
      const now = new Date().toISOString();
      const id = randomUUID();
      await ddb.send(new PutCommand({ TableName: table(), Item: {
        pk: `MOMENT#${id}`, sk: "META", entity: "moment", id, ...input,
        status: "draft", publishedAt: null, createdAt: now, updatedAt: now,
      }}));
      return json(201, { id });
    }

    let match = path.match(/^\/api\/admin\/moments\/([A-Za-z0-9-]{1,36})$/);
    if (match) {
      const id = recordId(match[1]);
      if (method === "GET") {
        const moment = await getMoment(id);
        if (!moment) throw new HttpError(404, "找不到这条记录。");
        return json(200, moment);
      }
      if (method === "PUT") {
        const input = validateMomentInput(body(event));
        await updateMoment(id, input);
        await writeSiteData();
        return json(200, { ok: true });
      }
      if (method === "DELETE") {
        await deleteMoment(id);
        await writeSiteData();
        return json(200, { ok: true });
      }
    }

    match = path.match(/^\/api\/admin\/moments\/([A-Za-z0-9-]{1,36})\/status$/);
    if (method === "PUT" && match) {
      const id = recordId(match[1]);
      const status = body(event).status;
      if (status !== "draft" && status !== "published") throw new HttpError(400, "发布状态无效。");
      const moment = await getMoment(id);
      if (!moment) throw new HttpError(404, "找不到这条记录。");
      if (status === "published" && !moment.photos.some(({ status: value }) => value === "ready")) {
        throw new HttpError(409, "至少需要一张处理完成的照片才能发布记录。");
      }
      const now = new Date().toISOString();
      await ddb.send(new UpdateCommand({ TableName: table(), Key: momentKey(id),
        UpdateExpression: "SET #status = :status, publishedAt = :publishedAt, updatedAt = :now",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": status, ":publishedAt": status === "published" ? now : null, ":now": now },
      }));
      await writeSiteData();
      return json(200, { ok: true });
    }

    match = path.match(/^\/api\/admin\/moments\/([A-Za-z0-9-]{1,36})\/uploads$/);
    if (method === "POST" && match) return await initializeUploads(recordId(match[1]), body(event));

    match = path.match(/^\/api\/admin\/moments\/([A-Za-z0-9-]{1,36})\/uploads\/([A-Za-z0-9-]{1,36})\/(complete|retry)$/);
    if (method === "POST" && match) {
      const momentId = recordId(match[1]);
      const photoId = recordId(match[2]);
      return await (match[3] === "complete" ? completeUpload(momentId, photoId) : retryUpload(momentId, photoId));
    }

    match = path.match(/^\/api\/admin\/moments\/([A-Za-z0-9-]{1,36})\/photos\/reconcile$/);
    if (method === "POST" && match) {
      const outcomes = await reconcile(recordId(match[1]));
      await writeSiteData();
      return json(200, { photos: outcomes });
    }

    match = path.match(/^\/api\/admin\/moments\/([A-Za-z0-9-]{1,36})\/photos\/reorder$/);
    if (method === "PUT" && match) {
      await reorderPhotos(recordId(match[1]), body(event).order);
      await writeSiteData();
      return json(200, { ok: true });
    }

    match = path.match(/^\/api\/admin\/moments\/([A-Za-z0-9-]{1,36})\/photos\/([A-Za-z0-9-]{1,36})$/);
    if (method === "DELETE" && match) {
      await removePhoto(recordId(match[1]), recordId(match[2]));
      await writeSiteData();
      return json(200, { ok: true });
    }
    throw new HttpError(404, "找不到请求的接口。");
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message });
    console.error("API request failed", error);
    return json(500, { error: "服务暂时不可用。" });
  }
}

async function login(event) {
  if (!validOrigin(event)) throw new HttpError(403, "请求来源无效。");
  const { username, password } = body(event);
  if (typeof username !== "string" || typeof password !== "string" || username.length > 64 || password.length > 200) {
    throw new HttpError(401, "账号或密码错误。");
  }
  const normalized = username.trim();
  const { Item: admin } = await ddb.send(new GetCommand({ TableName: table(), Key: { pk: `ADMIN#${normalized}`, sk: "PROFILE" } }));
  const valid = admin?.passwordHash ? await argon2.verify(admin.passwordHash, password).catch(() => false) : false;
  if (!valid) {
    if (!admin) await argon2.hash(password || "invalid-password");
    throw new HttpError(401, "账号或密码错误。");
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hash(token);
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000);
  await ddb.send(new PutCommand({ TableName: table(), Item: {
    pk: `SESSION#${tokenHash}`, sk: "SESSION", entity: "session", id: randomUUID(),
    userId: admin.id, username: admin.username, expiresAt: expiresAt.toISOString(), ttl: Math.floor(expiresAt.getTime() / 1000),
  }}));
  return json(200, { admin: { id: admin.id, username: admin.username } }, {
    cookies: [`${cookieName}=${token}; Path=/; Max-Age=${sessionSeconds}; HttpOnly; Secure; SameSite=Lax`],
  });
}

async function logout(event) {
  if (!validOrigin(event)) throw new HttpError(403, "请求来源无效。");
  const token = requestCookies(event)[cookieName];
  if (token) await ddb.send(new DeleteCommand({ TableName: table(), Key: { pk: `SESSION#${hash(token)}`, sk: "SESSION" } }));
  return json(200, { ok: true }, { cookies: [`${cookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`] });
}

async function requireAdmin(event) {
  const token = requestCookies(event)[cookieName];
  if (!token || token.length > 128) throw new HttpError(401, "请先登录。");
  const { Item: session } = await ddb.send(new GetCommand({ TableName: table(), Key: { pk: `SESSION#${hash(token)}`, sk: "SESSION" } }));
  if (!session || Date.parse(session.expiresAt) <= Date.now()) throw new HttpError(401, "请先登录。");
  return { id: session.userId, username: session.username };
}

async function listMomentSummaries() {
  const metas = await scanEntity("moment");
  const rows = await Promise.all(metas.map(async (meta) => ({ ...meta, photoCount: (await photoItems(meta.id)).length })));
  return rows.sort(sortMoments).map(stripInternal);
}

async function getMoment(id) {
  const { Item: meta } = await ddb.send(new GetCommand({ TableName: table(), Key: momentKey(id) }));
  if (!meta) return null;
  return publicMoment(meta, await photoItems(id));
}

async function updateMoment(id, input) {
  const now = new Date().toISOString();
  const result = await ddb.send(new UpdateCommand({ TableName: table(), Key: momentKey(id),
    UpdateExpression: "SET #date = :date, title = :title, #location = :location, caption = :caption, updatedAt = :now",
    ConditionExpression: "attribute_exists(pk)",
    ExpressionAttributeNames: { "#date": "date", "#location": "location" },
    ExpressionAttributeValues: { ":date": input.date, ":title": input.title, ":location": input.location, ":caption": input.caption, ":now": now },
  })).catch((error) => { if (error.name === "ConditionalCheckFailedException") throw new HttpError(404, "找不到这条记录。"); throw error; });
  return result;
}

async function initializeUploads(momentId, payload) {
  if (!await getMoment(momentId)) throw new HttpError(404, "找不到这条记录。");
  const files = parseUploadBatch(payload);
  const current = await photoItems(momentId);
  let sortOrder = Math.max(-1, ...current.map(({ sortOrder: value }) => value)) + 1;
  const uploads = [];
  for (const file of files) {
    const photoId = randomUUID();
    const prefix = `moments/${momentId}/photos/${photoId}`;
    const photo = {
      pk: `MOMENT#${momentId}`, sk: `PHOTO#${photoId}`, entity: "photo", id: photoId, momentId,
      originalKey: `originals/${prefix}/source.${file.extension}`, webKey: `${prefix}/display.webp`, thumbnailKey: `${prefix}/thumbnail.webp`,
      originalFilename: file.filename, originalContentType: file.contentType, originalByteSize: file.byteSize, checksum: file.checksum,
      status: "pending", processingError: null, processedAt: null, width: null, height: null, altText: null,
      sortOrder: sortOrder++, createdAt: new Date().toISOString(),
    };
    await ddb.send(new PutCommand({ TableName: table(), Item: photo }));
    try {
      uploads.push({ clientId: file.clientId, photoId, upload: await signedUpload(photo) });
    } catch {
      await setPhotoStatus(photo, "failed", "无法创建 S3 上传地址。");
      uploads.push({ clientId: file.clientId, photoId, error: "无法创建 S3 上传地址。" });
    }
  }
  return json(201, { uploads });
}

async function completeUpload(momentId, photoId) {
  const photo = await photoItem(momentId, photoId);
  if (!photo) throw new HttpError(404, "找不到这张照片。");
  if (photo.status === "processing" || photo.status === "ready") return json(200, { photoId, status: photo.status });
  if (photo.status !== "pending") throw new HttpError(409, "请先重新上传失败的文件。");
  const object = await s3.send(new HeadObjectCommand({ Bucket: originalsBucket(), Key: photo.originalKey, ChecksumMode: "ENABLED" }));
  if (object.ContentLength !== photo.originalByteSize || object.ContentType?.toLowerCase() !== photo.originalContentType || object.ChecksumSHA256 !== photo.checksum) {
    await setPhotoStatus(photo, "failed", "S3 中的文件与所选文件不一致。");
    throw new HttpError(422, "S3 中的文件与所选文件不一致。");
  }
  await setPhotoStatus(photo, "processing", null);
  return json(200, { photoId, status: "processing" });
}

async function retryUpload(momentId, photoId) {
  const photo = await photoItem(momentId, photoId);
  if (!photo) throw new HttpError(404, "找不到这张照片。");
  if (photo.status === "processing" || photo.status === "ready") return json(200, { photoId, status: photo.status });
  await setPhotoStatus(photo, "pending", null);
  return json(200, { photoId, upload: await signedUpload(photo) });
}

async function reconcile(momentId) {
  const candidates = (await photoItems(momentId)).filter(({ status }) => status !== "ready");
  const outcomes = [];
  for (const photo of candidates) {
    const result = await processingResult(photo.id);
    if (!result) { outcomes.push({ photoId: photo.id, status: photo.status }); continue; }
    if (result.photoId !== photo.id || result.momentId !== momentId || result.sourceKey !== photo.originalKey || result.checksumSha256 !== photo.checksum) {
      outcomes.push({ photoId: photo.id, status: photo.status, error: "处理结果与原图不匹配。" }); continue;
    }
    if (result.status === "ready" && result.webKey === photo.webKey && result.thumbnailKey === photo.thumbnailKey) {
      await ddb.send(new UpdateCommand({ TableName: table(), Key: photoKey(momentId, photo.id),
        UpdateExpression: "SET #status = :ready, width = :width, height = :height, processedAt = :at, processingError = :none",
        ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":ready": "ready", ":width": result.width, ":height": result.height, ":at": result.processedAt, ":none": null },
      }));
      outcomes.push({ photoId: photo.id, status: "ready" });
    } else {
      const message = `${result.errorCode ?? "PROCESSING_FAILED"}: ${result.errorMessage ?? "图片处理失败。"}`.slice(0, 10000);
      await setPhotoStatus(photo, "failed", message);
      outcomes.push({ photoId: photo.id, status: "failed", error: message });
    }
  }
  return outcomes;
}

async function reorderPhotos(momentId, order) {
  if (!Array.isArray(order) || new Set(order).size !== order.length) throw new HttpError(400, "照片顺序无效。");
  const existing = await photoItems(momentId);
  if (order.length !== existing.length || order.some((id) => !existing.some((photo) => photo.id === id))) throw new HttpError(400, "照片顺序必须包含全部照片。");
  await Promise.all(order.map((id, sortOrder) => ddb.send(new UpdateCommand({ TableName: table(), Key: photoKey(momentId, id), UpdateExpression: "SET sortOrder = :value", ExpressionAttributeValues: { ":value": sortOrder } }))));
}

async function removePhoto(momentId, photoId) {
  const moment = await getMoment(momentId);
  if (!moment) throw new HttpError(404, "找不到这条记录。");
  const photo = moment.photos.find(({ id }) => id === photoId);
  if (!photo) throw new HttpError(404, "找不到这张照片。");
  if (moment.status === "published" && photo.status === "ready" && moment.photos.filter(({ status }) => status === "ready").length === 1) {
    throw new HttpError(409, "请先将记录转回草稿，再移除最后一张已就绪的照片。");
  }
  await deletePhotoObjects(photo);
  await ddb.send(new DeleteCommand({ TableName: table(), Key: photoKey(momentId, photoId) }));
  const remaining = (await photoItems(momentId)).sort((a, b) => a.sortOrder - b.sortOrder);
  await Promise.all(remaining.map((item, sortOrder) => ddb.send(new UpdateCommand({ TableName: table(), Key: photoKey(momentId, item.id), UpdateExpression: "SET sortOrder = :value", ExpressionAttributeValues: { ":value": sortOrder } }))));
}

async function deleteMoment(id) {
  const moment = await getMoment(id);
  if (!moment) throw new HttpError(404, "找不到这条记录。");
  if (moment.photos.some(({ status }) => status === "pending" || status === "processing")) throw new HttpError(409, "仍有照片正在上传或处理。");
  for (const photo of moment.photos) await deletePhotoObjects(photo);
  const keys = [momentKey(id), ...moment.photos.map(({ id: photoId }) => photoKey(id, photoId))];
  for (let offset = 0; offset < keys.length; offset += 25) {
    await ddb.send(new BatchWriteCommand({ RequestItems: { [table()]: keys.slice(offset, offset + 25).map((Key) => ({ DeleteRequest: { Key } })) } }));
  }
}

async function deletePhotoObjects(photo) {
  if (!photo.originalKey.startsWith(`originals/moments/${photo.momentId}/photos/${photo.id}/`)) return;
  await Promise.all([
    s3.send(new DeleteObjectsCommand({ Bucket: originalsBucket(), Delete: { Quiet: true, Objects: [{ Key: photo.originalKey }, { Key: `processing-results/${photo.id}.json` }] } })),
    s3.send(new DeleteObjectsCommand({ Bucket: webBucket(), Delete: { Quiet: true, Objects: [photo.webKey, photo.thumbnailKey].filter(Boolean).map((Key) => ({ Key })) } })),
  ]);
}

async function signedUpload(photo) {
  const ttl = 900;
  const command = new PutObjectCommand({ Bucket: originalsBucket(), Key: photo.originalKey, ContentType: photo.originalContentType, ChecksumSHA256: photo.checksum });
  return {
    url: await getSignedUrl(s3, command, { expiresIn: ttl, signableHeaders: new Set(["content-type"]), unhoistableHeaders: new Set(["x-amz-checksum-sha256"]) }),
    headers: { "content-type": photo.originalContentType, "x-amz-checksum-sha256": photo.checksum },
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

async function setPhotoStatus(photo, status, error) {
  await ddb.send(new UpdateCommand({ TableName: table(), Key: photoKey(photo.momentId, photo.id),
    UpdateExpression: "SET #status = :status, processingError = :error",
    ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":status": status, ":error": error },
  }));
}

async function processingResult(photoId) {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: originalsBucket(), Key: `processing-results/${photoId}.json` }));
    return JSON.parse(await response.Body.transformToString());
  } catch (error) {
    if (
      error.name === "NoSuchKey" ||
      error.$metadata?.httpStatusCode === 404 ||
      error.name === "AccessDenied" && error.$metadata?.httpStatusCode === 403
    ) return null;
    throw error;
  }
}

async function writeSiteData() {
  const metas = (await scanEntity("moment")).filter(({ status }) => status === "published");
  const moments = (await Promise.all(metas.map(async (meta) => publicMoment(meta, (await photoItems(meta.id)).filter(({ status }) => status === "ready")))))
    .filter(({ photos }) => photos.length).sort(sortMoments);
  await s3.send(new PutObjectCommand({ Bucket: webBucket(), Key: "site-data.json", Body: JSON.stringify({ moments }), ContentType: "application/json; charset=utf-8", CacheControl: "no-store" }));
}

async function scanEntity(entity) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await ddb.send(new ScanCommand({ TableName: table(), ExclusiveStartKey,
      FilterExpression: "#entity = :entity", ExpressionAttributeNames: { "#entity": "entity" }, ExpressionAttributeValues: { ":entity": entity },
    }));
    items.push(...(result.Items ?? [])); ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function photoItems(momentId) {
  const result = await ddb.send(new QueryCommand({ TableName: table(), KeyConditionExpression: "pk = :pk AND begins_with(sk, :photo)", ExpressionAttributeValues: { ":pk": `MOMENT#${momentId}`, ":photo": "PHOTO#" } }));
  return result.Items ?? [];
}

async function photoItem(momentId, photoId) {
  const { Item } = await ddb.send(new GetCommand({ TableName: table(), Key: photoKey(momentId, photoId) }));
  return Item ?? null;
}

function publicMoment(meta, items) {
  const moment = stripInternal(meta);
  return { ...moment, photos: items.sort((a, b) => a.sortOrder - b.sortOrder).map((item) => {
    const photo = stripInternal(item);
    return { ...photo, webUrl: objectPath(photo.webKey), thumbnailUrl: photo.thumbnailKey ? objectPath(photo.thumbnailKey) : null };
  }) };
}

function stripInternal(item) {
  const result = { ...item };
  delete result.pk; delete result.sk; delete result.entity;
  return result;
}

function sortMoments(a, b) { return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt); }
function momentKey(id) { return { pk: `MOMENT#${id}`, sk: "META" }; }
function photoKey(momentId, photoId) { return { pk: `MOMENT#${momentId}`, sk: `PHOTO#${photoId}` }; }
function table() { if (!process.env.TABLE_NAME) throw new Error("TABLE_NAME is required."); return process.env.TABLE_NAME; }
function originalsBucket() { if (!process.env.ORIGINALS_BUCKET) throw new Error("ORIGINALS_BUCKET is required."); return process.env.ORIGINALS_BUCKET; }
function webBucket() { if (!process.env.WEB_BUCKET) throw new Error("WEB_BUCKET is required."); return process.env.WEB_BUCKET; }

function body(event) {
  try { return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString() : event.body ?? "{}"); }
  catch { throw new HttpError(400, "JSON 请求内容无效。"); }
}

export function validateMomentInput(value) {
  if (!value || typeof value !== "object") throw new HttpError(400, "记录内容无效。");
  const date = text(value.date, 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new HttpError(400, "日期无效。");
  return { date, title: text(value.title, 160), location: text(value.location, 160), caption: text(value.caption, 10000) };
}

export function parseUploadBatch(value) {
  if (!value || !Array.isArray(value.files) || value.files.length < 1 || value.files.length > 30) throw new HttpError(400, "每次请选择 1–30 个文件。");
  const files = value.files.map((file) => {
    if (!file || typeof file !== "object") throw new HttpError(400, "上传信息无效。");
    const clientId = text(file.clientId, 64, true); const filename = text(file.filename, 255, true);
    const contentType = text(file.contentType, 100, true).toLowerCase(); const extension = uploadTypes.get(contentType);
    if (!/^[A-Za-z0-9-]+$/.test(clientId) || !extension) throw new HttpError(400, "上传信息无效。");
    if (!Number.isSafeInteger(file.byteSize) || file.byteSize < 1 || file.byteSize > maxUploadBytes) throw new HttpError(400, "单张图片必须在 1 字节到 250 MiB 之间。");
    const checksum = text(file.checksum, 44, true);
    if (!/^[A-Za-z0-9+/]{43}=$/.test(checksum)) throw new HttpError(400, "SHA-256 校验值无效。");
    return { clientId, filename, contentType, extension, byteSize: file.byteSize, checksum };
  });
  if (new Set(files.map(({ clientId }) => clientId)).size !== files.length) throw new HttpError(400, "上传标识不能重复。");
  return files;
}

function text(value, max, required = false) {
  if (typeof value !== "string" || value.length > max) throw new HttpError(400, "输入内容无效。");
  const result = value.trim();
  if (required && !result) throw new HttpError(400, "输入内容无效。");
  return result || null;
}
export function recordId(value) { if (!/^[A-Za-z0-9-]{1,36}$/.test(value)) throw new HttpError(400, "记录标识无效。"); return value; }
export function objectPath(value) { return `/${value.replace(/^\/+/, "")}`; }
function validOrigin(event) { const origin = event.headers?.origin; return !origin || !process.env.PUBLIC_ORIGIN || origin === process.env.PUBLIC_ORIGIN; }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function requestCookies(event) { return parseCookieHeader((event.cookies ?? []).join("; ") || event.headers?.cookie || ""); }
export function parseCookieHeader(header) { return Object.fromEntries(header.split(";").map((part) => part.trim().split("=")).filter(([name, value]) => name && value)); }
function json(statusCode, payload, extra = {}) { return { statusCode, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: JSON.stringify(payload), ...extra }; }
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
