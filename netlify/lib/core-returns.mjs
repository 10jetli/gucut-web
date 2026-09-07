// จอรับคืนสินค้าหน้าร้าน — ท่อฝั่งเซิร์ฟเวอร์ (7 ก.ย. 2569)
//
// เจ้าของร้านสั่ง: "พนักงานหน้าร้านรอรับสินค้าพร้อมถ่ายรูปยืนยัน แล้วให้พนักงานดูว่า
// สินค้าเสียหายไหม พร้อมนำมาจำหน่ายได้ไหม"
//
// สัญญาข้อมูลอยู่ที่ `~/gucut-next/lib/returns-api.ts` **ที่เดียว** — ไฟล์นี้ต้องตอบตามนั้นเป๊ะ
// ที่มาของกติกา: เวทีถกสามเสียง #2 (ล็อก) · #3-#4 (ตัววัด) ใน ~/claude-shared/debate/
//
// ⚠️ **`returns_desk` ≠ `return_orders`** — คนละเรื่องกันคนละตาราง
//    `return_orders` = กระจกใบคืนจาก ZORT (ของที่ ZORT ออกเลขให้แล้ว)
//    `returns_desk`  = ของที่พนักงาน**หน้าเคาน์เตอร์เรา**รับเข้ามาเอง ยังไม่มีใครออกเลขให้
//    เอาสองอันมา join กันมั่ว = ได้ผลสุดขั้ว 0%/100% แล้วสรุปผิดทั้งกระดาน
//    (ตั้งชื่อยาวหน่อยโดยตั้งใจ เพื่อให้คนรอบหน้าสะดุดก่อนพิมพ์ผิด)
//
// 🔴 **ของเสียไม่ได้ทำให้สต็อกลดอีกรอบ** — ดูเหตุผลเต็มที่ `moveRowsFor()` ข้างล่าง
// 🔴 **ตัวตนพนักงานมาจาก header `x-staff-pin` เท่านั้น ห้ามรับชื่อจาก body**
// 🔴 **รูปนับจากจำนวนคีย์ใน Blobs ไม่ใช่ตัวนับที่บวกเอง**
import { getStore } from "@netlify/blobs";
import { coreQuery, coreReady } from "./coredb.mjs";
import { findByPin } from "./attendance.mjs";

const esc = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;
const photoStore = () => getStore({ name: "gucut-returns", consistency: "strong" });

const OPEN_STATES = ["received", "graded", "move_failed"];
const VERDICTS = new Set(["return_in", "damage"]);
const TAKEOVER_REASONS = new Set(["shift-change", "unreachable", "other"]);
// ช่องที่ q ของกล่องใบคืนค้น — **ส่งกลับไปกับคำตอบทุกครั้ง** จอจะได้ไม่ต้องเดา
const Q_FIELDS = ["return_id", "ref", "order_number", "customer", "quarantine_no"];

