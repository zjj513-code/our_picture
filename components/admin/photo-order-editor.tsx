"use client";

import { useState } from "react";
import Image from "next/image";
import { photoProcessingErrorLabel, photoStatusLabel } from "@/lib/admin-labels";
import type { PhotoStatus } from "@/lib/types";

type AdminPhotoItem = {
  id: string;
  thumbnailUrl: string | null;
  webKey: string;
  webUrl: string;
  originalFilename: string | null;
  status: PhotoStatus;
  processingError: string | null;
};

export function PhotoOrderEditor({
  momentId,
  initialPhotos,
  onChanged,
}: {
  momentId: string;
  initialPhotos: AdminPhotoItem[];
  onChanged: () => void | Promise<void>;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length) return;
    setPhotos((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const save = async () => {
    setMessage("保存中…");
    try {
      await request(`/api/admin/moments/${momentId}/photos/reorder`, "PUT", {
        order: photos.map(({ id }) => id),
      });
      setMessage("已保存");
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败。");
    }
  };

  const remove = async (photoId: string) => {
    if (!window.confirm("永久移除这张照片？")) return;
    setMessage("移除中…");
    try {
      await request(`/api/admin/moments/${momentId}/photos/${photoId}`, "DELETE");
      await onChanged();
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "移除失败。");
    }
  };

  return (
    <>
      <ol className="admin-photo-list">
        {photos.map((photo, index) => (
          <li
            key={photo.id}
            className="admin-photo-row"
            draggable
            data-dragging={draggedId === photo.id}
            onDragStart={() => setDraggedId(photo.id)}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              const from = photos.findIndex(({ id }) => id === draggedId);
              if (from >= 0) move(from, index);
              setDraggedId(null);
            }}
          >
            {photo.status === "ready" ? (
              <Image className="admin-photo-thumb" src={photo.thumbnailUrl ?? photo.webUrl} width={112} height={75} alt="" unoptimized />
            ) : (
              <div className="admin-photo-placeholder" aria-hidden="true">{photoStatusLabel(photo.status)}</div>
            )}
            <div className="admin-photo-meta">
              <strong>{photo.originalFilename ?? photo.webKey}</strong>
              顺序 {index + 1} · {photoStatusLabel(photo.status)}
              {photo.processingError ? <span className="admin-photo-error">{photoProcessingErrorLabel(photo.processingError)}</span> : null}
            </div>
            <div className="admin-photo-controls">
              <button className="admin-button" type="button" disabled={index === 0} onClick={() => move(index, index - 1)}>上移</button>
              <button className="admin-button" type="button" disabled={index === photos.length - 1} onClick={() => move(index, index + 1)}>下移</button>
              <button className="admin-button admin-button--danger" type="button" onClick={() => remove(photo.id)}>移除</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="admin-form-actions">
        <button className="admin-button admin-button--primary" type="button" onClick={save}>保存照片顺序</button>
        {message ? <span className="admin-status-message">{message}</span> : null}
      </div>
    </>
  );
}

async function request(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `请求失败（${response.status}）。`);
  return payload;
}
