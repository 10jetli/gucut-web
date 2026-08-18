import type { Metadata, Viewport } from "next";
import "./globals.css";
import Shell from "@/components/Shell";
import { SITE_URL as SITE } from "@/lib/site";
import { VIDEO_HOST } from "@/lib/videos";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "GUCUT — เลื่อยยนต์ NEWWAVE / KingKong ของแท้",
  description:
    "ร้าน GUCUT ขายเลื่อยยนต์ NEWWAVE และ KingKong ของแท้ พร้อมโซ่ บาร์ อะไหล่ครบทุกรุ่น ส่งทั่วไทย เก็บเงินปลายทางได้",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GUCUT", statusBarStyle: "black-translucent" },
  // iOS ใช้ apple-touch-icon เป็นไอคอนบนหน้าจอโฮม ไม่ได้อ่านจาก manifest
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#333333",   // ให้ตรงกับแถบหัวเว็บ เวลาติดตั้งเป็นแอปจะกลมกลืน
  width: "device-width",
  initialScale: 1,
  // ⚠️ ห้ามใส่ maximumScale หรือ userScalable: false กลับมา
  //    เดิมใส่ maximumScale: 1 ไว้ = ห้ามลูกค้าซูมจอ
  //    คนสายตาไม่ดี (ซึ่งเป็นลูกค้าจำนวนมากของร้านเครื่องมือช่าง) จะขยายดู
  //    สเปกหรือรหัสอะไหล่ไม่ได้เลย · Lighthouse หักคะแนนข้อนี้หนักที่สุด (น้ำหนัก 10)
  //    ที่ใส่ไว้แต่แรกเพื่อกันจอเด้งตอนแตะช่องกรอก แต่ iOS แก้เรื่องนั้นไปนานแล้ว
  //    ด้วยการตั้งขนาดตัวอักษรช่องกรอกให้ถึง 16px (เว็บนี้ทำไว้แล้ว)
  viewportFit: "cover",   // ให้เนื้อหายืดถึงขอบจอบนมือถือมีติ่ง
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        {/*
          เปิดสายไปเซิร์ฟเวอร์คลิปไว้ล่วงหน้า "ทุกหน้า" ไม่ใช่เฉพาะหน้าวิดีโอ
          วัดจริงแล้ว: คำขอแรกไปหาโดเมนนั้นเสีย ~0.6 วินาที ไปกับการต่อสาย + TLS
          ส่วนคำขอที่ 2-3 เหลือ 0.15-0.29 วินาที — เพราะสายเปิดไว้แล้ว
          เปิดสายตั้งแต่ลูกค้ายังอยู่หน้าแรก พอกดเข้าฟีดจึงยิงขอคลิปได้ทันที
          (ตัดเวลารอไปได้เกือบครึ่งวินาทีสำหรับคลิปใบแรก)
        */}
        {VIDEO_HOST && (
          <>
            <link rel="preconnect" href={VIDEO_HOST} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={VIDEO_HOST} />
          </>
        )}
      </head>
      <body className="font-body">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