let ready = false;
async function ensureTables() {
  if (ready) return;
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS returns_desk (
       return_id TEXT PRIMARY KEY,
       ref TEXT NOT NULL UNIQUE,
       state TEXT NOT NULL,
       unmatched INTEGER NOT NULL DEFAULT 0,
       quarantine_no TEXT,
       order_id TEXT, order_number TEXT, customer TEXT,
       unmatched_note TEXT, no_photo_reason TEXT,
       photo_count INTEGER NOT NULL DEFAULT 0,
       staff TEXT, locked_by TEXT, lock_since TEXT,
       cancel_reason TEXT, cancelled_by TEXT, cancelled_at TEXT,
       created_at TEXT DEFAULT (datetime('now')),
       last_activity_at TEXT DEFAULT (datetime('now')))`
  );
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_rdesk_order ON returns_desk(order_id)`);
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_rdesk_state ON returns_desk(state)`);
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS returns_desk_items (
       return_id TEXT NOT NULL, line INTEGER NOT NULL,
       sku TEXT, name TEXT, qty REAL NOT NULL DEFAULT 0,
       verdict TEXT, note TEXT, move_result TEXT,
       PRIMARY KEY (return_id, line))`
  );
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_rdesk_items_sku ON returns_desk_items(sku)`);
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS returns_desk_takeovers (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       return_id TEXT NOT NULL, at TEXT DEFAULT (datetime('now')),
       from_staff TEXT, to_staff TEXT, reason TEXT NOT NULL, note TEXT)`
  );
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_rdesk_tk ON returns_desk_takeovers(return_id)`);
  /* ⚠️ ตารางอาจถูกสร้างไปแล้วตั้งแต่ก่อนมีสามคอลัมน์นี้ (D1 จริงสร้างรอบแรกไปแล้ว)
     `CREATE TABLE IF NOT EXISTS` **ไม่เติมคอลัมน์ให้ตารางที่มีอยู่** ⇒ ต้อง ALTER ตามเสมอ
     ล้มก็ข้าม (แปลว่ามีอยู่แล้ว) — นี่คือทางเดียวที่ schema จะตามทันโดยไม่ต้องลบตาราง */
  for (const col of ["cancel_reason TEXT", "cancelled_by TEXT", "cancelled_at TEXT"]) {
    await coreQuery(`ALTER TABLE returns_desk ADD COLUMN ${col}`).catch(() => {});
  }
  ready = true;
}

/* ── ตัวตนพนักงาน ────────────────────────────────────────────────────────────
   🔴 **ห้ามรับชื่อพนักงานจาก body เด็ดขาด** — ใครก็อ้างเป็นใครก็ได้
      คลาสเดียวกับที่ `/api/push` ห้ามรับเบอร์จาก body (ฝั่งจอชี้เองตอนร่างสัญญา)
   PIN เป็นของระบบลงเวลาอยู่แล้ว ⇒ ไม่ต้องสร้างระบบตัวตนใหม่ให้มีสองที่ให้หลุด    */
export async function staffFromReq(req) {
  const pin = req?.headers?.get?.("x-staff-pin") || "";
  if (!pin) return null;
  const emp = await findByPin(pin);
  return emp ? { id: emp.id, name: emp.name || `พนักงาน ${emp.id}` } : null;
}

const needStaff = (staff) =>
  staff ? null : { error: "ต้องใส่ PIN พนักงานก่อน (ใช้ PIN เดียวกับหน้าลงเวลา)" };

/* ── ด่านล็อก: คนที่ไม่ได้ถือใบ **เขียนไม่ได้** ────────────────────────────────
   🔴 **ทุกเส้นที่เขียนใบต้องผ่านตัวนี้ ยกเว้น takeover (ซึ่งมีไว้แย่งโดยเปิดเผย)**
   บทเรียน 8 ก.ย. 2569: เดิมกันแค่ตอน `receive` ⇒ พนักงานอีกคนเปิดใบขึ้นมา
   แล้วยิง `?return-grade=1` ตรง ๆ **ผ่านฉลุย ตอบ moved** ไม่มีบันทึกการรับช่วงเลย
   = การแย่งเงียบที่ทั้งเวทีถกออกแบบมากันพอดี · ฝั่งจอจับได้ตอนยิงประกบ
   ⇒ **ล็อกที่กันแค่ประตูบานแรก ไม่ใช่ล็อก** ประตูอื่นเปิดโล่งอยู่

   คืน `blocked: true` (ไม่ใช่ `error`) โดยตั้งใจ — จอต้องได้ `lockedBy` ไปวาดแผงรับช่วงต่อ
   ถ้าคืนเป็น error ตัวเรียกฝั่งจอจะ throw แล้ว**ข้อมูลว่าใครถืออยู่หายไปกับ Error**
   ⚠️ `blocked` เป็นฟิลด์ความหมายเดียว ห้ามให้จอไปอ่านข้อความอธิบายเพื่อตัดสินใจแทน */
function lockBlock(row, staff) {
  const holder = row?.locked_by;
  if (!holder || holder === staff.name) return null;
  return { blocked: true, lockedBy: holder, lockSince: row.lock_since };
}

/* ── คงเหลือคืนได้ต่อ SKU ────────────────────────────────────────────────────
   ขายไปเท่าไหร่ ลบด้วยของที่ **ยืนยันว่าลงบัญชีแล้ว** (มี move_result)
   ⚠️ **นับเฉพาะที่มี move_result** ไม่ใช่ทุกใบที่เปิดค้าง — ใบที่เปิดทิ้งไว้แล้วไม่จบ
      ไม่ควรกินโควตาคืนของคนอื่นตลอดกาล · ส่วนกันสองคนทำใบเดียวกันพร้อมกัน
      เป็นหน้าที่ของ "ล็อกที่ orderId" ไม่ใช่หน้าที่ของตัวเลขนี้ (คนละด่าน อย่ายุบรวม) */
export async function remainingFor(orderId) {
  const id = String(orderId ?? "").trim();
  if (!id) return {};
  const sold = await coreQuery(
    `SELECT sku, SUM(qty) q FROM order_items WHERE order_id = ${esc(id)} AND sku IS NOT NULL AND sku <> '' GROUP BY sku`
  );
  const back = await coreQuery(
    `SELECT i.sku sku, SUM(i.qty) q
       FROM returns_desk_items i JOIN returns_desk d ON d.return_id = i.return_id
      WHERE d.order_id = ${esc(id)} AND i.move_result IS NOT NULL
      GROUP BY i.sku`
  );
  const used = new Map(back.map((r) => [String(r.sku), Number(r.q) || 0]));
  const out = {};
  for (const r of sold) {
    const sku = String(r.sku);
    out[sku] = Math.max(0, (Number(r.q) || 0) - (used.get(sku) || 0));
  }
  return out;
}

/* ── แถวบัญชีสต็อกของหนึ่งชิ้น ───────────────────────────────────────────────
   🔴 **จุดที่ตัดสินว่าสต็อกจะถูกหรือผิด — อ่านให้จบก่อนแก้**

   ของที่ขายออกไปแล้ว **ถูกตัดสต็อกไปตั้งแต่ตอนขาย**
   ⇒ ของที่ลูกค้าคืนกลับมา ต้องบวกกลับเข้าคลังก่อนเสมอ (`return_in` +qty)

   ของที่ **ชำรุดจนขายต่อไม่ได้** จึงต้องตัดออกอีกทีในฐานะของเสีย (`damage` −qty)
   ⇒ ผลรวมของสองแถวนี้ = 0 บนสต็อกที่ขายได้ **ซึ่งถูกต้อง** เพราะของกลับมาจริง
      แต่ขายต่อไม่ได้จริง · และประวัติยังอ่านออกว่า "คืนมากี่ชิ้น ตัดทิ้งกี่ชิ้น"

   ❌ **ห้ามบันทึกของเสียเป็น `damage` −qty เฉย ๆ โดยไม่มี `return_in` +qty คู่กัน**
      นั่นคือการตัดสต็อกซ้ำสองรอบจากการขายครั้งเดียว — สต็อกจะขาดไปเรื่อย ๆ
      แบบที่ไม่มีตัวตรวจไหนจับได้ เพราะทุกแถวดูสมเหตุสมผลเมื่อดูทีละแถว
   ❌ **ห้ามบันทึกของเสียเป็น `return_in` +qty เฉย ๆ** — ของขายไม่ได้จะไปโผล่ในของขายได้

   ⚠️ ทั้งสองแถวใช้ `ref` เดียวกันแต่คนละ `reason` ⇒ ดัชนี UNIQUE(reason,ref,sku)
      ยังกันยิงซ้ำได้ครบทั้งคู่ · **ห้ามเปลี่ยนไปใช้ ref คนละตัว** จะกันซ้ำไม่ได้อีก    */
function moveRowsFor(item, ref) {
  const base = { sku: item.sku, ref, qty: item.qty };
  if (item.verdict === "return_in") return [{ ...base, reason: "return_in" }];
  return [
    { ...base, reason: "return_in" },
    { ...base, reason: "damage", qty: -item.qty },
  ];
}

/* ── ยิงเข้าบัญชีสต็อกแบบรู้ผลรายชิ้น ────────────────────────────────────────
   `applyMoves()` ในไฟล์ stock-moves คืนผล**รวม** (sent/added/duplicate)
   แต่สัญญาต้องการ `moveResult` **รายชิ้น** ⇒ ทำเองที่นี่: อ่านว่าคีย์ไหนมีอยู่ก่อน
   → INSERT OR IGNORE → อ่านซ้ำ → ชิ้นที่ครบทุกแถวถือว่าลงแล้ว
   ⚠️ **ต้องอ่านซ้ำหลังเขียนจริง ห้ามเดาว่าเขียนสำเร็จ** — ชิ้นที่หายไปคือของจริงที่ยัง
      ไม่ลง ⇒ ใบกลายเป็น `move_failed` ให้คนกดยิงซ้ำได้ ดีกว่าบอกว่า `moved` แล้วโกหก */
async function fireMoves(items, ref) {
  const rows = items.flatMap((it) => moveRowsFor(it, ref));
  if (!rows.length) return new Map();

  const keyOf = (r) => `${r.reason} ${r.sku}`;
  const skus = [...new Set(rows.map((r) => r.sku))].map(esc).join(",");
  const seen = async () => {
    const got = await coreQuery(
      `SELECT reason, sku FROM stock_moves WHERE ref = ${esc(ref)} AND sku IN (${skus})`
    );
    return new Set(got.map((r) => `${r.reason} ${r.sku}`));
  };

  const before = await seen();
  const values = rows
    .map((r) => `(${esc(r.sku)},${r.qty},${esc(r.reason)},${esc(ref)},datetime('now'))`)
    .join(",");
  await coreQuery(
    `INSERT OR IGNORE INTO stock_moves (sku,qty,reason,ref,at) VALUES ${values}`
  );
  const after = await seen();

  // รายชิ้น: ลงครบทุกแถวไหม · ถ้าครบ เป็นของใหม่หรือของเดิม
  const result = new Map();
  for (const it of items) {
    const mine = moveRowsFor(it, ref);
    const allThere = mine.every((r) => after.has(keyOf(r)));
    if (!allThere) continue;                       // ยังไม่ครบ = ไม่ตั้ง moveResult
    const allOld = mine.every((r) => before.has(keyOf(r)));
    result.set(it.sku, allOld ? "duplicate" : "added");
  }
  return result;
}

/* ── อ่านใบเดียว ────────────────────────────────────────────────────────────── */
async function loadDoc(returnId) {
  const id = String(returnId ?? "").trim();
  if (!id) return null;
  const row = (await coreQuery(`SELECT * FROM returns_desk WHERE return_id = ${esc(id)}`))[0];
  if (!row) return null;
  const [items, takeovers] = await Promise.all([
    coreQuery(
      `SELECT line, sku, name, qty, verdict, note, move_result FROM returns_desk_items
        WHERE return_id = ${esc(id)} ORDER BY line`
    ),
    coreQuery(
      `SELECT at, from_staff, to_staff, reason, note FROM returns_desk_takeovers
        WHERE return_id = ${esc(id)} ORDER BY id`
    ),
  ]);
  return shape(row, items, takeovers);
}

function shape(row, items, takeovers) {
  const doc = {
    returnId: row.return_id,
    ref: row.ref,
    state: row.state,
    unmatched: !!Number(row.unmatched),
    items: (items || []).map((i) => ({
      sku: i.sku || "",
      ...(i.name ? { name: i.name } : {}),
      qty: Number(i.qty) || 0,
      ...(i.verdict ? { verdict: i.verdict } : {}),
      ...(i.note ? { note: i.note } : {}),
      ...(i.move_result ? { moveResult: i.move_result } : {}),
    })),
  };
  if (row.quarantine_no) doc.quarantineNo = row.quarantine_no;
  if (row.order_id) doc.orderId = row.order_id;
  if (row.order_number) doc.orderNumber = row.order_number;
  if (row.customer) doc.customer = row.customer;
  if (row.locked_by) doc.lockedBy = row.locked_by;
  if (row.lock_since) doc.lockSince = row.lock_since;
  if (row.staff) doc.staff = row.staff;
  if (row.created_at) doc.createdAt = row.created_at;
  if (row.last_activity_at) doc.lastActivityAt = row.last_activity_at;
  if (row.no_photo_reason) doc.noPhotoReason = row.no_photo_reason;
  if (row.cancel_reason) doc.cancelReason = row.cancel_reason;
  if (row.cancelled_by) doc.cancelledBy = row.cancelled_by;
  if (row.cancelled_at) doc.cancelledAt = row.cancelled_at;
  doc.photoCount = Number(row.photo_count) || 0;
  if (takeovers?.length) {
    doc.takeovers = takeovers.map((t) => ({
      at: t.at,
      ...(t.from_staff ? { from: t.from_staff } : {}),
      ...(t.to_staff ? { to: t.to_staff } : {}),
      reason: t.reason,
      ...(t.note ? { note: t.note } : {}),
    }));
  }
  return doc;
}

export async function getReturn(returnId) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await ensureTables();
  const doc = await loadDoc(returnId);
  return doc ? { doc } : { error: `ไม่พบใบคืน ${returnId}` };
}

/* ── กล่องใบคืน (จอแอดมิน) ───────────────────────────────────────────────────
   ⚠️ **ไม่ส่ง `reconHeartbeatAt` เพราะยังไม่มีงานเทียบใบคืนจริง ๆ อยู่**
      สัญญาให้จอขึ้นว่า "ตัววัดตาบอดอยู่" เมื่อไม่มีค่านี้ — **ซึ่งเป็นความจริงตอนนี้**
      🚫 ห้ามใส่ `new Date()` ลงไปให้จอเขียว นั่นคือการทำให้ตัววัดโกหกด้วยมือตัวเอง
      วันที่มีงานเทียบจริงแล้วค่อยส่งเวลารอบล่าสุดของงานนั้นมา (ดู [[metrics-need-outside-leg]]) */
export async function listReturnsInbox({ q = "", limit = 50, offset = 0 } = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await ensureTables();
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);
  const term = String(q ?? "").trim();
  const where = term
    ? `WHERE (${Q_FIELDS.map((f) => `${f} LIKE ${esc(`%${term}%`)}`).join(" OR ")})`
    : "";
  const rows = await coreQuery(
    `SELECT * FROM returns_desk ${where} ORDER BY last_activity_at DESC LIMIT ${lim} OFFSET ${off}`
  );
  const total = Number(
    (await coreQuery(`SELECT COUNT(*) c FROM returns_desk ${where}`))[0]?.c ?? 0
  );
  let items = [];
  if (rows.length) {
    const ids = rows.map((r) => esc(r.return_id)).join(",");
    items = await coreQuery(
      `SELECT return_id, line, sku, name, qty, verdict, note, move_result
         FROM returns_desk_items WHERE return_id IN (${ids}) ORDER BY return_id, line`
    );
  }
  const byId = new Map();
  for (const i of items) {
    if (!byId.has(i.return_id)) byId.set(i.return_id, []);
    byId.get(i.return_id).push(i);
  }
  /* ประวัติการรับช่วงต้องมากับกล่องด้วย — ข้อสังเคราะห์เวที #2 คือ
     "ทุกการรับช่วงโผล่บนจอแอดมินเป็นรายการแยก" ⇒ ถ้าส่งเฉพาะตอนเปิดใบเดี่ยว
     แผงรายการรับช่วงของแอดมินจะ**ว่างตลอดกาล** แล้วดูเหมือนไม่เคยมีใครแย่งใบเลย
     ซึ่งคือภาพที่ตรงข้ามกับความจริงพอดี (ฝั่งจอชี้เอง 8 ก.ย. 2569) */
  const byTk = new Map();
  if (rows.length) {
    const ids = rows.map((r) => esc(r.return_id)).join(",");
    const tks = await coreQuery(
      `SELECT return_id, at, from_staff, to_staff, reason, note FROM returns_desk_takeovers
        WHERE return_id IN (${ids}) ORDER BY return_id, id`
    );
    for (const t of tks) {
      if (!byTk.has(t.return_id)) byTk.set(t.return_id, []);
      byTk.get(t.return_id).push(t);
    }
  }
  /* ⚠️ **บอกไปเลยว่า q ค้นช่องไหน** — ฝั่งจอทักว่าสัญญาไม่เคยระบุ เลยต้องเดาหรือเลิกใช้
     เขียนไว้ในเอกสารก็ได้ แต่เอกสาร**เก่าค้างได้เงียบ ๆ** ส่วนค่านี้มาจากรายการเดียว
     กับที่ WHERE ใช้จริง ⇒ วันที่มีคนเพิ่ม/ลดช่องค้น จอรู้ทันทีโดยไม่ต้องมีใครไปตามแก้ */
  return {
    rows: rows.map((r) => shape(r, byId.get(r.return_id) || [], byTk.get(r.return_id))),
    total, limit: lim, offset: off, qFields: Q_FIELDS,
  };
}

/* ── เลขกักของกอง unmatched ──────────────────────────────────────────────────
   เรียงลำดับโดยตั้งใจ (เวที #4): เลขหาย = มีใบที่ถูกลบ/ไม่จบ **ช่องว่างประกาศตัวเอง**
   ถ้าใช้เลขสุ่ม จะไม่มีใครรู้เลยว่าหายไปกี่ใบ                                     */
async function nextQuarantineNo() {
  const r = await coreQuery(
    `SELECT MAX(CAST(SUBSTR(quarantine_no, 3) AS INTEGER)) m FROM returns_desk
      WHERE quarantine_no IS NOT NULL AND quarantine_no LIKE 'Q-%'`
  );
  return `Q-${String((Number(r[0]?.m) || 0) + 1).padStart(6, "0")}`;
}

const newReturnId = () =>
  `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ── ขั้นรับของ ─────────────────────────────────────────────────────────────── */
