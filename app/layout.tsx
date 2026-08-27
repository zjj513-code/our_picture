import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "Our Pictures",
  description: "A quiet, private archive of film photographs.",
  openGraph: {
    title: "Our Pictures",
    description: "A quiet, private archive of film photographs.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "Our Pictures — a quiet film photography archive",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Our Pictures",
    description: "A quiet, private archive of film photographs.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#fafaf8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
