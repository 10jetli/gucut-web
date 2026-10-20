import type { Metadata } from "next";
import { titleSuffix } from "@/lib/shop";
import AjthongClips from "@/components/AjthongClips";

/* 🎬 หน้ารวมคลิปของเพจ "อ.ธง" — ท่านประธานสั่ง 20 ต.ค. 2569
 *    *"คลิปเพจ อ.ธง ต้องไปโผล่บน gucut.com"*
 *
 * 🚫 **ห้ามปนกับฟีดคลิปของร้านที่ `/videos/`** — คนละชุด คนละที่มา คนละหน้า
 *    (ฟีดร้านมาจาก `src/data/videos.json` + R2 ของเราเอง · หน้านี้ฝังจาก YouTube ของ อ.ธง)
 * 🚫 **ห้ามใส่ลิงก์ในเมนู** จนกว่าท่านประธานจะสั่ง (กติกาเดียวกับบทความ/ใบอนุญาต)
 *    ⇒ เข้าถึงได้ทาง URL ตรง ๆ เท่านั้น และ **ยังไม่ใส่ใน sitemap** ด้วยเหตุเดียวกัน
 * 🚫 **ไม่โหลดไฟล์คลิปมาเก็บ** — ฝังด้วย iframe ของ YouTube เท่านั้น (กติกาลิขสิทธิ์ใน CLAUDE.md)
 * 🚫 **ห้ามเขียนว่ามีทั้งหมดกี่คลิป** — กติกาเดิมของฟีดวิดีโอร้าน ใช้ที่นี่ด้วยเพื่อไม่ให้ขัดกันเอง
 */
export const metadata: Metadata = {
  title: titleSuffix("คลิปงานไม้ อ.ธง"),
  description:
    "รวมคลิปงานผ่าไม้ ตัดไม้ และใช้งานเลื่อยยนต์จริงหน้างาน จากช่องของ อ.ธง — " +
    "ดูได้ในหน้านี้โดยตรง คลิปใหม่ขึ้นเองอัตโนมัติ",
  alternates: { canonical: "/ajthong/" },
  robots: { index: false, follow: true },   // ยังไม่ให้เก็บเข้าสารบัญ จนกว่าท่านจะสั่งเปิด
};

export default function AjthongPage() {
  return (
    <main className="min-h-[100dvh] bg-steel-900 px-4 pb-16 pt-5">
      <h1 className="text-xl font-bold text-white">คลิปงานไม้ อ.ธง</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
        คลิปงานผ่าไม้ ตัดไม้ และการใช้เลื่อยยนต์จริงหน้างาน — เล่นได้ในหน้านี้เลย
        คลิปใหม่จะขึ้นเองโดยไม่ต้องรออัปเดตเว็บ
      </p>
      <AjthongClips />
    </main>
  );
}