export async function receiveReturn(body, staff) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const no = needStaff(staff);
  if (no) return no;
  await ensureTables();

  const unmatched = !!body?.unmatched || !body?.orderId;
  const raw = Array.isArray(body?.items) ? body.items : [];
  /* 🔴 **หนึ่ง SKU = หนึ่งบรรทัดต่อใบ — ต้องรวมจำนวนก่อนเก็บ**
     ถ้าปล่อยให้ SKU เดียวมีสองบรรทัด (จอส่งมาซ้ำ/สแกนสองครั้ง) จะพังเงียบ ๆ สองชั้น:
       ① ตอน grade คำตัดสันเก็บเป็น Map ตาม sku ⇒ บรรทัดหลังกลืนบรรทัดแรก
       ② ตอนยิงเข้าบัญชี ดัชนี UNIQUE(reason,ref,sku) ยอมให้แถวเดียว
          ⇒ ของเข้าคลัง **น้อยกว่าที่รับมาจริง** โดยจอขึ้นเขียวว่า "เข้าสต็อกแล้ว"
     รวมที่นี่จุดเดียว = ไม่ต้องไปกันซ้ำอีกสามที่ข้างล่าง                              */
  const merged = new Map();
  for (const it of raw.slice(0, 200)) {
    const qty = Number(it?.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const sku = String(it?.sku ?? "").trim();
    // ⚠️ ใบ unmatched อนุญาต sku ว่างได้ (ของที่ระบุรหัสไม่ได้หน้าเคาน์เตอร์)
    //    แต่ใบที่ผูกใบขายแล้วต้องมี sku เสมอ ไม่งั้นตอน grade จะยิงเข้าสต็อกไม่ได้
    if (!sku && !unmatched) continue;
    const name = String(it?.name ?? "").trim();
    // ของไม่มีรหัส (ใบ unmatched) แยกบรรทัดตามชื่อ — รวมกันไม่ได้ คนละชิ้นกัน
    const key = sku || ` ${name} ${merged.size}`;
    const prev = merged.get(key);
    if (prev) prev.qty += qty;
    else merged.set(key, { sku, name, qty });
  }
  const items = [...merged.values()];
  if (!items.length) return { error: "ไม่มีรายการสินค้าที่รับเข้ามา" };

  if (unmatched) {
    const qn = await nextQuarantineNo();
    const returnId = newReturnId();
    const ref = `RT-U${qn}`;
    await coreQuery(
      `INSERT INTO returns_desk (return_id, ref, state, unmatched, quarantine_no,
         unmatched_note, no_photo_reason, staff, locked_by, lock_since)
       VALUES (${esc(returnId)}, ${esc(ref)}, 'received', 1, ${esc(qn)},
         ${esc(body?.unmatchedNote ?? "")}, ${body?.noPhotoReason ? esc(body.noPhotoReason) : "NULL"},
         ${esc(staff.name)}, ${esc(staff.name)}, datetime('now'))`
    );
    await fillNames(items, null);
    await insertItems(returnId, items);
    // 🔴 ใบ unmatched **ไม่เข้าสต็อก**จนกว่าแอดมินจะผูกใบขาย/อนุมัติ — ไม่มี remaining ให้บอก
    return { returnId, ref, state: "received", quarantineNo: qn };
  }

  const orderId = String(body.orderId).trim();
  const order = (
    await coreQuery(`SELECT id, number, customer FROM orders WHERE id = ${esc(orderId)}`)
  )[0];
  if (!order) return { error: `ไม่พบใบขาย ${orderId} ในคลังเงา` };

  /* ล็อกที่ **orderId** ไม่ใช่ returnId (ข้อสรุปเวที #2)
     เพราะสิ่งที่ต้องกันชนคือ "ใบขาย" — ล็อกที่ returnId มาช้าไปหนึ่งจังหวะ
     พนักงานสองคนจะได้ returnId คนละใบแล้วต่างคนต่างรับของใบเดียวกัน */
  const open = (
    await coreQuery(
      `SELECT * FROM returns_desk WHERE order_id = ${esc(orderId)}
         AND state IN (${OPEN_STATES.map(esc).join(",")}) ORDER BY created_at LIMIT 1`
    )
  )[0];
  if (open) {
    const doc = await loadDoc(open.return_id);
    const mine = open.locked_by === staff.name;
    return {
      returnId: open.return_id,
      ref: open.ref,
      state: open.state,
      existing: true,
      ...(mine ? {} : { lockedBy: open.locked_by, lockSince: open.lock_since }),
      remaining: await remainingFor(orderId),
      doc,
    };
  }

  /* ── โควตาคืน: ตรวจตั้งแต่ **ขั้นรับ** ไม่ใช่ไปรอตกที่ขั้นประเมิน ──────────
     เดิมผมปล่อยผ่านขั้นนี้แล้วไปดักที่ grade ด้วยเหตุผลว่า "ด่านจริงอยู่ที่จุดเขียน"
     ⇒ ด่านนั้นทำงานถูก **แต่สร้างใบทางตัน**: รับ ×3 ทั้งที่คืนได้ 2
       ใบนั้น grade ไม่มีวันผ่าน แก้จำนวนก็ไม่ได้ แล้วค้างเป็นใบเปิดของใบขายนั้นตลอดกาล
       (ฝั่งจอเจอตอนยิงประกบ 8 ก.ย. 2569 — ด่านที่ถูกต้องแต่วางผิดที่ ก็สร้างของเสียได้)
     ⇒ **ต้องมีทั้งสองด่าน**: ขั้นรับกันไม่ให้เปิดใบที่เดินต่อไม่ได้
       ขั้นประเมินกันของที่เปลี่ยนไประหว่างทาง (คนอื่นคืนใบขายเดียวกันจนหมดโควตา)

     ⚠️ **ไม่ใช้ `error`** — ของอยู่ในมือพนักงานที่เคาน์เตอร์แล้ว เขาต้องรู้ว่าทำอะไรต่อได้
       ส่งตัวเลขไปให้จอเสนอทางออก: รับเท่าที่คืนได้ ส่วนที่เกินเปิดเป็น **ใบกักของ**
       (unmatched) ให้แอดมินสางทีหลัง — ซึ่งเป็นเหตุผลที่กองกักของมีอยู่ตั้งแต่แรก */
  const room = await remainingFor(orderId);
  const over = items
    .filter((it) => it.qty > (room[it.sku] ?? 0))
    .map((it) => ({ sku: it.sku, ขอคืน: it.qty, คืนได้: room[it.sku] ?? 0 }));
  if (over.length) return { overQuota: true, over, remaining: room, orderNumber: order.number };

  // ใบรอบสองของใบขายเดิม — ตั้งใจให้ ref ต่างกัน จะได้ไม่ถูกดัชนี UNIQUE กลืนเป็นใบเดิม
  const used = await coreQuery(
    `SELECT ref FROM returns_desk WHERE order_id = ${esc(orderId)}`
  );
  const base = `RT-${order.number || orderId}`;
  let ref = base;
  for (let n = 2; used.some((u) => u.ref === ref); n += 1) ref = `${base}-${n}`;

  const returnId = newReturnId();
  await coreQuery(
    `INSERT INTO returns_desk (return_id, ref, state, unmatched, order_id, order_number,
       customer, no_photo_reason, staff, locked_by, lock_since)
     VALUES (${esc(returnId)}, ${esc(ref)}, 'received', 0, ${esc(orderId)},
       ${esc(order.number ?? "")}, ${esc(order.customer ?? "")},
       ${body?.noPhotoReason ? esc(body.noPhotoReason) : "NULL"},
       ${esc(staff.name)}, ${esc(staff.name)}, datetime('now'))`
  );
  await fillNames(items, orderId);
  await insertItems(returnId, items);
  return {
    returnId,
    ref,
    state: "received",
    remaining: await remainingFor(orderId),
  };
}

