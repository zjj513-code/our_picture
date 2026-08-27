import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (await getCurrentAdmin()) redirect("/admin");
  const { error } = await searchParams;

  return (
    <main className="admin-login">
      <div className="admin-login-inner">
        <h1 className="admin-title">Admin sign in</h1>
        {error ? <p className="admin-error">{error}</p> : null}
        <form action="/admin/auth/login" method="post">
          <div className="admin-field">
            <label className="admin-label" htmlFor="username">
              Username
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
              Password
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
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
