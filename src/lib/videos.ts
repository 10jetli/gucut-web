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
//   ""                          = ใช้ของ Shopify (ไฟล์ mp4 480p ตายตัว) — เลิกใช้แล้ว
//   "https://pub-xxxx.r2.dev"   = R2 ผ่านลิงก์ฟรีของ Cloudflare ← ใช้อยู่ตอนนี้
//   "https://video.gucut.com"   = R2 ผ่านโดเมนร้าน (ทำได้เมื่อ gucut.com ย้าย DNS มา Cloudflare)
//
// คลิปครบ 459 ใบอยู่บน R2 แล้ว (ย้ายเมื่อ 15 ส.ค. 2569 · 12.8 GB · 22,545 ไฟล์)
// ลิงก์ r2.dev มี rate limit ของ Cloudflare อยู่ ถ้าคนดูเยอะควรย้ายไป video.gucut.com
// ---------------------------------------------------------------------------
// ใส่ : string ไว้ ไม่งั้น TypeScript ฟันธงว่าค่านี้เท่ากับ "" ไม่ได้แน่ ๆ แล้วฟ้อง usingHls
const HOST: string = "https://pub-002ee0abd2f747c5b9e5573c987ca79d.r2.dev";

export const usingHls = HOST !== "";

/** โดเมนที่เก็บคลิป — หน้าเว็บใช้ preconnect ไว้ล่วงหน้า จะได้ไม่เสียเวลาต่อ TLS ตอนกดดู */
export const VIDEO_HOST = HOST;

// ---------------------------------------------------------------------------
// ชิงโหลดล่วงหน้า — ตัวชี้ขาดว่าคลิป "กว่าจะเริ่มเล่น" นานแค่ไหน
//
// HLS ต้องยิงต่อกัน 3 ครั้งกว่าจะได้ภาพแรก: master.m3u8 → index ของชั้นนั้น →
// เซกเมนต์แรก  บนเน็ตบ้านราว 0.5 วิ แต่บนมือถือ 4G ที่ ping สูงกว่าจะเป็น 1.5-2.5 วิ
// ถ้าดึงสามอย่างนี้ไว้ตั้งแต่ตอนที่ลูกค้ายังดูใบก่อนหน้าอยู่ พอเลื่อนถึงจะเล่นทันที
// ---------------------------------------------------------------------------
const warmed = new Set<string>();

export function prefetchVideo(x: ShopVideo | undefined) {
  if (!x || !HOST || typeof window === "undefined" || warmed.has(x.v)) return;
  warmed.add(x.v);
  const base = `${HOST}/v/${x.v}`;
  // เรียงตามลำดับที่ตัวเล่นจะขอจริง ๆ · ไฟล์สองอันแรกเล็กมาก (ไม่ถึง 1KB)
  for (const u of [`${base}/master.m3u8`, `${base}/v480/index.m3u8`, `${base}/v480/seg000.ts`]) {
    fetch(u, { mode: "cors", credentials: "omit" }).catch(() => {});
  }
}

const file = (x: ShopVideo, suffix: string) => `${CDN}/videos/c/vp/${x.v}/${x.v}.${suffix}.mp4`;

// R2: ไฟล์ HLS ตัวเดียวจบ เบราว์เซอร์เลือกความคมชัดเองตามเน็ตลูกค้า
// Shopify: ได้แค่ 480p ตายตัว ถ้าใช้ 720p คนเน็ตอ่อนจะค้าง
export const videoSrc = (x: ShopVideo) =>
  HOST ? `${HOST}/v/${x.v}/master.m3u8` : file(x, x.s);

export const videoHd = (x: ShopVideo) =>
  HOST ? undefined : x.hd ? file(x, x.hd) : undefined;   // HLS ปรับเองไม่ต้องมีลิงก์ HD แยก

// รูปปกคลิป
//
// ⚠️ รูปจาก R2 ใช้ตรง ๆ ห้ามวิ่งผ่าน Netlify Image CDN
//    ตัวย้ายคลิป (video-to-r2.mjs) ตัดรูปปกมาให้ขนาดพอดีอยู่แล้ว (404x720)
//    วัดจริงแล้ว: ผ่าน Netlify ได้ภาพขนาดเท่ากันเป๊ะ ประหยัดแค่ 14KB
//    แต่ช้ากว่า 3 เท่า (0.98 วิ เทียบกับ 0.29 วิ) เพราะ Netlify ต้องวิ่งไปดึงจาก R2
//    มาแปลงก่อนอีกทอด — ในฟีดที่เลื่อนทีละใบ ความหน่วงตรงนี้คือ "ภาพยังไม่ขึ้น"
//    ส่วนรูปเก่าจาก Shopify ยังต้องผ่าน Netlify เพราะไฟล์ต้นทางใหญ่เกิน
export function videoPoster(x: ShopVideo, w = 480) {
  if (HOST) return `${HOST}/v/${x.v}/poster.jpg`;
  if (!x.pv) return undefined;
  const url = `${CDN}/s/files/${SHOP}/files/preview_images/${x.v}.thumbnail.0000000000.jpg?v=${x.pv}`;
  return `/.netlify/images?${new URLSearchParams({ url, w: String(w), q: "60" })}`;
}

export const durLabel = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
