import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  authenticatePassword,
  createSession,
  deleteExpiredSessions,
  revokeSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth";
import { hasValidOrigin } from "@/lib/admin-session";

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const formData = await request.formData();
  const username = formData.get("username");
  const password = formData.get("password");
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.length > 64 ||
    password.length > 200
  ) {
    return invalidLogin(request);
  }

  const admin = await authenticatePassword(username, password);
  if (!admin) return invalidLogin(request);

  await deleteExpiredSessions();
  await revokeSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const session = await createSession(admin);
  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(
    SESSION_COOKIE_NAME,
    session.token,
    sessionCookieOptions(session.expiresAt),
  );
  return response;
}

function invalidLogin(request: NextRequest) {
  const destination = new URL("/admin/login", request.url);
  destination.searchParams.set("error", "Invalid username or password.");
  return NextResponse.redirect(destination, 303);
}
