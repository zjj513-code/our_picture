"use client";

import { useState } from "react";
import Image from "next/image";

type AdminPhotoItem = {
  id: string;
  thumbnailKey: string | null;
  webKey: string;
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
            <Image
              className="admin-photo-thumb"
              src={photo.thumbnailKey ?? photo.webKey}
              width={112}
              height={75}
              alt=""
              unoptimized
            />
            <div className="admin-photo-meta">
              <strong>{photo.webKey}</strong>
              Order {index + 1}
            </div>
            <div className="admin-photo-controls">
              <button
                className="admin-button"
                type="button"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
                aria-label={`Move photo ${index + 1} up`}
              >
                Up
              </button>
              <button
                className="admin-button"
                type="button"
                disabled={index === orderedPhotos.length - 1}
                onClick={() => move(index, index + 1)}
                aria-label={`Move photo ${index + 1} down`}
              >
                Down
              </button>
              <button
                className="admin-button admin-button--danger"
                type="submit"
                formAction={`/admin/moments/${momentId}/photos/${photo.id}/remove`}
                formMethod="post"
                name="confirm"
                value="yes"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="admin-form-actions">
        <button className="admin-button admin-button--primary" type="submit">
          Save photo order
        </button>
      </div>
    </form>
  );
}
