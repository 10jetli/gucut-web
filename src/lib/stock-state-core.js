// แกนกลางของ "สามสถานะสต็อก" — **โค้ดจริงอยู่ที่นี่ไฟล์เดียว**
//
// 🔑 ทำไมเป็น .js ไม่ใช่ .ts: Netlify build ด้วย **Node 20** (`netlify.toml` → NODE_VERSION = "20")
//    Node 20 โหลด `.ts` ไม่ได้เลย (`ERR_UNKNOWN_FILE_EXTENSION`) ส่วนเครื่องเราเป็น Node 22
//    ที่ลอกชนิดออกให้เอง ⇒ เทสที่ import `.ts` **ผ่านบนเครื่องเรา แต่ทำ build ตกที่ Netlify**
//    (เกิดจริง 2 ต.ค. 2569 deploy main@9a22940 — Failed ที่ `not ok 192`)
//    ⇒ ตรรกะอยู่ในไฟล์ .js ให้ทั้งแอป (ผ่าน `stock-state.ts`) และเทส เรียกของชิ้นเดียวกันได้
//    มีด่าน `scripts/tests/เทสห้ามโหลดไฟล์ts.test.mjs` กันการ import `.ts` กลับเข้ามา
//
// 🔑 ชนิด `StockState` ประกาศที่นี่ที่เดียว (`@typedef`) แล้ว `stock-state.ts` ส่งต่อ
//    ⇒ สามคำนั้นถูกพิมพ์ไว้ **ที่เดียว** ไม่มีสำเนาให้เพี้ยนกัน

/** @typedef {"มีของ" | "หมดจริง" | "ไม่รู้"} StockState */

/** แกนกลาง: `null`/`undefined`/ไม่ใช่ตัวเลข = **ไม่รู้** ห้ามกลายเป็น 0
 *  (กฎบ้าน: ไม่รู้ห้ามกลายเป็นศูนย์ที่ชั้นจอ — ศูนย์เป็นคำยืนยัน ไม่ใช่ความว่างเปล่า)
 * @param {number | null | undefined} st
 * @returns {StockState} */
export function สถานะจากค่า(st) {
  if (st === null || st === undefined || !Number.isFinite(st)) return "ไม่รู้";
  return st > 0 ? "มีของ" : "หมดจริง";
}

/** ของที่ระดับสินค้า — `stKnown: false` แปลว่าเรายังไม่รู้ ไม่ใช่ว่าไม่มี
 * @param {{ st: number, stKnown: boolean }} p
 * @returns {StockState} */
export const สถานะของสินค้า = (p) => สถานะจากค่า(p.stKnown ? p.st : null);

/** ของที่ระดับตัวเลือก (ขนาด/ฟัน) — ตัวเลือกที่ไม่รู้ ต้องกดเลือกได้ ห้ามขีดฆ่า
 * @param {{ s: number, sKnown?: boolean }} v
 * @returns {StockState} */
export const สถานะของตัวเลือก = (v) => สถานะจากค่า(v.sKnown === false ? null : v.s);

/** ขึ้นป้าย "สินค้าหมด" ได้ไหม — **เฉพาะ `หมดจริง` เท่านั้น**
 * @param {StockState} s
 * @returns {boolean} */
export const ขึ้นป้ายหมดได้ = (s) => s === "หมดจริง";

/** ให้กดซื้อ/โชว์ในหน้ารวมได้ไหม — `ไม่รู้` ยังให้ขาย (ทักร้านถามได้ ดีกว่าปิดประตู)
 * @param {StockState} s
 * @returns {boolean} */
export const ยังขายได้ = (s) => s !== "หมดจริง";

/** ค่าที่ส่งให้ schema.org — `ไม่รู้` ต้องไม่ประกาศว่า OutOfStock
 *  ⚠️ ประกาศ OutOfStock ให้ของที่ยังไม่รู้ = บอก Google ว่าของหมด ⇒ หายจากผลค้นหา
 * @param {StockState} s
 * @returns {string} */
export const availabilityของ = (s) =>
  s === "มีของ" ? "https://schema.org/InStock"
    : s === "หมดจริง" ? "https://schema.org/OutOfStock"
      : "https://schema.org/LimitedAvailability";
