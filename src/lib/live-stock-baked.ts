// สต็อกสดจาก ZORT ที่ถูก **อบไว้ตอน build** ให้การ์ดในหน้ารวมใช้
//
// 🔴 ที่มา 2 ต.ค. 2569 (ท่านประธานถ่ายจอมาเอง): การ์ด 631 ใบขึ้น "สินค้าหมด"
//    ในนั้น 26 ใบมีของจริงรวม 3,958 ชิ้น (04352 = 1,050 · 00313 = 641 · 00625 = 447)
//    เหตุ: การ์ดอ่าน `st` จาก `src/data/products.json` ที่ **แช่ไว้ตั้งแต่ 15 ส.ค. 2569**
//    และการ์ดในหน้ารวม **ไม่ยิงถาม `/api/stock` รายใบ** (ตั้งใจ — JSON 4MB ห้ามติดไป bundle)
//    ⇒ ทางเดียวที่การ์ดจะพูดความจริงคือ **มีของสดอยู่แล้วตอน build**
//
// 🔑 ไฟล์ข้อมูลถูกเขียนโดย `scripts/gen-stock-live.mjs` ตอน prebuild
//    และ **มีช่องบอกตัวเองว่าสดแค่ไหน** (`source` · `generatedAt`)
//    ⇒ ใครอ่านเลขจากที่นี่ ดูสองช่องนั้นก่อนได้เสมอ ไม่ต้องเดา
//
// ⚠️ ไม่รู้ ≠ ศูนย์ — ฟังก์ชันนี้คืน `null` เมื่อไม่รู้ **ห้ามคืน 0**
//    (ศูนย์เป็นคำยืนยันว่า "ของหมด" ซึ่งเป็นคำโกหกที่ทำให้เสียยอดขายมาแล้ว)
import data from "@/data/stock-live.json";

type ก้อน = {
  generatedAt: string | null;
  /** live = ยิง ZORT สำเร็จรอบนี้ · cached = ใช้ของรอบก่อน · baked = ยังไม่เคยมีของสด */
  source: "live" | "cached" | "baked";
  map: Record<string, number>;
};

const ของสด = data as unknown as ก้อน;

/** สดแค่ไหน — ให้จอ/คนอ่านตัดสินใจเองได้ ไม่ต้องเดาจากตัวเลข */
export const ที่มาของสต็อกสด = ของสด.source ?? "baked";
export const เวลาที่อบสต็อกสด = ของสด.generatedAt ?? null;
export const จำนวนรหัสที่รู้สต็อก = Object.keys(ของสด.map ?? {}).length;

/** รหัสสินค้า → จำนวนสดจาก ZORT · **`null` = ไม่รู้** (ไม่มีรหัส · รหัสไม่อยู่ในฟีด · ค่าเสีย) */
export function สต็อกสดของ(sku: string | null | undefined): number | null {
  if (!sku) return null;                       // การ์ด 227 ใบไม่มีช่อง sku เลย ⇒ ไม่มีกุญแจจะถาม
  const n = (ของสด.map ?? {})[String(sku).trim()];
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return n;
}
