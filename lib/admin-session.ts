import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getAdminForSessionToken,
  SESSION_COOKIE_NAME,
  type AdminIdentity,
} from "@/lib/auth";

export const getCurrentAdmin = cache(async (): Promise<AdminIdentity | null> => {
  const cookieStore = await cookies();
  return getAdminForSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
});

export async function requireAdminPage(): Promise<AdminIdentity> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function adminMutationGuard(
  request: NextRequest,
): Promise<NextResponse | null> {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const admin = await getAdminForSessionToken(token);
  if (admin) return null;

  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}

export function hasValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function redirectWithNotice(
  request: NextRequest,
  pathname: string,
  kind: "error" | "notice",
  message: string,
): NextResponse {
  const destination = new URL(pathname, request.url);
  destination.searchParams.set(kind, message);
  return NextResponse.redirect(destination, 303);
}
