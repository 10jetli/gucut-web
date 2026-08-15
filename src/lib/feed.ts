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
