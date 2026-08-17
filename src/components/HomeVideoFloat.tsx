"use client";

// คลิปลอยมุมขวาล่างของหน้าแรก — แบบ Shopee
//
// ต่างจากหน้าสินค้าตรงที่หน้าสินค้าโชว์ "คลิปของสินค้าตัวนั้น" ส่วนหน้าแรกไม่มีสินค้า
// เจาะจง จึงเลือกมาจากคลังคลิปของร้าน เปิดหน้าใหม่ก็ได้คลิปใบใหม่
// กดแล้วพาไปหน้าคลิปรวม (/videos/) ไม่ได้ขยายดูคาหน้าแรก — หน้าที่ของมันคือ "ชวน"
//
// ⚠️ ต้องเลือกในเครื่องลูกค้าเท่านั้น ห้ามเลือกตอน build
//    หน้าแรกถูก build เป็น HTML ล่วงหน้าไฟล์เดียวเสิร์ฟทุกคน เลือกตอน build
//    = ทุกคนเห็นคลิปเดียวกันจนกว่าจะ deploy ใหม่ ซึ่งไม่ใช่ "สุ่ม"
import { useEffect, useState } from "react";
import type { FloatClip } from "@/lib/feed";
import { fetchCounts, type VideoCounts, type VideoViews } from "@/lib/social";
import type { ShopVideo } from "@/lib/videos";
import ProductVideoFloat from "./ProductVideoFloat";

// รอให้หน้าแรกวาดเสร็จก่อนค่อยโผล่ — คลิปไม่ควรไปแย่งเน็ตกับรูปสินค้า
// ที่ลูกค้ากำลังรอดูอยู่ (รูปพวกนั้นคือสิ่งที่ทำให้เกิดการซื้อ ไม่ใช่คลิปลอย)
const DELAY_MS = 1500;

// ---------------------------------------------------------------------------
// เลือกคลิป — "คนดูเยอะได้เปรียบ แต่ไม่ใช่ผูกขาด"
//
// เจ้าของร้านสั่ง 18 ส.ค. 2569: "คลิปที่มีคนดูเยอะ ให้เอามาขึ้น แรนด้อม"
// คือต้องเอนไปทางคลิปดัง แต่ยังต้องสุ่ม ไม่ใช่โชว์ใบเดิมซ้ำ ๆ
//
// ใช้วิธีเดียวกับฟีดหน้าวิดีโอ (Efraimidis–Spirakis): ให้แต้ม = random^(1/น้ำหนัก)
// แล้วหยิบใบที่แต้มสูงสุด ทุกใบมีสิทธิ์ขึ้น แต่ใบที่คนดูเยอะมีโอกาสมากกว่า
//
// ⚠️ น้ำหนักต้องมีเพดาน — กัน "ยิ่งดังยิ่งได้ขึ้น"
//    คลิปที่ถูกเลือกบ่อยจะได้วิวเพิ่ม แล้วยิ่งถูกเลือกอีก วนจนคลิปอื่นไม่มีวันได้โอกาส
//
// ฟีดหน้าวิดีโอใช้เพดาน 3 แต่ตรงนี้ตั้ง 8 เพราะโจทย์คนละอย่าง
//   ฟีด  = จัดลำดับทั้งเส้น ต้องไม่ให้ใบดังยึดหัวแถวจนใบใหม่ไม่มีวันได้เกิด
//   ตรงนี้ = เลือกใบเดียวมาเป็นหน้าตา ควรเอนไปทางใบที่คนดูเยอะชัด ๆ
//   เพดาน 3 ตันเร็วเกินไป (คลิป 30 วิว ได้น้ำหนักเท่าคลิป 500 วิว)
//
// จำลอง 20,000 ครั้ง (คลิปดัง 3 ใบ + ใบที่ยังไม่มีใครดู 12 ใบ)
//   เพดาน 3 → ใบที่มีคนดูได้ขึ้น 43%
//   เพดาน 8 → ใบที่มีคนดูได้ขึ้น 61%  ← ใช้ค่านี้
//   เกิน 8 ไม่ต่างแล้ว (log2 ตันพอดี)
// เหลือ 39% ให้ใบใหม่ตั้งใจไว้แบบนั้น — ถ้าไม่เหลือเลย คลิปใหม่จะไม่มีวันได้วิว
// แล้วอันดับจะแช่แข็งอยู่กับใบเดิมตลอดกาล
// ---------------------------------------------------------------------------
const CAP = 8;