/* เติมชื่อสินค้าให้บรรทัดที่จอไม่ได้ส่งชื่อมา — จอ inbox จะได้ไม่ขึ้นขีดเปล่า ๆ
   เอาชื่อ **จากใบขาย** ก่อนเสมอ (ชื่อ ณ วันที่ขาย) แล้วค่อยถอยไปตารางสินค้า
   ⚠️ ชื่อเป็นของประดับสำหรับให้คนอ่านออกเท่านั้น — **ทุกอย่างที่ตัดสินใจยังยึด sku**
      ห้ามเอาชื่อไปจับคู่สินค้าเด็ดขาด ชื่อซ้ำกันได้และเปลี่ยนได้ตลอดเวลา */
async function fillNames(items, orderId) {
  const need = items.filter((it) => it.sku && !it.name);
  if (!need.length) return;
  const list = need.map((it) => esc(it.sku)).join(",");
  const rows = orderId
    ? await coreQuery(
        `SELECT sku, name FROM order_items WHERE order_id = ${esc(orderId)} AND sku IN (${list})`
      )
    : [];
  const found = new Map(rows.filter((r) => r.name).map((r) => [String(r.sku), r.name]));
  const rest = need.filter((it) => !found.has(it.sku));
  if (rest.length) {
    const more = await coreQuery(
      `SELECT sku, name FROM products WHERE sku IN (${rest.map((it) => esc(it.sku)).join(",")})`
    );
    for (const r of more) if (r.name && !found.has(String(r.sku))) found.set(String(r.sku), r.name);
  }
  for (const it of need) it.name = found.get(it.sku) || "";
}

