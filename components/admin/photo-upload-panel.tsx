"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type UploadStatus =
  | "queued"
  | "hashing"
  | "uploading"
  | "verifying"
  | "processing"
  | "ready"
  | "failed";

type SignedUpload = {
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
};

type UploadItem = {
  clientId: string;
  file: File;
  status: UploadStatus;
  progress: number;
  photoId?: string;
  upload?: SignedUpload;
  checksum?: string;
  error?: string;
};

type InitResponse = {
  uploads: Array<{
    clientId: string;
    photoId: string;
    upload?: SignedUpload;
    error?: string;
  }>;
};

const maxBatchSize = 30;
const maxBytes = 250 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff"]);

export function PhotoUploadPanel({ momentId }: { momentId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [working, setWorking] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const patchItem = (clientId: string, change: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => item.clientId === clientId ? { ...item, ...change } : item));
  };

  const chooseFiles = (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files).slice(0, maxBatchSize);
    setItems(selected.map((file) => ({
      clientId: crypto.randomUUID(),
      file,
      status: "queued",
      progress: 0,
    })));
    setBatchError(files.length > maxBatchSize ? `Only the first ${maxBatchSize} files were selected.` : null);
  };

  const startBatch = async () => {
    const queuedItems = items.filter(({ status }) => status === "queued");
    if (working || queuedItems.length === 0) return;
    setWorking(true);
    setBatchError(null);
    try {
      const metadata = [];
      for (const item of queuedItems) {
        const localError = validateFile(item.file);
        if (localError) {
          patchItem(item.clientId, { status: "failed", error: localError });
          continue;
        }
        patchItem(item.clientId, { status: "hashing", error: undefined });
        const checksum = await sha256Base64(item.file);
        patchItem(item.clientId, { checksum });
        metadata.push({
          clientId: item.clientId,
          filename: item.file.name,
          contentType: item.file.type,
          byteSize: item.file.size,
          checksum,
        });
      }
      if (metadata.length === 0) return;

      const initialized = await requestJson<InitResponse>(
        `/admin/moments/${momentId}/uploads`,
        { files: metadata },
      );
      const ready: UploadItem[] = [];
      for (const result of initialized.uploads) {
        const source = queuedItems.find(({ clientId }) => clientId === result.clientId);
        if (!source) continue;
        if (!result.upload) {
          patchItem(result.clientId, { status: "failed", photoId: result.photoId, error: result.error ?? "Upload URL creation failed." });
          continue;
        }
        const prepared = { ...source, photoId: result.photoId, upload: result.upload };
        patchItem(result.clientId, { photoId: result.photoId, upload: result.upload });
        ready.push(prepared);
      }
      const returnedIds = new Set(initialized.uploads.map(({ clientId }) => clientId));
      for (const item of queuedItems) {
        if (!returnedIds.has(item.clientId)) {
          patchItem(item.clientId, { status: "failed", error: "Upload initialization returned no result." });
        }
      }
      const processingItems: Array<{ photoId: string; clientId: string }> = [];
      await runWithConcurrency(ready, 3, async (item) => {
        if (await uploadAndComplete(item)) {
          processingItems.push({ photoId: item.photoId!, clientId: item.clientId });
        }
      });
      if (processingItems.length > 0) await waitForProcessing(processingItems);
    } catch (error) {
      const message = errorMessage(error);
      setBatchError(message);
      setItems((current) => current.map((item) =>
        item.status === "queued" || item.status === "hashing"
          ? { ...item, status: "failed", error: message }
          : item,
      ));
    } finally {
      setWorking(false);
      router.refresh();
    }
  };

  const uploadAndComplete = async (item: UploadItem) => {
    if (!item.photoId || !item.upload) return false;
    try {
      patchItem(item.clientId, { status: "uploading", progress: 0, error: undefined });
      await putFile(item.file, item.upload, (progress) => patchItem(item.clientId, { progress }));
      patchItem(item.clientId, { status: "verifying", progress: 100 });
      await requestJson(
        `/admin/moments/${momentId}/uploads/${item.photoId}/complete`,
        {},
      );
      patchItem(item.clientId, { status: "processing", progress: 100 });
      router.refresh();
      return true;
    } catch (error) {
      patchItem(item.clientId, { status: "failed", error: errorMessage(error) });
      return false;
    }
  };

  const waitForProcessing = async (entries: Array<{ photoId: string; clientId: string }>) => {
    const waiting = new Map(entries.map((entry) => [entry.photoId, entry.clientId]));
    for (let attempt = 0; attempt < 45 && waiting.size > 0; attempt += 1) {
      if (attempt > 0) await delay(2_000);
      const result = await requestJson<{
        photos: Array<{ photoId: string; status: "pending" | "processing" | "ready" | "failed"; error?: string }>;
      }>(`/admin/moments/${momentId}/photos/reconcile`, {});
      for (const photo of result.photos) {
        const clientId = waiting.get(photo.photoId);
        if (!clientId) continue;
        if (photo.status === "ready") {
          patchItem(clientId, { status: "ready", progress: 100, error: undefined });
          waiting.delete(photo.photoId);
        } else if (photo.status === "failed") {
          patchItem(clientId, { status: "failed", error: photo.error ?? "Image processing failed." });
          waiting.delete(photo.photoId);
        }
      }
      router.refresh();
    }
  };

  const retry = async (item: UploadItem) => {
    if (working) return;
    setWorking(true);
    try {
      const localError = validateFile(item.file);
      if (localError) throw new Error(localError);
      let photoId = item.photoId;
      let upload: SignedUpload;
      if (photoId) {
        const retried = await requestJson<{ photoId: string; upload?: SignedUpload; status?: "processing" | "ready" }>(
          `/admin/moments/${momentId}/uploads/${photoId}/retry`,
          {},
        );
        if (retried.status) {
          patchItem(item.clientId, { status: "processing", progress: 100, error: undefined });
          return;
        }
        if (!retried.upload) throw new Error("Upload URL refresh returned no result.");
        upload = retried.upload;
      } else {
        patchItem(item.clientId, { status: "hashing", error: undefined });
        const checksum = item.checksum ?? await sha256Base64(item.file);
        const initialized = await requestJson<InitResponse>(
          `/admin/moments/${momentId}/uploads`,
          { files: [{
            clientId: item.clientId,
            filename: item.file.name,
            contentType: item.file.type,
            byteSize: item.file.size,
            checksum,
          }] },
        );
        const result = initialized.uploads[0];
        if (!result?.upload) throw new Error(result?.error ?? "Upload URL creation failed.");
        photoId = result.photoId;
        upload = result.upload;
      }
      const prepared = { ...item, photoId, upload };
      patchItem(item.clientId, { photoId, upload });
      if (await uploadAndComplete(prepared)) {
        await waitForProcessing([{ photoId, clientId: item.clientId }]);
      }
    } catch (error) {
      patchItem(item.clientId, { status: "failed", error: errorMessage(error) });
    } finally {
      setWorking(false);
      router.refresh();
    }
  };

  const clear = () => {
    setItems([]);
    setBatchError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="admin-upload-panel">
      <p className="admin-copy">
        Upload up to 30 JPEG, PNG, WebP, or TIFF originals directly to private S3 storage.
        Each file may be up to 250 MiB.
      </p>
      <div className="admin-upload-actions">
        <label className="admin-link-button admin-upload-picker">
          Choose photos
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/tiff"
            multiple
            disabled={working}
            onChange={(event) => chooseFiles(event.target.files)}
          />
        </label>
        <button className="admin-button admin-button--primary" type="button" disabled={working || items.every(({ status }) => status !== "queued")} onClick={startBatch}>
          {working ? "Uploading…" : `Upload ${items.filter(({ status }) => status === "queued").length || "selected"}`}
        </button>
        <button className="admin-button" type="button" disabled={working || items.length === 0} onClick={clear}>
          Clear
        </button>
      </div>
      {batchError ? <p className="admin-error">{batchError}</p> : null}
      {items.length > 0 ? (
        <ul className="admin-upload-list">
          {items.map((item) => (
            <li key={item.clientId} className="admin-upload-item">
              <div className="admin-upload-item-heading">
                <strong>{item.file.name}</strong>
                <span>{formatBytes(item.file.size)} · {statusLabel(item)}</span>
              </div>
              <progress max="100" value={item.progress} aria-label={`${item.file.name} upload progress`} />
              {item.error ? <p>{item.error}</p> : null}
              {item.status === "failed" ? (
                <button className="admin-button" type="button" disabled={working} onClick={() => retry(item)}>
                  Retry this file
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function validateFile(file: File): string | null {
  if (!allowedTypes.has(file.type)) return "Only JPEG, PNG, WebP, and TIFF images are supported.";
  if (file.size < 1 || file.size > maxBytes) return "The file must be between 1 byte and 250 MiB.";
  return null;
}

async function sha256Base64(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

async function requestJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? `Request failed (${response.status}).`);
  return payload as T;
}

function putFile(file: File, upload: SignedUpload, onProgress: (progress: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", upload.url);
    for (const [name, value] of Object.entries(upload.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new Error("The direct S3 upload could not be completed."));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(`S3 rejected the upload (${xhr.status}).`));
    xhr.send(file);
  });
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  }));
}

function statusLabel(item: UploadItem) {
  if (item.status === "uploading") return `uploading ${item.progress}%`;
  if (item.status === "processing") return "uploaded · awaiting processing";
  if (item.status === "ready") return "ready";
  return item.status;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Upload failed.";
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
