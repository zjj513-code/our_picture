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
  filename: string | null;
  status: PhotoStatus;
  error: string | null;
};

type PhotoOrderEditorProps = {
  momentId: string;
  initialPhotos: AdminPhotoItem[];
};

export function PhotoOrderEditor({ momentId, initialPhotos }: PhotoOrderEditorProps) {
  const [orderedPhotos, setOrderedPhotos] = useState(initialPhotos);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const move = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= orderedPhotos.length) return;
    setOrderedPhotos((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const dropBefore = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    setOrderedPhotos((current) => {
      const fromIndex = current.findIndex(({ id }) => id === draggedId);
      const toIndex = current.findIndex(({ id }) => id === targetId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDraggedId(null);
  };

  return (
    <form action={`/admin/moments/${momentId}/photos/reorder`} method="post">
      <input
        type="hidden"
        name="order"
        value={JSON.stringify(orderedPhotos.map(({ id }) => id))}
      />
      <ol className="admin-photo-list">
        {orderedPhotos.map((photo, index) => (
          <li
            key={photo.id}
            className="admin-photo-row"
            draggable
            data-dragging={draggedId === photo.id}
            onDragStart={() => setDraggedId(photo.id)}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => dropBefore(photo.id)}
          >
            {photo.status === "ready" ? (
              <Image
                className="admin-photo-thumb"
                src={photo.thumbnailUrl ?? photo.webUrl}
                width={112}
                height={75}
                alt=""
                unoptimized
              />
            ) : (
              <div className="admin-photo-placeholder" aria-hidden="true">
                {photoStatusLabel(photo.status)}
              </div>
            )}
            <div className="admin-photo-meta">
              <strong>{photo.filename ?? photo.webKey}</strong>
              顺序 {index + 1} · {photoStatusLabel(photo.status)}
              {photo.error ? (
                <span className="admin-photo-error">{photoProcessingErrorLabel(photo.error)}</span>
              ) : null}
            </div>
            <div className="admin-photo-controls">
              <button
                className="admin-button"
                type="button"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
                aria-label={`将第 ${index + 1} 张照片上移`}
              >
                上移
              </button>
              <button
                className="admin-button"
                type="button"
                disabled={index === orderedPhotos.length - 1}
                onClick={() => move(index, index + 1)}
                aria-label={`将第 ${index + 1} 张照片下移`}
              >
                下移
              </button>
              <button
                className="admin-button admin-button--danger"
                type="submit"
                formAction={`/admin/moments/${momentId}/photos/${photo.id}/remove`}
                formMethod="post"
                name="confirm"
                value="yes"
              >
                移除
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="admin-form-actions">
        <button className="admin-button admin-button--primary" type="submit">
          保存照片顺序
        </button>
      </div>
    </form>
  );
}
