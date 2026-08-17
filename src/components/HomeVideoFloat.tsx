"use client";

// คลิปลอยมุมขวาล่างของหน้าแรก — แบบ Shopee
//
// ต่างจากหน้าสินค้าตรงที่หน้าสินค้าโชว์ "คลิปของสินค้าตัวนั้น" ส่วนหน้าแรกไม่มีสินค้า
// เจาะจง จึงสุ่มมาจากคลังคลิปของร้าน เปิดหน้าใหม่ก็ได้คลิปใบใหม่
//
// ⚠️ ต้องสุ่มในเครื่องลูกค้าเท่านั้น ห้ามสุ่มตอน build
//    หน้าแรกถูก build เป็น HTML ล่วงหน้าไฟล์เดียวเสิร์ฟทุกคน สุ่มตอน build
//    = ทุกคนเห็นคลิปเดียวกันจนกว่าจะ deploy ใหม่ ซึ่งไม่ใช่ "สุ่ม"
import { useEffect, useState } from "react";
import type { FloatClip } from "@/lib/feed";
import type { ShopVideo } from "@/lib/videos";
import ProductVideoFloat from "./ProductVideoFloat";

// รอให้หน้าแรกวาดเสร็จก่อนค่อยโผล่ — คลิปไม่ควรไปแย่งเน็ตกับรูปสินค้า
// ที่ลูกค้ากำลังรอดูอยู่ (รูปพวกนั้นคือสิ่งที่ทำให้เกิดการซื้อ ไม่ใช่คลิปลอย)
const DELAY_MS = 1500;

export default function HomeVideoFloat({ clips }: { clips: FloatClip[] }) {
  const [pick, setPick] = useState<ShopVideo | null>(null);

  useEffect(() => {
    if (!clips.length) return;

    // ลูกค้าที่เปิดโหมดประหยัดเน็ตหรือเน็ตอ่อน ไม่ต้องยัดคลิปให้
    // คนกลุ่มนี้เข้ามาหาสินค้า ไม่ได้มาดูคลิป แล้วคลิปจะไปแย่งเน็ตจนหน้าเว็บอืด
    const c = (navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }).connection;
    if (c?.saveData) return;
    if ((c?.effectiveType || "").includes("2g")) return;

    const t = setTimeout(() => {
      const x = clips[Math.floor(Math.random() * clips.length)];
      // ประกอบเป็น ShopVideo ให้ครบรูปแบบ — ช่อง s / vw / vh ใส่ค่าตั้งต้นไว้เฉย ๆ
      // เพราะคลิปเสิร์ฟจาก R2 แบบ HLS ซึ่งใช้แค่รหัสคลิป (ดู videoSrc ใน lib/videos.ts)
      // สามช่องนั้นเป็นของเส้นทางเก่าสมัยดึงไฟล์ mp4 จาก Shopify ซึ่งเลิกใช้แล้ว
      setPick({ v: x.v, dur: x.dur, s: "", vw: 404, vh: 720 });
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [clips]);

  if (!pick) return null;

  // หน้าแรกไม่มีแถบซื้อ มีแค่เมนูล่าง (วัดจริงบนจอมือถือได้ 59px รวมระยะหลบขอบจอ)
  // 4.5rem = 72px เหลือช่องว่างเหนือเมนูราว 13px กำลังดี ไม่ดูติดกันจนเกะกะ
  return <ProductVideoFloat video={pick} lift="4.5rem" width={78} href="/videos/" label="ดูคลิปรวม" />;
}
