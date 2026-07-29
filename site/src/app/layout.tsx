import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coven Memory — Local-first familiar memory",
  description:
    "Explore a synthetic Coven Memory workspace or open genuine memory locally."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
