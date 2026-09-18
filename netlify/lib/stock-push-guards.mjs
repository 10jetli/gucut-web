/* 🧱 ด่านของบนชั้น — ใช้ร่วมกับตัวยิงทุกเจ้าที่สร้างหลังจากนี้ (Shopee · TikTok)
 *
 * ที่มา: กติกา ⑥ ⑧ ในหัวไฟล์ stock-push-live.mjs (CEO สั่ง 12 ก.ย. 2569)
 *   "🚫 ห้ามสร้างตัวยิงของ shopee/tiktok ก่อนข้อ ⑧ มีรูปร่าง" ⇒ ไฟล์นี้ต้องมาก่อนตัวยิง (gucut2 · 17 ก.ย. 2569)
 *
 * ⑧ **รหัสที่อยู่ในใบค้างส่ง ห้ามยิงอัตโนมัติ ไม่ว่าชนิดไหน**
 *    ใบที่จ่ายแล้วแต่ยังส่งไม่ออก = หลักฐานจากมือคนที่จับของจริงว่าหยิบของไม่ได้
 *    นิยาม "ค้างส่ง" = กองเดียวกับ `?pending=1` "ต้องส่งของ": จ่ายแล้ว · ยังไม่สำเร็จ · ไม่ใช่ใบยกเลิก
 *    ⚠️ ดูทั้งสองร้าน (ไม่กรอง source) — บล็อกเกินดีกว่าหลุด
 *    ⚠️ ของชุด: รหัสชุดในใบค้างส่ง ⇒ ชิ้นส่วนก็นับว่าค้าง · รหัสที่จะยิงเป็นชุดที่ชิ้นส่วนค้าง ⇒ ก็นับว่าค้าง
 *    🔴 **อ่านใบค้างส่งไม่ได้ ⇒ ตัวยิงต้องไม่ยิงทั้งรอบ** (ไม่รู้ ≠ ไม่มี) — ฟังก์ชันนี้คืน error ให้ตัวยิงตัดสิน
 *
 * ⑥ **reopen (0 → มากกว่า 0) ต้องมีคนยืนยันรายรหัส** ผ่าน body.confirmReopen = [รหัส…]
 *    ตัวกวาดอัตโนมัติไม่มีทางส่งช่องนี้ ⇒ reopen ไม่มีวันถูกยิงอัตโนมัติ
 * ③ ทิศลง (close/down) ต้องสั่งแยกด้วย allowClose:true (กติกาเดิม)
 */
import { coreQuery } from "./coredb.mjs";

/* 🔴 **คำปฏิเสธซ้อนอยู่ในคำยืนยัน** — เจอ 18 ก.ย. 2569 ต่อยอดจากที่ฝั่งจอเจอบนจอ
   (คำว่า "เปิดใช้งาน" มี "ปิดใช้งาน" อยู่ข้างในเป๊ะ ๆ ⇒ ตัวทดสอบเขากดแท็บผิด)
   รูปเดียวกันอยู่ในด่านนี้ และที่นี่**แตะเงินจริง**:
     "จัดส่งไม่สำเร็จ" มีคำว่า "สำเร็จ" ⇒ `NOT LIKE '%สำเร็จ%'` เป็นเท็จ ⇒ ถือว่าใบนี้ **เสร็จแล้ว**
     "Unsuccessful" มีคำว่า "Success" ⇒ เช่นกัน
   ⇒ ใบที่ยังค้างจริงจะ **ไม่ถูกกัน** แล้วตัวยิงจะดันสต็อกทั้งที่ของยังไม่ได้ส่ง
   🔑 บรรทัดถัดไปในไฟล์นี้เคยระวังรูปนี้แล้วกับ Paid/Unpaid — แต่ไม่ได้ระวังกับสำเร็จ/ไม่สำเร็จ
      ⇒ "ระวังแล้วที่หนึ่ง" ไม่เท่ากับ "ระวังครบทั้งคลาส" [[fix-whole-bug-class]]
   ⚠️ ค่าจริงในกระจกวันนี้เป็นอังกฤษล้วน (Success/Voided/Pending/Waiting) ⇒ **ยังไม่เกิด**
      แต่จะเกิดวันที่ออเดอร์มาร์เก็ตเพลสเข้ามาพร้อมสถานะไทย ⇒ นี่คือของที่ถูกโดยบังเอิญ
      [[correct-by-accident]] · "ยังไม่พัง" ไม่ใช่ "ไม่ต้องแก้" */
const NOTDONE =
  `(o.status NOT LIKE '%Success%' OR o.status LIKE '%unsuccess%')
   AND (o.status NOT LIKE '%สำเร็จ%' OR o.status LIKE '%ไม่สำเร็จ%')`;
