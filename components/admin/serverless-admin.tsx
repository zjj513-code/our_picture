"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MomentSection } from "@/components/moment-section";
import { PhotoOrderEditor } from "@/components/admin/photo-order-editor";
import { PhotoUploadPanel } from "@/components/admin/photo-upload-panel";
import type { Moment, MomentStatus } from "@/lib/types";

type Summary = Pick<Moment, "id" | "date" | "title" | "location" | "status" | "updatedAt"> & {
  photoCount: number;
};
type Admin = { id: string; username: string };
type View = "list" | "new" | "edit" | "preview";

export function ServerlessAdmin() {
  const [state, setState] = useState<"loading" | "anonymous" | "ready">("loading");
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [moments, setMoments] = useState<Summary[]>([]);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [view, setView] = useState<View>("list");
  const [message, setMessage] = useState("");

  const loadList = useCallback(async () => {
    try {
      const payload = await api<{ admin: Admin; moments: Summary[] }>("/api/admin/moments");
      setAdmin(payload.admin);
      setMoments(payload.moments);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setState("anonymous");
      else setMessage(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList();
  }, [loadList]);

  const openMoment = async (id: string) => {
    setMessage("");
    try {
      setMoment(await api<Moment>(`/api/admin/moments/${id}`));
      setView("edit");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  const refreshMoment = async () => {
    if (!moment) return;
    setMoment(await api<Moment>(`/api/admin/moments/${moment.id}`));
    await loadList();
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setAdmin(null);
    setMoment(null);
    setState("anonymous");
    setView("list");
  };

  if (state === "loading") return <main className="admin-login"><p className="admin-copy">正在载入…</p></main>;
  if (state === "anonymous") return <Login onLogin={loadList} />;

  return (
    <div className="admin-app" lang="zh-CN">
      <header className="admin-header">
        <button className="admin-brand admin-button--quiet" type="button" onClick={() => { setView("list"); setMoment(null); void loadList(); }}>Our Pictures</button>
        <div className="admin-header-actions">
          <Link className="admin-button admin-button--quiet" href="/">查看网站</Link>
          <span className="admin-username">{admin?.username}</span>
          <button className="admin-button admin-button--quiet" type="button" onClick={logout}>退出登录</button>
        </div>
      </header>
      <main className="admin-main">
        {message ? <p className="admin-error">{message}</p> : null}
        {view === "list" ? (
          <MomentList
            moments={moments}
            onNew={() => { setMoment(null); setView("new"); }}
            onOpen={openMoment}
            onStatus={async (id, status) => {
              try {
                await api(`/api/admin/moments/${id}/status`, { method: "PUT", body: { status } });
                await loadList();
              } catch (error) { setMessage(errorMessage(error)); }
            }}
          />
        ) : view === "new" ? (
          <MomentEditor
            title="新建记录"
            submitLabel="创建记录"
            onCancel={() => setView("list")}
            onSave={async (input) => {
              const { id } = await api<{ id: string }>("/api/admin/moments", { method: "POST", body: input });
              await loadList();
              await openMoment(id);
            }}
          />
        ) : view === "preview" && moment ? (
          <>
            <div className="admin-heading-row">
              <div><h1 className="admin-title">预览</h1><p className="admin-subtitle">仅显示当前已就绪的照片。</p></div>
              <button className="admin-button" type="button" onClick={() => setView("edit")}>返回编辑</button>
            </div>
            <div className="admin-preview-page"><MomentSection moment={{ ...moment, photos: moment.photos.filter(({ status }) => status === "ready") }} priority /></div>
          </>
        ) : moment ? (
          <>
            <MomentEditor
              title="编辑记录"
              moment={moment}
              submitLabel="保存内容"
              onCancel={() => { setView("list"); setMoment(null); }}
              onPreview={() => setView("preview")}
              onSave={async (input) => {
                await api(`/api/admin/moments/${moment.id}`, { method: "PUT", body: input });
                await refreshMoment();
                setMessage("已保存。");
              }}
              onDelete={async () => {
                if (!window.confirm("永久删除这条记录和其中的照片？")) return;
                await api(`/api/admin/moments/${moment.id}`, { method: "DELETE" });
                setMoment(null); setView("list"); await loadList();
              }}
            />
            <section className="admin-section">
              <h2 className="admin-section-title">上传照片</h2>
              <PhotoUploadPanel momentId={moment.id} onChanged={refreshMoment} />
            </section>
            <section className="admin-section">
              <h2 className="admin-section-title">照片顺序</h2>
              {moment.photos.length ? (
                <PhotoOrderEditor key={moment.photos.map(({ id, sortOrder }) => `${id}:${sortOrder}`).join("|")} momentId={moment.id} initialPhotos={moment.photos} onChanged={refreshMoment} />
              ) : <p className="admin-empty">还没有照片。</p>}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setWorking(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api("/api/auth/login", { method: "POST", body: { username: data.get("username"), password: data.get("password") } });
      await onLogin();
    } catch { setError("账号或密码错误。"); }
    finally { setWorking(false); }
  };
  return (
    <main className="admin-login" lang="zh-CN"><div className="admin-login-inner">
      <h1 className="admin-title">后台登录</h1>
      {error ? <p className="admin-error">{error}</p> : null}
      <form onSubmit={submit}>
        <div className="admin-field"><label className="admin-label" htmlFor="username">账号</label><input className="admin-input" id="username" name="username" autoComplete="username" required maxLength={64} /></div>
        <div className="admin-field"><label className="admin-label" htmlFor="password">密码</label><input className="admin-input" id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} /></div>
        <button className="admin-button admin-button--primary" type="submit" disabled={working}>{working ? "登录中…" : "登录"}</button>
      </form>
    </div></main>
  );
}

function MomentList({ moments, onNew, onOpen, onStatus }: { moments: Summary[]; onNew: () => void; onOpen: (id: string) => void; onStatus: (id: string, status: MomentStatus) => void }) {
  return <><div className="admin-heading-row"><div><h1 className="admin-title">记录</h1><p className="admin-subtitle">管理日期、文字、照片和发布状态。</p></div><button className="admin-button admin-button--primary" type="button" onClick={onNew}>新建记录</button></div>
    {moments.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>日期</th><th>标题</th><th>照片</th><th>状态</th><th></th></tr></thead><tbody>{moments.map((item) => <tr key={item.id}><td>{item.date}</td><td>{item.title || item.location || "无标题"}</td><td>{item.photoCount}</td><td><select className="admin-status-select" value={item.status} onChange={(event) => onStatus(item.id, event.target.value as MomentStatus)}><option value="draft">草稿</option><option value="published">已发布</option></select></td><td><button className="admin-button" type="button" onClick={() => onOpen(item.id)}>编辑</button></td></tr>)}</tbody></table></div> : <p className="admin-empty">还没有记录。</p>}
  </>;
}

type MomentInput = { date: string; title: string; location: string; caption: string };
function MomentEditor({ title, moment, submitLabel, onSave, onCancel, onPreview, onDelete }: { title: string; moment?: Moment; submitLabel: string; onSave: (input: MomentInput) => Promise<void>; onCancel: () => void; onPreview?: () => void; onDelete?: () => Promise<void> }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setWorking(true); setError("");
    const data = new FormData(event.currentTarget);
    try { await onSave({ date: String(data.get("date")), title: String(data.get("title")), location: String(data.get("location")), caption: String(data.get("caption")) }); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setWorking(false); }
  };
  return <><div className="admin-heading-row"><div><h1 className="admin-title">{title}</h1>{moment ? <p className="admin-subtitle">{moment.photos.length} 张照片</p> : null}</div><div className="admin-actions">{onPreview ? <button className="admin-button" type="button" onClick={onPreview}>预览</button> : null}<button className="admin-button" type="button" onClick={onCancel}>返回</button></div></div>
    {error ? <p className="admin-error">{error}</p> : null}
    <form className="admin-form" onSubmit={submit}><div className="admin-field-grid">
      <div className="admin-field"><label className="admin-label" htmlFor="date">日期</label><input className="admin-input" id="date" name="date" type="date" defaultValue={moment?.date} required /></div>
      <div className="admin-field"><label className="admin-label" htmlFor="location">地点</label><input className="admin-input" id="location" name="location" defaultValue={moment?.location ?? ""} maxLength={160} /></div>
      <div className="admin-field admin-field--full"><label className="admin-label" htmlFor="title">标题</label><input className="admin-input" id="title" name="title" defaultValue={moment?.title ?? ""} maxLength={160} /></div>
      <div className="admin-field admin-field--full"><label className="admin-label" htmlFor="caption">说明</label><textarea className="admin-textarea" id="caption" name="caption" defaultValue={moment?.caption ?? ""} maxLength={10000} /></div>
    </div><div className="admin-form-actions"><button className="admin-button admin-button--primary" type="submit" disabled={working}>{working ? "保存中…" : submitLabel}</button>{onDelete ? <button className="admin-button admin-button--danger" type="button" onClick={onDelete}>永久删除记录</button> : null}</div></form>
  </>;
}

class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function api<T = unknown>(url: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(url, { method: options.method ?? "GET", headers: options.body ? { "content-type": "application/json" } : undefined, body: options.body ? JSON.stringify(options.body) : undefined, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error ?? `请求失败（${response.status}）。`, response.status);
  return payload as T;
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "请求失败。"; }
