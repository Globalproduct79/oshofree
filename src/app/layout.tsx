import type { Metadata } from "next";
import "./globals.css";
import "@/styles/console.css";

export const metadata: Metadata = {
  title: "OshoFree",
  description: "Run offers on Phoenix and see every share.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
