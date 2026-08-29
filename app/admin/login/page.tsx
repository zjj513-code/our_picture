import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "后台登录 | Our Pictures",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (await getCurrentAdmin()) redirect("/admin");
  const { error } = await searchParams;

  return (
    <main className="admin-login" lang="zh-CN">
      <div className="admin-login-inner">
        <h1 className="admin-title">后台登录</h1>
        {error ? <p className="admin-error">{error}</p> : null}
        <form action="/admin/auth/login" method="post">
          <div className="admin-field">
            <label className="admin-label" htmlFor="username">
              账号
            </label>
            <input
              className="admin-input"
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              maxLength={64}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="password">
              密码
            </label>
            <input
              className="admin-input"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
            />
          </div>
          <button className="admin-button admin-button--primary" type="submit">
            登录
          </button>
        </form>
      </div>
    </main>
  );
}
