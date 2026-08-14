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

// คลิปประจำสินค้า — ใช้กับคลิปลอยมุมจอในหน้าสินค้า (แบบ Shopee)
// มีแค่ 90 สินค้าที่ผูกคลิปไว้ใน Shopify ที่เหลือไม่โชว์อะไรเลย ไม่ต้องเดา
const byProduct = new Map<string, ShopVideo>();
for (const v of videos) if (v.h && !byProduct.has(v.h)) byProduct.set(v.h, v);
export const videoForProduct = (handle: string) => byProduct.get(handle);

// ---------------------------------------------------------------------------
// ที่เก็บคลิป — สลับทั้งเว็บด้วยบรรทัดเดียว
//
//   ""                          = ยังใช้ของ Shopify (ไฟล์ mp4 480p ตายตัว)
//   "https://video.gucut.com"   = ใช้ R2 ของเราเอง (HLS ปรับความคมชัดตามเน็ต)
//
// ก่อนเปลี่ยนต้องย้ายไฟล์ขึ้น R2 ให้ครบก่อน — ดู scripts/video-to-r2.mjs
// (ตัวเล่นรองรับทั้งสองแบบอยู่แล้ว ไม่ต้องแก้อะไรเพิ่ม)
// ---------------------------------------------------------------------------
const HOST = "";

export const usingHls = HOST !== "";

const file = (x: ShopVideo, suffix: string) => `${CDN}/videos/c/vp/${x.v}/${x.v}.${suffix}.mp4`;

// R2: ไฟล์ HLS ตัวเดียวจบ เบราว์เซอร์เลือกความคมชัดเองตามเน็ตลูกค้า
// Shopify: ได้แค่ 480p ตายตัว ถ้าใช้ 720p คนเน็ตอ่อนจะค้าง
export const videoSrc = (x: ShopVideo) =>
  HOST ? `${HOST}/v/${x.v}/master.m3u8` : file(x, x.s);

export const videoHd = (x: ShopVideo) =>
  HOST ? undefined : x.hd ? file(x, x.hd) : undefined;   // HLS ปรับเองไม่ต้องมีลิงก์ HD แยก

// รูปปกวิ่งผ่าน Netlify Image CDN — ย่อตามจอจริงแล้วแปลง WebP ให้เอง
export function videoPoster(x: ShopVideo, w = 480) {
  const url = HOST
    ? `${HOST}/v/${x.v}/poster.jpg`
    : x.pv
      ? `${CDN}/s/files/${SHOP}/files/preview_images/${x.v}.thumbnail.0000000000.jpg?v=${x.pv}`
      : undefined;
  if (!url) return undefined;
  return `/.netlify/images?${new URLSearchParams({ url, w: String(w), q: "60" })}`;
}

export const durLabel = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