/* 🟢 **ตัวนี้มีรูปเดียวกับ NOTDONE แต่ทิศความผิดกลับด้าน — จึงไม่แก้ โดยตั้งใจ**
   "ยกเลิกไม่สำเร็จ" มีคำว่า "ยกเลิก" ⇒ ถูกตัดออกจากกองที่จะดันสต็อก
   ⇒ ผลคือ **ไม่ดัน** ซึ่งปลอดภัยกว่าดันผิด · ต่างจาก NOTDONE ที่พลาดแล้ว **ดันสต็อกทั้งที่ของค้าง**
   🚫 ใครเห็นรูปนี้แล้วอยากใส่ `OR LIKE '%ยกเลิกไม่%'` ให้ "สมมาตร" กับ NOTDONE **ห้ามทำ**
      การทำให้สมมาตรที่นี่คือการเปิดให้ใบที่น่าสงสัยผ่านด่าน
   🔑 grep เจอรูปเดียวกัน = "ที่ต้องดู" ไม่ใช่ "ที่ต้องแก้" [[same-shape-other-direction]] */
const NOTCANCEL = `o.status NOT LIKE '%cancel%' AND o.status NOT LIKE '%void%' AND o.status NOT LIKE '%ยกเลิก%'`;
/* ⚠️ ต้องแยก Paid ออกจาก Unpaid — LIKE '%paid%' ของ SQLite ไม่สนตัวพิมพ์ ⇒ "Unpaid" ก็ตรง
   (โค้ด ?pending=1 เดิมใช้ /paid/i ซึ่งมีรูเดียวกัน — ค่าจริงในกระจกตอนนี้มีแค่ Paid/Pending/Voided จึงยังไม่เกิด) */
const PAID = `COALESCE(o.pay_status,'') LIKE '%paid%' AND COALESCE(o.pay_status,'') NOT LIKE '%unpaid%'`;

/** รหัสทั้งหมดที่ถือว่า "อยู่ในใบค้างส่ง" (รวมผลของสูตรชุดทั้งสองทิศ)
 *  @returns {{ skus: Set<string>, orders: number, lines: number } | { error: string }} */
export async function รหัสในใบค้างส่ง() {
  try {
    const lines = await coreQuery(
      `SELECT DISTINCT TRIM(i.sku) AS sku, o.id AS oid
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE ${NOTDONE} AND ${NOTCANCEL} AND ${PAID} AND COALESCE(TRIM(i.sku),'') <> ''`
    );
    const skus = new Set(lines.map((r) => String(r.sku)));
    const orders = new Set(lines.map((r) => String(r.oid))).size;
    if (skus.size) {
      // สูตรชุด — ตารางอาจยังไม่มี (ปกติ) · ถามพังแบบอื่น ⇒ ถือว่าอ่านไม่ครบ
      const rec = await coreQuery(`SELECT bundle_sku AS b, sku AS base FROM bundle_items`).catch((e) => {
        if (/no such table/i.test(String(e?.message || e))) return [];
        throw e;
      });
      const baseOf = new Map();
      const bundlesOf = new Map();
      for (const r of rec) {
        const b = String(r.b).trim(); const base = String(r.base).trim();
        if (!baseOf.has(b)) baseOf.set(b, []);
        baseOf.get(b).push(base);
        if (!bundlesOf.has(base)) bundlesOf.set(base, []);
        bundlesOf.get(base).push(b);
      }
      const เพิ่ม = new Set();
      for (const s of skus) {
        for (const base of baseOf.get(s) || []) เพิ่ม.add(base);         // ชุดค้าง ⇒ ชิ้นส่วนค้าง
      }
      for (const s of [...skus, ...เพิ่ม]) {
        for (const b of bundlesOf.get(s) || []) เพิ่ม.add(b);           // ชิ้นส่วนค้าง ⇒ ชุดที่ใช้ชิ้นนั้นค้าง
      }
      for (const s of เพิ่ม) skus.add(s);
    }
    return { skus, orders, lines: lines.length };
  } catch (e) {
    return { error: `อ่านใบค้างส่งไม่ได้: ${String(e?.message || e).slice(0, 160)}` };
  }
}

/** ตัดสินรายแถวของแผน — คืน null = ยิงได้ · คืนข้อความ = ไม่ยิง (not_sent) พร้อมเหตุผล
 *  @param r      แถวแผน { sku, kind, from, to }
 *  @param ctx    { ค้างส่ง: Set<string>, allowClose: boolean, confirmReopen: Set<string> } */
export function ด่านบนชั้น(r, { ค้างส่ง, allowClose = false, confirmReopen = new Set() }) {
  if (!(ค้างส่ง instanceof Set)) return "ไม่มีรายการใบค้างส่ง — ตรวจด่าน ⑧ ไม่ได้ ไม่ยิง";
  if (ค้างส่ง.has(String(r.sku))) return `อยู่ในใบค้างส่ง (ด่าน ⑧) — ของบนชั้นอาจหยิบไม่ได้ ห้ามยิงอัตโนมัติ`;
  if (r.kind === "reopen" && !confirmReopen.has(String(r.sku))) {
    return `เปิดขายคืน (reopen ${r.from}→${r.to}) ต้องมีคนยืนยันรายรหัสใน confirmReopen (ด่าน ⑥)`;
  }
  if ((r.kind === "close" || r.kind === "down") && !allowClose) {
    return `ทิศลง (${r.kind} ${r.from}→${r.to}) ต้องสั่งแยกด้วย allowClose:true`;
  }
  return null;
}
