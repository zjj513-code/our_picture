import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  revokeSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth";
import { adminRedirectUrl, hasValidOrigin } from "@/lib/admin-session";

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  await revokeSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const response = NextResponse.redirect(adminRedirectUrl(request, "/admin/login"), 303);
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(new Date(0)),
    maxAge: 0,
  });
  return response;
}
