// ท่อ "ของเข้า-ของออก" ของคลังเงา — บันทึกการเคลื่อนไหวสต็อกที่ไม่ได้มาจากออเดอร์
//
// ทำไมต้องมี: คลังเราคิดสต็อกจาก "ภาพถ่ายวันฐาน − ที่ขายไป" ซึ่งขาดครึ่งหนึ่งของความจริง —
// ของที่ซื้อเข้ามาใหม่ · โอนระหว่างสาขา · ของเสีย · นับสต็อกแล้วปรับ ไม่มีทางเข้าระบบเลย
// ปล่อยไว้ = คลังเราเพี้ยนสะสมขึ้นเรื่อย ๆ ต่อให้เทียบกับ ZORT ทุกวันก็ไม่ช่วย
// (ภรรยาชี้จุดนี้เอง 2 ก.ย. 2569 — ถูกต้อง)
//
// ⚠️ ยิงซ้ำได้ ไม่เบิ้ล — กันด้วยดัชนี UNIQUE(reason, ref, sku) ที่ฐานข้อมูล
//    ไม่ใช่กันด้วยการเช็คก่อนเขียน (สองคนยิงพร้อมกันแล้วรอด กติกาเดียวกับตัวนับคนเข้าเว็บ)
// ⚠️ ทุกใบต้องมี ref เสมอ — ref คือ "ใบนี้คือใบไหน" (เลขใบสั่งซื้อ · เลขใบโอน · รอบนับสต็อก)
//    ไม่มี ref = กันซ้ำไม่ได้ = กดปุ่มสองครั้งแล้วของเข้าคลังสองรอบ
import { coreQuery, coreReady } from "./coredb.mjs";

const esc = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;

// เหตุผลที่รับได้ — จำกัดไว้เพื่อให้รายงานจัดกลุ่มได้ และกันพิมพ์มั่วจนแยกไม่ออก
export const REASONS = {
  receive: "รับของเข้า",
  transfer_in: "โอนเข้า",
  transfer_out: "โอนออก",
  adjust: "ปรับยอดจากการนับสต็อก",
  damage: "ของเสีย/ชำรุด",
  return_in: "ลูกค้าคืนของ",
};

/** บันทึกการเคลื่อนไหวหลายรายการในครั้งเดียว — คืนจำนวนที่เขียนจริง/ที่เป็นของซ้ำ */
export async function applyMoves(list) {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  if (!Array.isArray(list) || !list.length) return { error: "ไม่มีรายการส่งมา" };
  if (list.length > 500) return { error: "ครั้งละไม่เกิน 500 รายการ" };

  const rows = [];
  const bad = [];
  for (const m of list) {
    const sku = String(m?.sku ?? "").trim();
    const qty = Number(m?.qty);
    const reason = String(m?.reason ?? "").trim();
    const ref = String(m?.ref ?? "").trim();
    if (!sku) bad.push({ m, why: "ไม่มี sku" });
    else if (!Number.isFinite(qty) || qty === 0) bad.push({ sku, why: "qty ต้องเป็นตัวเลขและไม่เท่ากับ 0" });
    else if (!REASONS[reason]) bad.push({ sku, why: `reason ต้องเป็นหนึ่งใน ${Object.keys(REASONS).join("/")}` });
    else if (!ref) bad.push({ sku, why: "ต้องมี ref เสมอ (กันยิงซ้ำแล้วของเข้าสองรอบ)" });
    else rows.push({ sku, qty, reason, ref });
  }
  if (!rows.length) return { error: "ไม่มีรายการที่ใช้ได้", bad };

  // ถามยอดก่อน-หลัง เพื่อบอกได้ว่าเขียนจริงกี่แถว (D1 REST ไม่คืน changes มาให้)
  const before = Number((await coreQuery(`SELECT COUNT(*) c FROM stock_moves`))[0]?.c ?? 0);
  for (let i = 0; i < rows.length; i += 80) {
    const values = rows
      .slice(i, i + 80)
      .map((r) => `(${esc(r.sku)},${r.qty},${esc(r.reason)},${esc(r.ref)},datetime('now'))`)
      .join(",");
    // OR IGNORE = ใบเดิมยิงซ้ำก็เงียบ ไม่ error ไม่เบิ้ล (พึ่งดัชนี UNIQUE ที่ฐาน)
    await coreQuery(
      `INSERT OR IGNORE INTO stock_moves (sku,qty,reason,ref,at) VALUES ${values}`
    );
  }
  const after = Number((await coreQuery(`SELECT COUNT(*) c FROM stock_moves`))[0]?.c ?? 0);
  const added = after - before;
  return { sent: rows.length, added, duplicate: rows.length - added, bad: bad.length ? bad : undefined };
}

/** รายการเคลื่อนไหวล่าสุด — ให้หน้าจอปรับสต็อกเอาไปโชว์ประวัติ */
export async function listMoves({ sku = "", limit = 50, offset = 0 } = {}) {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);
  const where = sku ? `WHERE sku = ${esc(String(sku).trim())}` : "";
  const rows = await coreQuery(
    `SELECT id, sku, qty, reason, ref, at FROM stock_moves ${where}
     ORDER BY id DESC LIMIT ${lim} OFFSET ${off}`
  );
  const total = Number(
    (await coreQuery(`SELECT COUNT(*) c FROM stock_moves ${where}`))[0]?.c ?? 0
  );
  return { total, limit: lim, offset: off, reasons: REASONS, rows };
}
