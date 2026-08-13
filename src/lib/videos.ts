// คลิปสินค้าทั้งหมดของร้าน — ดึงออกมาจาก Shopify ครั้งเดียวด้วย scripts/gen-videos.mjs
// ไฟล์นี้ client component เรียกใช้ได้ ห้าม import แคตตาล็อกเข้ามา (JSON 4MB)
import raw from "@/data/videos.json";

export interface ShopVideo {
  id: string;       // id คลิปจาก Shopify
  h: string;        // handle สินค้าที่คลิปนี้ติดอยู่
  t: string;        // ชื่อสินค้า (ใช้เป็นชื่อคลิป)
  dur: number;      // ความยาว (วินาที)
  vw: number;       // ความกว้างไฟล์วิดีโอ
  vh: number;       // ความสูงไฟล์วิดีโอ
  src: string;      // ไฟล์ 480p — พอสำหรับฟีดมือถือ และไม่กินเน็ตลูกค้า
  hd?: string;      // ไฟล์ 720p (มีบางคลิป) เก็บไว้เผื่ออนาคตมีปุ่มสลับความคมชัด
  poster?: string;  // รูปปกคลิป
}

// สินค้าเท่าที่ฟีดต้องใช้ — ไม่ส่งทั้งก้อน Product มาให้ client
export interface FeedProduct {
  h: string;
  t: string;
  img: string | null;
  p: number;
}

export interface FeedItem {
  v: ShopVideo;
  p?: FeedProduct;
}

export const videos = raw as ShopVideo[];

export const CHANNEL_URL = "https://www.youtube.com/@NEWWAVELegends";

// ⚠️ ไฟล์คลิปกับรูปปกยังอยู่บน CDN ของ Shopify (ราว 113 คลิป รวม 63 นาที)
// เอามาเก็บเองไม่ไหวเพราะรวมแล้วหลายร้อย MB — โปรเจกต์นี้มีรูปอยู่แล้ว 289MB
// ถ้าวันหนึ่งย้ายไปโฮสต์ที่อื่น (R2 / Bunny / YouTube) แก้ที่สองฟังก์ชันข้างล่างจุดเดียว
export const videoSrc = (v: ShopVideo) => v.src;

// รูปปกวิ่งผ่าน Netlify Image CDN — ย่อตามจอจริงแล้วแปลง WebP ให้เอง
export function videoPoster(v: ShopVideo, w = 640) {
  if (!v.poster) return undefined;
  return `/.netlify/images?${new URLSearchParams({ url: v.poster, w: String(w), q: "60" })}`;
}

export const durLabel = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
