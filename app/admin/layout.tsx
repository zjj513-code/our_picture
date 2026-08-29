import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "管理后台 | Our Pictures",
};

export default function AdminRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
