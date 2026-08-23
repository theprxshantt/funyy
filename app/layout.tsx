import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Made Just For U 🎀",
  description: "A tiny retro surprise."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
