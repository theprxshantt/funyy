import type { Metadata } from "next";
import "./globals.css";
import CameraGate from "./CameraGate";
import LeaveSiteProtection from "./LeaveSiteProtection";

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
      <body>
        <CameraGate>
          <LeaveSiteProtection />
          {children}
        </CameraGate>
      </body>
    </html>
  );
}