async function insertItems(returnId, items) {
  const values = items
    .map((it, i) => `(${esc(returnId)},${i + 1},${esc(it.sku)},${esc(it.name)},${it.qty})`)
    .join(",");
  await coreQuery(
    `INSERT OR REPLACE INTO returns_desk_items (return_id,line,sku,name,qty) VALUES ${values}`
  );
}

/* ── ขั้นประเมิน + ยิงเข้าสต็อกในคำขอเดียว ───────────────────────────────────
   ผัง v2: "กด 1 ครั้ง → ระบบยิง move อัตโนมัติ" — แยกสอง POST = เปิดหน้าต่างเน็ตหลุดคาอีกขั้น */
export async function gradeReturn(body, staff) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const no = needStaff(staff);
  if (no) return no;
  await ensureTables();

  const returnId = String(body?.returnId ?? "").trim();
  const row = (
    await coreQuery(`SELECT locked_by, lock_since FROM returns_desk WHERE return_id = ${esc(returnId)}`)
  )[0];
  const blocked = row && lockBlock(row, staff);
  if (blocked) return blocked;                    // คนอื่นถือใบอยู่ — จอพาไปขอรับช่วงก่อน
  const doc = await loadDoc(returnId);
  if (!doc) return { error: `ไม่พบใบคืน ${returnId}` };
  if (doc.state === "cancelled") return { error: "ใบนี้ถูกยกเลิกไปแล้ว" };
  if (doc.unmatched) {
    return { error: `ใบ ${doc.quarantineNo || returnId} ยังผูกกับใบขายไม่ได้ — ต้องให้แอดมินผูกก่อนถึงเข้าสต็อกได้` };
  }

  // ตัดสินรายชิ้นที่ส่งมา
  const sent = new Map();
  for (const it of Array.isArray(body?.items) ? body.items : []) {
    const sku = String(it?.sku ?? "").trim();
    const verdict = String(it?.verdict ?? "").trim();
    if (!sku || !VERDICTS.has(verdict)) continue;
    sent.set(sku, { verdict, note: String(it?.note ?? "").trim() });
  }
  if (!sent.size) return { error: "ต้องระบุคำตัดสินอย่างน้อยหนึ่งชิ้น (return_in หรือ damage)" };
  const missing = doc.items.filter((i) => !sent.has(i.sku)).map((i) => i.sku);
  if (missing.length) return { error: `ยังไม่ได้ตัดสินครบทุกชิ้น — ขาด ${missing.join(", ")}` };

  /* ⚠️ **ห้ามเชื่อว่าจอบังคับถ่ายรูปแล้ว** — ยิง POST ตรงข้ามจอได้เสมอ
     กติกาต้องอยู่ฝั่งเซิร์ฟเวอร์ด้วย ไม่งั้น "บังคับถ่ายรูป" เป็นแค่คำพูดบนจอ */
  if (!doc.photoCount && !doc.noPhotoReason) {
    return { error: "ต้องมีรูปยืนยันอย่างน้อย 1 รูป หรือระบุเหตุผลที่ถ่ายไม่ได้" };
  }

  /* ใบที่ลงบัญชีไปแล้ว: รับได้เฉพาะ "ชุดเดิม" (= ทางยิงซ้ำชิ้นที่ค้าง)
     ชุดใหม่ต้องปฏิเสธ — แก้คำตัดสินหลังของเข้าคลังแล้วต้องไปทาง adjust ของแอดมิน
     ⚠️ ถ้าปล่อยให้เปลี่ยนคำตัดสินได้ จะได้ `damage` ทับ `return_in` ด้วย ref เดียวกัน
        ซึ่งดัชนี UNIQUE(reason,ref,sku) **กันไม่ได้** เพราะคนละ reason ⇒ สต็อกเพี้ยนเงียบ ๆ */
  if (doc.state === "moved" || doc.state === "move_failed") {
    const differs = doc.items.filter((i) => i.verdict && sent.get(i.sku)?.verdict !== i.verdict);
    if (differs.length) {
      return {
        error: `ใบนี้ลงบัญชีไปแล้ว เปลี่ยนคำตัดสินไม่ได้ (${differs.map((d) => d.sku).join(", ")}) — ให้แอดมินปรับยอดด้วยใบ ${doc.ref}-fix แทน`,
      };
    }
  }

  /* คิด remaining **ใหม่ ณ เวลานี้เสมอ** ห้ามใช้ค่าตอน receive
     ระหว่างใบค้างอยู่ คนอื่นอาจคืนใบขายเดียวกันจนหมดโควตาไปแล้ว */
  const remaining = await remainingFor(doc.orderId);
  const over = [];
  for (const it of doc.items) {
    const already = it.moveResult ? it.qty : 0;   // ของใบนี้ที่ลงไปแล้ว ไม่นับซ้ำ
    const room = (remaining[it.sku] ?? 0) + already;
    if (it.qty > room) over.push({ sku: it.sku, ขอคืน: it.qty, คืนได้: room });
  }
  if (over.length) {
    return {
      error: "คืนเกินจำนวนที่ขายไป — ยังไม่ได้ลงบัญชีอะไรเลย",
      over,
      remaining,
    };
  }

  // บันทึกคำตัดสินก่อน แล้วค่อยยิงเข้าบัญชี
  for (const it of doc.items) {
    const v = sent.get(it.sku);
    await coreQuery(
      `UPDATE returns_desk_items SET verdict = ${esc(v.verdict)}, note = ${esc(v.note)}
        WHERE return_id = ${esc(returnId)} AND sku = ${esc(it.sku)}`
    );
    it.verdict = v.verdict;
  }
  await coreQuery(
    `UPDATE returns_desk SET state = 'graded', last_activity_at = datetime('now'),
       locked_by = ${esc(staff.name)} WHERE return_id = ${esc(returnId)}`
  );

  const results = await fireMoves(doc.items, doc.ref);
  for (const it of doc.items) {
    const r = results.get(it.sku);
    if (!r) continue;
    it.moveResult = r;
    await coreQuery(
      `UPDATE returns_desk_items SET move_result = ${esc(r)}
        WHERE return_id = ${esc(returnId)} AND sku = ${esc(it.sku)}`
    );
  }

  /* 🔴 `moved` ออกได้ต่อเมื่อ **ทุกชิ้น** มี moveResult
     ไม่มีสถานะ move_failed = ตอนยิง 5 ชิ้นสำเร็จ 3 จอจะเขียนว่า "เข้าสต็อกแล้ว" ซึ่งโกหก */
  const done = doc.items.every((i) => i.moveResult);
  const state = done ? "moved" : "move_failed";
  await coreQuery(
    `UPDATE returns_desk SET state = ${esc(state)}, last_activity_at = datetime('now'),
       locked_by = ${done ? "NULL" : esc(staff.name)},
       lock_since = ${done ? "NULL" : "lock_since"}
     WHERE return_id = ${esc(returnId)}`
  );

  return {
    returnId,
    state,
    items: doc.items,
    remaining: await remainingFor(doc.orderId),
  };
}