function weight(views: number, likes: number, comments: number) {
  const pop = views * 0.5 + likes + comments * 3;
  return Math.min(CAP, Math.log2(pop + 2));
}

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

    let dead = false;

    // ยิงขอยอดวิว/หัวใจไปพร้อมกับนับเวลารอ — ไม่ได้ต่อคิวกัน
    // ตัวเลขชุดนี้แคชที่ขอบเครือข่าย 60 วินาที และเป็นก้อนเดียวจบ ไม่ได้ถามทีละคลิป
    // ถ้าดึงไม่ได้ (เน็ตสะดุด/ยังไม่มีใครดูสักคลิป) ก็ถอยไปสุ่มจากชุดที่ฝังมากับหน้า
    const empty: { counts: VideoCounts; views: VideoViews } = { counts: {}, views: {} };
    Promise.all([
      fetchCounts().catch(() => empty),
      new Promise((r) => setTimeout(r, DELAY_MS)),
    ]).then(([cv]) => {
      if (dead) return;

      // ตัวเลือก = คลิปที่ฝังมากับหน้า (ให้คลิปที่ยังไม่มีใครดูมีสิทธิ์ด้วย)
      //          + คลิปที่มีคนดู/กดหัวใจจริง (พวกนี้คือใบดัง)
      const dur = new Map(clips.map((x) => [x.v, x.dur]));
      const ids = new Set<string>(clips.map((x) => x.v));
      for (const id of Object.keys(cv.views)) ids.add(id);
      for (const id of Object.keys(cv.counts)) ids.add(id);

      let best: string | null = null;
      let bestKey = -1;
      for (const id of ids) {
        const [likes = 0, comments = 0] = cv.counts[id] ?? [];
        const w = weight(cv.views[id] ?? 0, likes, comments);
        const key = Math.random() ** (1 / w);
        if (key > bestKey) { bestKey = key; best = id; }
      }
      if (!best) return;

      // ประกอบเป็น ShopVideo ให้ครบรูปแบบ — ช่อง s / vw / vh ใส่ค่าตั้งต้นไว้เฉย ๆ
      // เพราะคลิปเสิร์ฟจาก R2 แบบ HLS ซึ่งใช้แค่รหัสคลิป (ดู videoSrc ใน lib/videos.ts)
      // สามช่องนั้นเป็นของเส้นทางเก่าสมัยดึงไฟล์ mp4 จาก Shopify ซึ่งเลิกใช้แล้ว
      // ส่วน dur ไม่ได้เอาไปโชว์แล้ว (ป้ายเขียน "ดูคลิปรวม") ใบที่มาจากยอดวิวจึงใส่ 0 ได้
      setPick({ v: best, dur: dur.get(best) ?? 0, s: "", vw: 404, vh: 720 });
    });

    return () => { dead = true; };
  }, [clips]);

  if (!pick) return null;

  // หน้าแรกไม่มีแถบซื้อ มีแค่เมนูล่าง (วัดจริงบนจอมือถือได้ 59px รวมระยะหลบขอบจอ)
  // 4.5rem = 72px เหลือช่องว่างเหนือเมนูราว 13px กำลังดี ไม่ดูติดกันจนเกะกะ
  return <ProductVideoFloat video={pick} lift="4.5rem" width={78} href="/videos/" label="ดูคลิปรวม" />;
}
