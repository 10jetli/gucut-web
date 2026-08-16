// ค่าจัดส่ง ฝั่ง serverless function
//
// ⚠️ ต้องตรงกับ src/lib/shipping.ts เสมอ — ที่ต้องมีสองไฟล์เพราะฝั่ง function
//    เป็น .mjs ล้วน ไม่ผ่าน bundler ของ Next.js จึง import ไฟล์ .ts ไม่ได้
//
// เซิร์ฟเวอร์คิดค่าส่งใหม่เองเสมอ ไม่เชื่อตัวเลขจากเบราว์เซอร์

export const SHIPPING_TIERS = [
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

export function shippingFor(amount) {
  const a = Number.isFinite(amount) && amount > 0 ? amount : 0;
  for (const t of SHIPPING_TIERS) if (a <= t.upTo) return t.fee;
  return SHIPPING_TIERS[SHIPPING_TIERS.length - 1].fee;
}
