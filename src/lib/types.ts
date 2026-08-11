// ชนิดข้อมูลกลาง + ตัวช่วยจัดรูปแบบ — ไฟล์นี้ห้าม import ข้อมูลสินค้า
// เพราะ client component เรียกใช้ ถ้าดึง JSON เข้ามาด้วยจะทำให้ bundle บวมทั้ง 4MB

export interface Variant {
  t: string;            // ชื่อตัวเลือก เช่น 16" 30T ซอย
  p: number;            // ราคา
  c: number | null;     // ราคาก่อนลด
  s: number;            // สต็อกคงเหลือ
  k: string;            // SKU
  i: string | null;     // รูปเฉพาะตัวเลือกนี้
}

// รีวิวจริงจาก Shopee / Lazada / TikTok (ดึงมาจาก metafield mp_reviews บน Shopify)
export type ReviewSource = "shopee" | "lazada" | "tiktok";

// คลิปรีวิว — โหลดมาเก็บไว้บนเว็บเราเอง (public/rv-video/<id>.mp4 + .jpg)
// ไม่ลิงก์ไปที่แพลตฟอร์มเดิม เพราะลิงก์เดิมมีลายเซ็นและหมดอายุใน 2-3 ชม.
export interface ReviewVideo {
  id: string;
  dur: number;          // วินาที
  w: number;
  h: number;
}

export interface Review {
  src: ReviewSource;
  rating: number;       // 1-5
  author: string;
  text: string;         // อาจว่าง = ให้ดาวอย่างเดียว
  images: string[];     // URL ถาวร
  date: string;         // YYYY-MM-DD
  video?: ReviewVideo;
}

export const videoSrc = (v: ReviewVideo) => `/rv-video/${v.id}.mp4`;
export const videoPoster = (v: ReviewVideo) => `/rv-video/${v.id}.jpg`;
export const durLabel = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export interface ReviewSummary {
  a: number;            // คะแนนเฉลี่ย เช่น 4.9
  n: number;            // จำนวนรีวิวรวมทุกแพลตฟอร์ม
}

export interface Product {
  id: string;
  rv?: ReviewSummary;   // สรุปรีวิว (ใส่ให้ตอนโหลด catalog — มีเฉพาะสินค้าที่มีรีวิว)
  h: string;            // handle
  t: string;            // ชื่อ
  d: string;            // คำอธิบาย (ข้อความล้วน)
  img: string | null;   // รูปหลัก
  imgs: string[];       // รูปทั้งหมด (สูงสุด 8)
  p: number;            // ราคาต่ำสุด
  pmax: number;         // ราคาสูงสุด
  c: number | null;     // ราคาก่อนลด
  st: number;           // สต็อกรวม
  opt: string | null;   // ชื่อกลุ่มตัวเลือก เช่น "ขนาดฟัน"
  v: Variant[];         // ตัวเลือก (ว่าง = ไม่มีตัวเลือก)
  sku: string;
  cols: string[];       // handle ของหมวดที่สังกัด
  tags: string[];
}

// รายละเอียดเพิ่มเติมที่ดึงมาจาก descriptionHtml ของร้านเดิม
export interface Detail {
  specs?: { u: string; w?: number; h?: number }[]; // รูปตารางสเปก
  docs?: { label: string; url: string }[];         // ลิงก์เอกสารดาวน์โหลด
  steps?: string[];                                // ขั้นตอนขอใบอนุญาต
}

export interface Collection {
  h: string;            // handle
  t: string;            // ชื่อ
  g: string | null;     // กลุ่มเมนู เช่น "โซ่" / "อะไหล่เลื่อยยนต์"
  n: number;            // จำนวนสินค้า
}

export const formatPrice = (n: number) => `฿${n.toLocaleString("th-TH")}`;

export const discountPercent = (p: Pick<Product, "p" | "c">) =>
  p.c && p.c > p.p ? Math.round((1 - p.p / p.c) * 100) : 0;

// ช่วงราคา เช่น ฿300 - ฿970 ถ้ามีหลายตัวเลือก
export function priceLabel(p: Pick<Product, "p" | "pmax">) {
  return p.pmax > p.p ? `${formatPrice(p.p)} - ${formatPrice(p.pmax)}` : formatPrice(p.p);
}

// 1,556 → "1.5พัน" แบบ Shopee (ตัวเลขยาวทำให้การ์ดสินค้าล้น)
export function compactCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}พัน`;
  return n.toLocaleString("th-TH");
}

// หมายเหตุ: เก็บ `src` ไว้ในข้อมูลเพื่อกันรีวิวซ้ำตอน sync
// แต่ "ไม่แสดงชื่อแพลตฟอร์มบนหน้าเว็บ" — ไม่พาลูกค้าไปหาคู่แข่ง