/* ── รูปยืนยัน ───────────────────────────────────────────────────────────────
   ⚠️ **เก็บแยกคีย์ละใบ** (`img/<returnId>/<index>`) ห้ามยัด base64 ลงแถวในฐาน
      กล่องใบคืนอ่านทุกแถว = จะกลายเป็นโหลดรูปหลายสิบเมกทุกครั้งที่เปิดหน้า
      (กติกาเดียวกับสลิป · รูปลงเวลา · ใบ ลซ.๒)
   ⚠️ **จำนวนรูปนับจากคีย์จริงเสมอ ห้ามบวกตัวนับเอง** — อัปทับรูปเดิม index เดิม
      ไม่ควรทำให้ยอดขึ้น และสองคนอัปพร้อมกันก็ไม่ทำให้ยอดหาย                    */
export async function saveReturnPhoto(body, staff) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const no = needStaff(staff);
  if (no) return no;
  await ensureTables();

  const returnId = String(body?.returnId ?? "").trim();
  const idx = Number(body?.index);
  const dataUrl = String(body?.dataUrl ?? "");
  if (!Number.isInteger(idx) || idx < 0 || idx > 20) return { error: "index ต้องเป็น 0-20" };
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) {
    return { error: "ต้องเป็นรูป jpeg/png/webp แบบ data URL" };
  }
  // ย่อมาแล้ว ≤1400px ควรอยู่หลักไม่กี่ร้อย KB — กันคนส่งภาพเต็มมาถล่ม
  if (dataUrl.length > 3_000_000) return { error: "รูปใหญ่เกินไป — ย่อก่อนส่ง (≤1400px)" };

  const row = (
    await coreQuery(
      `SELECT state, locked_by, lock_since FROM returns_desk WHERE return_id = ${esc(returnId)}`
    )
  )[0];
  if (!row) return { error: `ไม่พบใบคืน ${returnId}` };
  const blocked = lockBlock(row, staff);
  if (blocked) return blocked;      // รูปก็คือการเขียนใบ — คนที่ไม่ได้ถือใบแนบรูปไม่ได้

  const prefix = `img/${returnId}/`;
  await photoStore().set(`${prefix}${idx}`, dataUrl);
  // อ่านกลับมานับ — พิสูจน์ว่าเขียนติดจริง ไม่ใช่เชื่อว่า set() สำเร็จ
  const listed = await photoStore().list({ prefix });
  const stored = listed?.blobs?.length ?? 0;
  await coreQuery(
    `UPDATE returns_desk SET photo_count = ${stored}, last_activity_at = datetime('now')
      WHERE return_id = ${esc(returnId)}`
  );
  return { ok: true, stored };
}

