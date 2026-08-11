import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://new78.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "GUCUT — เลื่อยยนต์ NEWWAVE / KingKong ของแท้",
  description:
    "ร้าน GUCUT ขายเลื่อยยนต์ NEWWAVE และ KingKong ของแท้ พร้อมโซ่ บาร์ อะไหล่ครบทุกรุ่น ส่งฟรีทั่วไทย",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GUCUT", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#1a1d21",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="font-body">
        <div className="mx-auto min-h-screen max-w-lg pb-20">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
