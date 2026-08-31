"use client";

import { useRef, useState } from "react";
import { momentStatusLabel } from "@/lib/admin-labels";
import type { MomentStatus } from "@/lib/types";

type MomentStatusSelectProps = {
  initialStatus: MomentStatus;
  label: string;
  momentId: string;
};

export function MomentStatusSelect({ initialStatus, label, momentId }: MomentStatusSelectProps) {
  const savedStatus = useRef(initialStatus);
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState("已保存");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const messageId = `moment-status-${momentId}`;

  async function updateStatus(nextStatus: MomentStatus) {
    setStatus(nextStatus);
    setSaving(true);
    setFailed(false);
    setMessage("保存中…");

    const body = new FormData();
    body.set("status", nextStatus);
    body.set("returnTo", "/admin");

    try {
      const response = await fetch(`/admin/moments/${momentId}/status`, {
        method: "POST",
        headers: { accept: "application/json" },
        body,
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "保存失败，请重试。");
      savedStatus.current = nextStatus;
      setMessage("已保存");
    } catch (error) {
      setStatus(savedStatus.current);
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-status-form">
      <select
        className="admin-status-select"
        value={status}
        disabled={saving}
        aria-label={`${label}的发布状态`}
        aria-describedby={messageId}
        onChange={(event) => void updateStatus(event.target.value as MomentStatus)}
      >
        <option value="draft">{momentStatusLabel("draft")}</option>
        <option value="published">{momentStatusLabel("published")}</option>
      </select>
      <span
        className={`admin-status-message${failed ? " admin-status-message--error" : ""}`}
        id={messageId}
        role="status"
      >
        {message}
      </span>
    </div>
  );
}
