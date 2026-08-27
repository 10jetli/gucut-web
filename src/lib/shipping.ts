// ค่าจัดส่ง — ตารางขั้นบันไดตามยอดค่าสินค้า
//
// คัดลอกมาจากค่าจริงที่ร้านตั้งไว้ใน Shopify (โปรไฟล์ทั่วไป · โซน Domestic)
// ดึงผ่าน Admin API เมื่อ 16 ส.ค. 2569 — deliveryProfile/120738840868
//
// ⚠️ ร้านแก้ค่าส่งใน Shopify เมื่อไหร่ ต้องมาแก้ตารางนี้ตามด้วย ไม่ได้ดึงสด
//    และต้องแก้ที่ netlify/lib/shipping.mjs ให้ตรงกันเสมอ ไม่งั้นยอดฝั่งเว็บ
//    กับฝั่งเซิร์ฟเวอร์จะไม่ตรงกัน แล้วลูกค้าจะเห็นยอดเปลี่ยนตอนกดสั่ง
//
// คิดจาก "ยอดค่าสินค้าหลังหักส่วนลดโค้ด" ให้ตรงกับเงื่อนไข TOTAL_PRICE ของ Shopify
// (แต้มสะสมไม่นับ เพราะ Shopify ไม่รู้จักแต้มของเรา)

export interface ShippingTier {
  /** ยอดสูงสุดของขั้นนี้ (บาท) — ขั้นสุดท้ายใช้ Infinity */
  upTo: number;
  fee: number;
}

export const SHIPPING_TIERS: readonly ShippingTier[] = [
  { upTo: 500, fee: 70 },
  { upTo: 1000, fee: 80 },
  { upTo: 1500, fee: 90 },
  { upTo: 2000, fee: 100 },
  { upTo: 2500, fee: 120 },
  { upTo: 3000, fee: 150 },
  { upTo: 4000, fee: 200 },
  { upTo: 5000, fee: 250 },
  { upTo: 6000, fee: 280 },
  { upTo: 8000, fee: 300 },
  { upTo: 10000, fee: 350 },
  { upTo: Infinity, fee: 400 },
];

/** ค่าส่งของยอดนี้ — ยอดติดลบหรือไม่ใช่ตัวเลข คิดเป็นขั้นต่ำสุด */
export function shippingFor(amount: number): number {
  const a = Number.isFinite(amount) && amount > 0 ? amount : 0;
  for (const t of SHIPPING_TIERS) if (a <= t.upTo) return t.fee;
  return SHIPPING_TIERS[SHIPPING_TIERS.length - 1].fee;
}

// ---------------------------------------------------------------------------
// ช่วงเวลาส่งถึงโดยประมาณ + ขนส่งที่ใช้ — ที่เดียว ใช้ทั้งหน้าเช็คเอาต์และหน้าติดตามพัสดุ
// (เดิมอยู่หัวไฟล์ CheckoutView.tsx — ย้ายมา 27 ส.ค. 2569 ตอนทำหน้าติดตามแบบ Shopee)
export const SHIP_MIN_DAYS = 2;
export const SHIP_MAX_DAYS = 4;
export const SHIP_NAME = "ส่งธรรมดาในประเทศ";
export const CARRIER = "Flash Express";   // ว่าง = ไม่โชว์ชื่อขนส่ง
