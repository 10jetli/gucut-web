import type { Metadata, Viewport } from "next";
import "./globals.css";
import Shell from "@/components/Shell";
import { SITE_URL as SITE } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "GUCUT — เลื่อยยนต์ NEWWAVE / KingKong ของแท้",
  description:
    "ร้าน GUCUT ขายเลื่อยยนต์ NEWWAVE และ KingKong ของแท้ พร้อมโซ่ บาร์ อะไหล่ครบทุกรุ่น ส่งฟรีทั่วไทย",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GUCUT", statusBarStyle: "black-translucent" },
  // iOS ใช้ apple-touch-icon เป็นไอคอนบนหน้าจอโฮม ไม่ได้อ่านจาก manifest
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#333333",   // ให้ตรงกับแถบหัวเว็บ เวลาติดตั้งเป็นแอปจะกลมกลืน
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",   // ให้เนื้อหายืดถึงขอบจอบนมือถือมีติ่ง
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="font-body">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
