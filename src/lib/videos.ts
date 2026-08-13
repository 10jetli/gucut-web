// คลิปทั้งหมดของร้าน — ดึงออกมาจาก Shopify ครั้งเดียวด้วย scripts/gen-videos.mjs
// ไฟล์นี้ client component เรียกใช้ได้ ห้าม import แคตตาล็อกเข้ามา (JSON 4MB)
import raw from "@/data/videos.json";

// URL ของ Shopify มีแพตเทิร์นตายตัว เก็บแค่ส่วนที่ต่างกันจริงแล้วประกอบเอาตอนใช้
// ถ้าเก็บ URL เต็ม ๆ ไฟล์ข้อมูลจะใหญ่ขึ้นเกือบสามเท่า
const CDN = "https://cdn.shopify.com";
const SHOP = "1/0905/1081/9620";

export interface ShopVideo {
  v: string;     // hash ของไฟล์คลิป
  s: string;     // ส่วนท้ายไฟล์ 480p เช่น "SD-480p-1.5Mbps-41136299"
  hd?: string;   // ส่วนท้ายไฟล์ 720p (มีบางคลิป)
  pv?: number;   // เลขเวอร์ชันรูปปก
  dur: number;   // ความยาว (วินาที)
  vw: number;    // ความกว้างไฟล์วิดีโอ
  vh: number;    // ความสูงไฟล์วิดีโอ
  h?: string;    // handle สินค้า — มีเฉพาะคลิปที่ติดอยู่กับสินค้าใน Shopify
  t?: string;    // ชื่อสินค้า
  a?: VideoApp;  // แอปที่อัปคลิปนี้ขึ้นร้าน (ไม่มี = อัปกับตัวสินค้าโดยตรง)
}

// คลิปในร้านมาจากหลายแอปคนละยุค
//   vizup   244 ใบ · แอปที่ร้านใช้อยู่ตอนนี้ (ก.พ.–ส.ค. 2026)
//   gracias 122 ใบ · แอปเก่า shopgracias
//   reelup    1 ใบ
//   ไม่มีค่า  92 ใบ · อัปติดกับตัวสินค้าโดยตรง (พวกนี้กดซื้อจากคลิปได้)
export type VideoApp = "vizup" | "gracias" | "reelup";

// อยากโชว์เฉพาะคลิปของบางแอป ใส่ชื่อแอปที่ "ไม่เอา" ตรงนี้ เช่น ["gracias", "reelup"]
// คลิปที่ผูกกับสินค้าไว้แล้วไม่โดนกรอง เพราะเป็นคลิปที่กดซื้อได้
const HIDE: VideoApp[] = [];

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

export const videos = (raw as ShopVideo[]).filter(
  (v) => v.h || !v.a || !HIDE.includes(v.a),
);

export const CHANNEL_URL = "https://www.youtube.com/@NEWWAVELegends";

// ⚠️ ไฟล์คลิปกับรูปปกยังอยู่บน CDN ของ Shopify (459 คลิป รวม 588 นาที)
// เอามาเก็บเองไม่ไหวเพราะรวมแล้วหลาย GB — โปรเจกต์นี้มีรูปอยู่แล้ว 289MB
// ถ้าวันหนึ่งย้ายไปโฮสต์ที่อื่น (R2 / Bunny / YouTube) แก้สามฟังก์ชันข้างล่างจุดเดียว
const file = (x: ShopVideo, suffix: string) => `${CDN}/videos/c/vp/${x.v}/${x.v}.${suffix}.mp4`;

// 480p — ฟีดเล่นคลิปเองตอนเลื่อน ถ้าใช้ 720p กินเน็ตลูกค้าราว 3 เท่า
export const videoSrc = (x: ShopVideo) => file(x, x.s);
export const videoHd = (x: ShopVideo) => (x.hd ? file(x, x.hd) : undefined);

// รูปปกวิ่งผ่าน Netlify Image CDN — ย่อตามจอจริงแล้วแปลง WebP ให้เอง
export function videoPoster(x: ShopVideo, w = 480) {
  if (!x.pv) return undefined;
  const url = `${CDN}/s/files/${SHOP}/files/preview_images/${x.v}.thumbnail.0000000000.jpg?v=${x.pv}`;
  return `/.netlify/images?${new URLSearchParams({ url, w: String(w), q: "60" })}`;
}

export const durLabel = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
