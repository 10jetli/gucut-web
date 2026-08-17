// ประกอบรายการคลิป + สินค้าที่ผูกไว้ — ใช้ได้เฉพาะฝั่ง server
// (ดึง catalog เข้ามา ซึ่งเป็น JSON 4MB ห้ามให้ติดไปกับ bundle ฝั่ง client)
import { getProduct } from "./catalog";
import { videos, type FeedItem } from "./videos";
import stillClips from "@/data/still-clips.json";

// คลิปที่เป็นแค่ภาพนิ่งอะไหล่บนพื้นขาว (กับการ์ตูนอธิบาย) — ไม่เอาขึ้นฟีดหน้าวิดีโอ
// คนเปิดฟีดมาอยากดูของจริงหน้างาน เจอภาพนิ่งก็เลื่อนผ่านทันที
// รายชื่อมาจาก scripts/gen-motion.mjs (วัดความสว่างเฉลี่ยของคลิปด้วย ffmpeg)
// ⚠️ คลิปพวกนี้ยังอยู่ในคลังและยังโชว์เป็นคลิปลอยมุมจอในหน้าสินค้าเหมือนเดิม
//    ตัดออกเฉพาะ "ฟีดหน้าวิดีโอ" เท่านั้น
const STILL = new Set(stillClips as string[]);

// จำนวนคลิปที่ฝังไปกับหน้าเว็บเลย ที่เหลือค่อยดึงจาก /feed.json ตอนลูกค้าเลื่อนใกล้หมด
// ตั้งไว้เท่านี้เพื่อให้หน้าเว็บเบา ต่อให้วันหนึ่งมีคลิปเป็นพัน ๆ ก็ไม่บวม
export const FIRST_PAGE = 40;

export function feedItems(): FeedItem[] {
  return videos.filter((v) => !STILL.has(v.v)).map((v) => {
    const p = v.h ? getProduct(v.h) : undefined;
    return p ? { v, p: { h: p.h, t: p.t, img: p.img, p: p.p } } : { v };
  });
}

// ---------------------------------------------------------------------------
// คลิปสำหรับ "คลิปลอยมุมจอ" ในหน้าแรก (แบบ Shopee)
//
// หน้าแรกถูก build เป็น HTML ล่วงหน้า ถ้าสุ่มตอน build ทุกคนจะเห็นคลิปเดียวกันหมด
// จึงส่ง "ตัวเลือก" ไปให้เบราว์เซอร์ แล้วให้เครื่องลูกค้าสุ่มเองตอนเปิดหน้า
// เปิดกี่ครั้งก็ได้คลิปคนละใบ
//
// ⚠️ ส่งไปเท่าที่จำเป็นเท่านั้น (แค่รหัสคลิปกับความยาว)
//    ถ้าส่งทั้งก้อน videos.json ไปด้วย หน้าแรกจะหนักขึ้นเกือบ 80KB
//    ซึ่งเป็นหน้าที่คนเข้ามากที่สุด ไม่คุ้มกันเลย
//
// เลือกแบบ "หยิบเว้นระยะ" ให้กระจายทั้งคลัง ไม่ใช่เอาแต่ 80 ใบแรก
// (คลิปเรียงตามเวลาที่อัป ถ้าเอาหัวแถวจะได้แต่ของเก่าหรือของใหม่กระจุกเดียว)
//
// อยากให้หลากหลายขึ้นก็เพิ่มเลขนี้ — ทุก 10 ใบ = หน้าแรกหนักขึ้นราว 0.5KB
export const FLOAT_POOL = 80;

export interface FloatClip {
  v: string;     // รหัสคลิป
  dur: number;   // ความยาว (วินาที) — ใช้โชว์บนป้าย
}

export function floatClips(): FloatClip[] {
  const all = videos.filter((v) => !STILL.has(v.v));
  if (all.length <= FLOAT_POOL) return all.map((v) => ({ v: v.v, dur: v.dur }));
  const step = all.length / FLOAT_POOL;
  const out: FloatClip[] = [];
  for (let i = 0; i < FLOAT_POOL; i++) {
    const v = all[Math.floor(i * step)];
    out.push({ v: v.v, dur: v.dur });
  }
  return out;
}