export async function getReturnPhoto(returnId, index) {
  const id = String(returnId ?? "").trim();
  const idx = Number(index);
  if (!id || !Number.isInteger(idx)) return null;
  return photoStore().get(`img/${id}/${idx}`).catch(() => null);
}

/* ── ขอรับช่วงใบที่คนก่อนถือค้าง ─────────────────────────────────────────────
   ล็อกที่ปลดไม่ได้ = ระบบค้างเมื่อคนแรกแบตหมด/กลับบ้าน (เกิดแน่ในร้านจริง)
   🔴 **ทุกการรับช่วงต้องเป็นแถวที่บันทึกไว้ ไม่ใช่การแย่งเงียบ ๆ** (ข้อสังเคราะห์เวที #2)
      ⇒ ไม่มีเงื่อนไข "เงียบเกิน N นาที" มาขวาง เพราะ N ที่เดาเอาจะกลายเป็นกำแพง
        ที่คนหน้าเคาน์เตอร์ข้ามไม่ได้ตอนจำเป็น · ที่กันการแย่งพร่ำเพรื่อคือ
        **ต้องเลือกเหตุผล + ทุกครั้งโผล่บนจอแอดมินเป็นรายการแยก**                */
export async function takeoverReturn(body, staff) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const no = needStaff(staff);
  if (no) return no;
  await ensureTables();

  const returnId = String(body?.returnId ?? "").trim();
  const reason = String(body?.reason ?? "").trim();
  const note = String(body?.note ?? "").trim();
  if (!TAKEOVER_REASONS.has(reason)) {
    return { error: `reason ต้องเป็นหนึ่งใน ${[...TAKEOVER_REASONS].join("/")}` };
  }
  if (reason === "other" && !note) return { error: 'เลือก "อื่น ๆ" ต้องพิมพ์เหตุผลด้วย' };

  const row = (
    await coreQuery(`SELECT state, locked_by FROM returns_desk WHERE return_id = ${esc(returnId)}`)
  )[0];
  if (!row) return { error: `ไม่พบใบคืน ${returnId}` };
  if (!OPEN_STATES.includes(row.state)) {
    return { error: `ใบนี้ปิดไปแล้ว (${row.state}) ไม่ต้องรับช่วง` };
  }
  if (row.locked_by === staff.name) return { doc: await loadDoc(returnId) };

  await coreQuery(
    `INSERT INTO returns_desk_takeovers (return_id, from_staff, to_staff, reason, note)
     VALUES (${esc(returnId)}, ${esc(row.locked_by ?? "")}, ${esc(staff.name)}, ${esc(reason)}, ${esc(note)})`
  );
  await coreQuery(
    `UPDATE returns_desk SET locked_by = ${esc(staff.name)}, lock_since = datetime('now'),
       last_activity_at = datetime('now') WHERE return_id = ${esc(returnId)}`
  );
  return { doc: await loadDoc(returnId) };
}

