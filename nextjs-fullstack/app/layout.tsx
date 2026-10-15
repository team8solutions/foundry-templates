import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AIT Foundry Next.js Starter",
  description: "A secure full-stack Next.js and PostgreSQL starter.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-gray-50 text-gray-950">{children}</body>
    </html>
  );
}
