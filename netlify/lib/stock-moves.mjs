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

  /* นับว่าเขียนจริงกี่แถว — D1 REST ไม่คืน `changes` มาให้ จึงต้องนับเอง
     ⚠️ **ห้ามนับ COUNT(*) ของทั้งตารางก่อน-หลัง** (ฝั่งจอจับได้ 6 ก.ย. 2569)
        ถ้ามีคนอื่นหรืองานตามเวลาเขียน stock_moves คั่นกลาง ตัวเลขจะบวกของคนอื่นเข้ามา
        แล้ว `duplicate` ติดลบได้ · วันนี้ยังไม่เห็นเพราะใช้ทีละคน
        แต่วันที่สองสาขาบันทึกพร้อมกัน เลขบนจอจะเพี้ยน **โดยไม่มีอะไรฟ้อง**
     ⇒ นับเฉพาะคีย์ของชุดนี้ (reason+ref+sku) ซึ่งเป็นคีย์เดียวกับดัชนี UNIQUE
        ⚠️ ต้องนับ **ก่อนเขียน** ด้วย ไม่ใช่นับหลังอย่างเดียว — บางแถวอาจมีอยู่แล้วจากใบก่อน */
  /* ⚠️ จับกลุ่มตาม (reason, ref) แล้วนับด้วย `sku IN (...)` — **ไม่ใช้ row-value `IN (VALUES ...)`**
      เพราะเป็นไวยากรณ์ที่ต้องพึ่งรุ่นของ SQLite ⇒ ถ้ารุ่นไม่รองรับ คำสั่งจะ error
      แล้วเส้นบันทึกของเข้าที่ร้านใช้จริงจะพังทั้งเส้น — ของที่ยังไม่แน่ใจ ห้ามเอามาขวางทางหลัก
      ปกติหนึ่งใบมี reason/ref เดียว ⇒ วนแค่รอบเดียว */
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.reason}\u0000${r.ref}`;
    if (!groups.has(k)) groups.set(k, { reason: r.reason, ref: r.ref, skus: [] });
    groups.get(k).skus.push(r.sku);
  }
  /* ⚠️ **รวมทุกกลุ่มไว้ในคำสั่งเดียวด้วย OR — ห้ามกลับไปยิงทีละกลุ่ม** (แก้ 6 ก.ย. 2569)
      เดิมยิง 1 คำขอต่อ (reason,ref) ต่อ 200 รหัส **และเรียกซ้ำสองรอบ** (before + after)
      ⇒ คำขอ D1 = 2 × จำนวนกลุ่ม · ฐาน D1 อยู่ APAC ฟังก์ชันอยู่ US = ~286ms ต่อคำขอ
        ใบเดียวหลาย ref (เช่น รับของ 40 ใบพร้อมกัน) = 80 คำขอเรียงกัน ≈ 23 วิ
        **ชนเพดาน 26 วิของ Netlify** — ดู [[time-budget-is-shared]] · [[d1-in-apac-functions-in-us]]

      ⚠️ **ทิศของความพังคือส่วนที่แย่ที่สุด** ถ้าหมดเวลาตอนรอบ `after`
        แปลว่า INSERT เข้าไปครบแล้ว แต่จอเห็น 502 ⇒ คนกรอกใบใหม่ **ref ใหม่**
        ⇒ ดัชนี UNIQUE(reason,ref,sku) จับไม่ได้ ⇒ **สต็อกบวมสองเท่าเงียบ ๆ**
        (ตาข่ายกันซ้ำกันได้แค่ "กดปุ่มเดิม" ไม่ได้กัน "กรอกใบใหม่" — [[guard-stops-retry-not-reentry]])

      ⇒ รวมเป็นคำสั่งเดียว: WHERE (กลุ่ม1) OR (กลุ่ม2) OR ... · ใช้ SQL ธรรมดาล้วน
        ไม่พึ่งไวยากรณ์ที่ขึ้นกับรุ่นของ SQLite (เหตุผลเดิมของคอมเมนต์ข้างบน)
      ⚠️ ยังต้องแบ่งชุดตาม **จำนวนไบต์** เพราะ D1 มีเพดานความยาวคำสั่ง (~100KB)
        แบ่งตามจำนวนกลุ่มไม่พอ — กลุ่มเดียวที่มี 5,000 รหัสก็ยาวเกินได้
      ⚠️ กรณีที่ร้านใช้ทุกวัน (ใบเดียว ref เดียว) ยังเป็น **1 คำขอเท่าเดิม** ไม่ได้แพงขึ้น */
  const MAX_SQL = 60_000; // ไบต์ต่อคำสั่ง — เผื่อจากเพดานจริงไว้เยอะ
  const preds = [];
  for (const g of groups.values()) {
    for (let i = 0; i < g.skus.length; i += 200) {
      const inList = g.skus.slice(i, i + 200).map(esc).join(",");
      preds.push(`(reason = ${esc(g.reason)} AND ref = ${esc(g.ref)} AND sku IN (${inList}))`);
    }
  }
  const countMine = async () => {
    let n = 0;
    let batch = [];
    let bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const c = await coreQuery(
        `SELECT COUNT(*) c FROM stock_moves WHERE ${batch.join(" OR ")}`
      );
      n += Number(c[0]?.c ?? 0);
      batch = [];
      bytes = 0;
    };
    for (const pr of preds) {
      /* ⚠️ ท่อนเดียวยาวเกินเพดานเองก็ยังต้องยิง — ยิงแล้วพลาดดีกว่าข้ามเงียบ ๆ
          (ข้ามไป = `before`/`after` นับขาด ⇒ `added` เพี้ยน ⇒ จอบอกว่าซ้ำทั้งที่เพิ่งเข้า) */
      if (batch.length && bytes + pr.length > MAX_SQL) await flush();
      batch.push(pr);
      bytes += pr.length + 4;
    }
    await flush();
    return n;
  };
  const before = await countMine();
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
  const after = await countMine();
  const added = after - before;
  return { sent: rows.length, added, duplicate: rows.length - added, bad: bad.length ? bad : undefined };
}

/** ลบใบที่บันทึกผิด (ทีละใบด้วยเลข id เท่านั้น)
 *  ⚠️ ตั้งใจให้ลบได้ทีละใบและต้องรู้ id — ไม่มีลบทั้ง ref หรือลบทั้ง SKU
 *     บัญชีสต็อกที่ลบเป็นชุดได้ = พลาดครั้งเดียวประวัติหายเป็นสิบใบโดยไม่มีอะไรเตือน */
export async function deleteMove(id) {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return { error: "ต้องระบุ id เป็นเลขจำนวนเต็ม" };
  const row = (await coreQuery(`SELECT id,sku,qty,reason,ref FROM stock_moves WHERE id = ${n}`))[0];
  if (!row) return { error: `ไม่พบใบเลข ${n}` };
  await coreQuery(`DELETE FROM stock_moves WHERE id = ${n}`);
  return { deleted: row };
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
