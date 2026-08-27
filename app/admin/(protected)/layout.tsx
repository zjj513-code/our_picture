import { requireAdminPage } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdminPage();
  return children;
}