/* ── ยกเลิกใบ ────────────────────────────────────────────────────────────────
   สัญญามีสถานะ `cancelled` มาตั้งแต่ต้น **แต่ไม่มีใครทำเส้นให้ยกเลิก** —
   ช่องที่หลุดจากสัญญาทั้งสองฝั่งพร้อมกัน เพิ่งเห็นตอนยิงประกบ (8 ก.ย. 2569)
   บทเรียน: **สถานะที่ไม่มีทางไปถึง = สถานะที่ยังไม่มีจริง** ต่อให้เขียนไว้ในชนิดข้อมูลแล้ว

   ใครยกเลิกได้: **คนที่ถือใบอยู่** — ไม่สร้างแนวคิดสิทธิ์ใหม่ให้มีสองระบบให้หลุด
   คนอื่นอยากยกเลิกต้อง `takeover` ก่อน ⇒ ได้บันทึกว่าใครแย่งไปเพราะอะไรฟรี ๆ

   🔴 **ใบที่ลงบัญชีสต็อกไปแล้วแม้ชิ้นเดียว ยกเลิกไม่ได้** — ยกเลิกไม่ได้ถอนของออกจากคลัง
      ปล่อยให้ยกเลิกได้ = ใบหายจากจอ แต่ของยังบวกอยู่ในสต็อก **ไม่มีอะไรฟ้องเลย**
      ทางที่ถูกคือให้แอดมินปรับยอดด้วยใบ `<ref>-fix`                                  */
export async function cancelReturn(body, staff) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const no = needStaff(staff);
  if (no) return no;
  await ensureTables();

  const returnId = String(body?.returnId ?? "").trim();
  const reason = String(body?.reason ?? "").trim();
  if (!reason) return { error: "ต้องบอกเหตุผลที่ยกเลิก" };

  const row = (
    await coreQuery(
      `SELECT state, locked_by, lock_since FROM returns_desk WHERE return_id = ${esc(returnId)}`
    )
  )[0];
  if (!row) return { error: `ไม่พบใบคืน ${returnId}` };
  if (row.state === "cancelled") return { doc: await loadDoc(returnId), already: true };
  const blocked = lockBlock(row, staff);
  if (blocked) return blocked;

  const moved = await coreQuery(
    `SELECT COUNT(*) c FROM returns_desk_items
      WHERE return_id = ${esc(returnId)} AND move_result IS NOT NULL`
  );
  if (Number(moved[0]?.c ?? 0) > 0) {
    return { error: "ใบนี้ลงบัญชีสต็อกไปแล้ว ยกเลิกไม่ได้ — ให้แอดมินปรับยอดด้วยใบ <ref>-fix แทน" };
  }

  await coreQuery(
    `UPDATE returns_desk SET state = 'cancelled', locked_by = NULL, lock_since = NULL,
       cancel_reason = ${esc(reason)}, cancelled_by = ${esc(staff.name)},
       cancelled_at = datetime('now'), last_activity_at = datetime('now')
     WHERE return_id = ${esc(returnId)}`
  );
  return { doc: await loadDoc(returnId) };
}
