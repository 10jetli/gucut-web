// ประกอบรายการคลิป + สินค้าที่ผูกไว้ — ใช้ได้เฉพาะฝั่ง server
// (ดึง catalog เข้ามา ซึ่งเป็น JSON 4MB ห้ามให้ติดไปกับ bundle ฝั่ง client)
import { getProduct } from "./catalog";
import { videos, type FeedItem } from "./videos";

// จำนวนคลิปที่ฝังไปกับหน้าเว็บเลย ที่เหลือค่อยดึงจาก /feed.json ตอนลูกค้าเลื่อนใกล้หมด
// ตั้งไว้เท่านี้เพื่อให้หน้าเว็บเบา ต่อให้วันหนึ่งมีคลิปเป็นพัน ๆ ก็ไม่บวม
export const FIRST_PAGE = 40;

export function feedItems(): FeedItem[] {
  return videos.map((v) => {
    const p = v.h ? getProduct(v.h) : undefined;
    return p ? { v, p: { h: p.h, t: p.t, img: p.img, p: p.p } } : { v };
  });
}
