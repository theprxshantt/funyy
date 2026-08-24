import type { Metadata } from "next";
import "./globals.css";
import CameraGate from "./CameraGate";

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
          {children}
        </CameraGate>
      </body>
    </html>
  );
}
