// คลังเงา GUCUT Core — คำนวณสต็อกเอง แล้วเทียบกับ ZORT (แผนลับตัด ZORT ขั้น 1)
//
// สูตร:  สต็อกที่เราคิดว่าควรเหลือ = สต็อกวันฐาน − ที่ขายไป + ที่ปรับมือ
//        แล้วเอาไปเทียบกับสต็อกจริงที่ ZORT บอกในวันปลาย
//
// ระยะนี้ยัง **ไม่ตัดสต็อกจริง** ที่ไหนทั้งนั้น — เป็นการเดินคู่ขนานเพื่อพิสูจน์ว่า
// เราคำนวณเองได้ตรง ก่อนจะกล้าให้คลังเราเป็นตัวจริง (สูตรเดียวกับตอนปลด Shopify)
//
// ⚠️ ยอดขายอ่านจาก `order_items` (กระจก ZORT = ครบทุกช่องทาง) เท่านั้น
//    ห้ามบวก `shopee_order_items` เข้าไปด้วย — ออเดอร์ Shopee ใบเดียวกันอยู่ทั้งสองตาราง
//    บวกทั้งคู่ = ตัดสต็อกสองรอบแบบเงียบ ๆ (กติกาเดียวกับที่ recon แยกตารางไว้ตั้งแต่แรก)
//    วันที่ ZORT ถูกตัดจริง ค่อยย้ายมาบวกจากท่อรายแพลตฟอร์มแทนทั้งชุด
//
// ⚠️ ความคลาดเคลื่อนที่ "ปกติ" ของระยะนี้ อย่าเพิ่งตกใจ:
//    · ภาพถ่ายสต็อกถ่ายตอนตี 1 ของแต่ละวัน ของที่ขายระหว่าง 00:00–01:13 จึงตกไปอยู่คนละฝั่ง
//    · ค่าที่เทียบคือ availablestock (ของว่างขาย) ไม่ใช่ของในมือ — ออเดอร์ที่จองของไว้ก็ทำให้ต่างได้
//    · ขายหน้าร้าน/โอนของ/รับของเข้า ที่ไม่ได้ผ่านออเดอร์ จะโผล่เป็นส่วนต่างเสมอ
//      จนกว่าจะมีหน้าปรับมือเขียนลง stock_moves
import { coreQuery, coreReady } from "./coredb.mjs";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const CANCEL_SQL =
  `status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'`;

/** ท่อนกลางที่ใช้ร่วมกันทั้งตัวนับและตัวลงรายละเอียด — ผูกค่าด้วย ? ตามลำดับ base,cur,base,cur,base,cur */
const CALC_CTE = `
  WITH base AS (SELECT sku, qty FROM stock_snapshots WHERE day = ?),
       cur  AS (SELECT sku, qty FROM stock_snapshots WHERE day = ?),
       sold AS (
         SELECT oi.sku AS sku, SUM(oi.qty) AS qty
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.order_date >= ? AND o.order_date < ? AND ${CANCEL_SQL}
           AND oi.sku IS NOT NULL AND oi.sku <> ''
         GROUP BY oi.sku
       ),
       moved AS (
         -- ⚠️ at เก็บเป็นเวลา UTC (datetime('now')) แต่ baseDay/curDay เป็น "วันแบบไทย"
         --    เทียบตรง ๆ = หน้าต่างเลื่อนไป 7 ชม. ใบที่บันทึกช่วงเย็น (17:00 UTC เป็นต้นไป
         --    = หลังเที่ยงคืนบ้านเรา) ตกไปนับผิดวันแบบเงียบ ๆ — ต้องแปลงเป็นวันไทยก่อนเสมอ
         --    (กติกาเดียวกับ order_date และระบบลงเวลาพนักงาน)
         SELECT sku, SUM(qty) AS qty FROM stock_moves
         WHERE date(at, '+7 hours') >= ? AND date(at, '+7 hours') < ? GROUP BY sku
       ),
       calc AS (
         SELECT b.sku AS sku, b.qty AS base_qty, c.qty AS actual_qty,
                COALESCE(s.qty,0) AS sold_qty, COALESCE(m.qty,0) AS move_qty,
                (b.qty - COALESCE(s.qty,0) + COALESCE(m.qty,0)) - c.qty AS diff
         FROM base b
         JOIN cur c ON c.sku = b.sku
         LEFT JOIN sold s ON s.sku = b.sku
         LEFT JOIN moved m ON m.sku = b.sku
       )`;

/**
 * สร้างตารางของงานนี้เองถ้ายังไม่มี — จะได้ไม่ต้องรอใครไปกด /api/core?init=1
 * (ขั้นตอนมือที่ต้องจำ = ขั้นตอนที่จะถูกลืม แล้วยามตี 1 เงียบไปเฉย ๆ โดยไม่มีใครรู้)
 * CREATE ... IF NOT EXISTS ทั้งคู่ ยิงซ้ำทุกคืนไม่เป็นไร
 */
async function ensureStockTables() {
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS stock_recon_log (
       day TEXT PRIMARY KEY, base_day TEXT, skus INTEGER, matched INTEGER,
       mismatched INTEGER, abs_diff REAL, notes TEXT,
       at TEXT DEFAULT (datetime('now')))`
  );
  // ดัชนีกันเบิ้ลของ stock_moves — ยังไม่มีใครเขียนตารางนั้น จึงสร้างผ่านเสมอ
  // แต่ถ้าวันหน้ามีแถวซ้ำอยู่ก่อน คำสั่งนี้จะล้ม → ห้ามให้ลากงานเทียบสต็อกล้มตาม
  await coreQuery(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_moves_once ON stock_moves(reason,ref,sku)`
  ).catch(() => null);
}

/** หาวันฐานกับวันปลายจากภาพถ่ายที่มีจริง (ไม่ใช่ปฏิทิน — บางวันงานอาจไม่ได้รัน) */
async function pickDays(daysBack) {
  const [latest] = await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`);
  const curDay = latest?.d || null;
  if (!curDay) return { curDay: null, baseDay: null };
  const target = new Date(new Date(`${curDay}T00:00:00Z`).getTime() - daysBack * 864e5)
    .toISOString()
    .slice(0, 10);
  const [older] = await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots WHERE day <= ?`, [
    target,
  ]);
  return { curDay, baseDay: older?.d || null };
}

/**
 * เทียบสต็อกที่เราคำนวณเอง กับสต็อกจริงของ ZORT
 * @param {number} daysBack ย้อนกลับกี่วันเป็นวันฐาน (1 = เทียบเมื่อวานกับวันนี้)
 * @param {number} limit จะเอารายละเอียดตัวที่ต่างมากี่ตัว
 */
export async function stockRecon(daysBack = 1, limit = 40) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };

  // กระจกออเดอร์เก็บย้อนหลัง 7 วัน — ขอฐานเก่ากว่านั้นยอดขายจะไม่ครบแล้วส่วนต่างเพี้ยน
  const back = Math.max(1, Math.min(7, num(daysBack) || 1));
  const { curDay, baseDay } = await pickDays(back);
  if (!curDay) return { skip: "ยังไม่มีภาพถ่ายสต็อกสักวัน" };
  if (!baseDay || baseDay === curDay) {
    return { skip: "ยังมีภาพถ่ายสต็อกไม่ถึงสองวัน — รออีกวันแล้วค่อยเทียบ", curDay };
  }

  const p = [baseDay, curDay, baseDay, curDay, baseDay, curDay];
  const [sum] = await coreQuery(
    `${CALC_CTE}
     SELECT COUNT(*) AS skus,
            SUM(CASE WHEN diff = 0 THEN 1 ELSE 0 END) AS matched,
            SUM(CASE WHEN diff <> 0 THEN 1 ELSE 0 END) AS mismatched,
            ROUND(COALESCE(SUM(ABS(diff)),0),2) AS abs_diff,
            ROUND(COALESCE(SUM(sold_qty),0),2) AS sold_total
     FROM calc`,
    p
  );

  const rows = await coreQuery(
    `${CALC_CTE}
     SELECT calc.*,
            (SELECT name FROM order_items WHERE sku = calc.sku AND name <> '' LIMIT 1) AS name
     FROM calc WHERE diff <> 0
     ORDER BY ABS(diff) DESC LIMIT ${Math.max(1, Math.min(200, num(limit) || 40))}`,
    p
  );

  return {
    baseDay,
    curDay,
    // ช่วงที่นับ "ของเข้า-ของออกมือ" — เป็นวันแบบไทย [baseDay, curDay)
    // ใบที่บันทึกวันนี้จะยังไม่เข้ารอบนี้โดยตั้งใจ เพราะภาพถ่ายวันนี้ถ่ายไปตั้งแต่ตี 1
    // (ของที่รับเข้าตอนสายจึงยังไม่มีทางอยู่ในภาพนั้น) — จะไปโผล่รอบพรุ่งนี้
    moveWindow: `${baseDay} ถึงก่อน ${curDay} (วันแบบไทย)`,
    skus: num(sum?.skus),
    matched: num(sum?.matched),
    mismatched: num(sum?.mismatched),
    absDiff: num(sum?.abs_diff),
    soldTotal: num(sum?.sold_total),
    // diff > 0 = เราคิดว่าควรเหลือมากกว่าที่ ZORT บอก (มีของออกที่เราไม่เห็น)
    // diff < 0 = ZORT มีมากกว่าที่เราคิด (น่าจะมีของเข้าที่เราไม่เห็น)
    items: rows.map((r) => ({
      sku: r.sku,
      name: r.name || "",
      baseQty: num(r.base_qty),
      soldQty: num(r.sold_qty),
      moveQty: num(r.move_qty),
      expected: num(r.base_qty) - num(r.sold_qty) + num(r.move_qty),
      actualQty: num(r.actual_qty),
      diff: num(r.diff),
    })),
  };
}

/** งานรายวัน: เทียบแล้วจดลงสมุด — คืนบรรทัดสรุปไว้พ่วง Telegram (null ถ้ายังเทียบไม่ได้) */
export async function stockReconDaily() {
  await ensureStockTables();
  const r = await stockRecon(1, 40);
  if (r.skip) return { skip: r.skip, line: null };

  // ⚠️ ศูนย์ SKU ต้องไม่ขึ้นเขียวว่า "ตรงกันทุกตัว" — ไม่มีอะไรให้เทียบคือของเสีย ไม่ใช่ของดี
  //    (บทเรียน 19 ส.ค.: ตัวตรวจที่เขียวได้ทั้งที่ของจริงพัง อันตรายกว่าไม่มีตัวตรวจ)
  const empty = r.skus === 0;
  const notes = empty
    ? "⚠️ ไม่มี SKU ให้เทียบ — ภาพถ่ายสองวันไม่มี SKU ตรงกันสักตัว"
    : r.mismatched === 0
      ? "ตรงกันทุก SKU"
      : `ต่าง ${r.mismatched} SKU · รวม ${r.absDiff.toLocaleString("th-TH")} ชิ้น`;
  await coreQuery(
    `INSERT INTO stock_recon_log (day,base_day,skus,matched,mismatched,abs_diff,notes,at)
     VALUES (?,?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(day) DO UPDATE SET base_day=excluded.base_day, skus=excluded.skus,
       matched=excluded.matched, mismatched=excluded.mismatched,
       abs_diff=excluded.abs_diff, notes=excluded.notes, at=excluded.at`,
    [r.curDay, r.baseDay, r.skus, r.matched, r.mismatched, r.absDiff, notes]
  );

  const icon = empty ? "📦❓" : r.mismatched === 0 ? "📦✅" : "📦⚠️";
  const line =
    `${icon} คลังเงา — เทียบสต็อกที่เราคำนวณเอง (${r.baseDay} → ${r.curDay})\n` +
    `SKU ที่เทียบ ${r.skus.toLocaleString("th-TH")} · ตรง ${r.matched.toLocaleString("th-TH")} · ${notes}`;
  return { ...r, line };
}

/**
 * จอ "สินค้า/สต็อก" อ่านจากคลังเราเอง — ตัวแทนหน้าสินค้าของ ZORT
 * ใช้ภาพถ่ายสต็อกวันล่าสุด + ยอดขาย N วันย้อนหลังจาก order_items
 * ⚠️ อ่านอย่างเดียว · ตัวเลขคือภาพถ่ายตอนตี 1 ไม่ใช่สดวินาทีนี้ (จอต้องเขียนกำกับให้ชัด)
 */
export async function listStock(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const [latest] = await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`);
  const day = latest?.d;
  if (!day) return { skip: "ยังไม่มีภาพถ่ายสต็อกสักวัน" };

  const soldDays = Math.max(1, Math.min(90, num(o.soldDays) || 30));
  const since = new Date(new Date(`${day}T00:00:00Z`).getTime() - soldDays * 864e5)
    .toISOString()
    .slice(0, 10);
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));
  const q = String(o.q ?? "").trim().slice(0, 60);
  const sort = {
    qty: "cur.qty ASC",
    qtydesc: "cur.qty DESC",
    sold: "sold30 DESC",
    sku: "cur.sku ASC",
  }[o.sort] || "cur.qty ASC";
  // แท็บ "ของหมด / เหลือน้อย" — ต้องกรอง **ทั้งคลัง** ไม่ใช่กรองเฉพาะหน้าที่กำลังดู
  // ⚠️ เดิมฝั่งจอกรองจาก 50 แถวที่โหลดมา ⇒ ตัวเลขในวงเล็บกับแถวที่เห็นมาจากคนละชุด
  //    เป็นกับดักเดียวกับแท็บ "ยกเลิก (44) แต่กดแล้วได้ 0" ในจอรายการขาย (2 ก.ย. 2569)
  const only = { out: "cur.qty <= 0", low: "cur.qty > 0 AND cur.qty <= 3" }[o.only] || "";

  // ⚠️ ต้องค้นชื่อจาก **ทะเบียนสินค้า** ด้วย ไม่ใช่จาก order_items อย่างเดียว
  //    คลังมี 2,672 รหัส แต่เคยขายจริงแค่ ~500 ⇒ ค้นจาก order_items อย่างเดียว
  //    = พิมพ์ชื่อสินค้าที่ยังไม่เคยขายแล้วหาไม่เจอ ทั้งที่มีของอยู่ในคลัง (เจอจริง 2 ก.ย. 2569)
  const filter = q
    ? `AND (cur.sku LIKE ?
            OR EXISTS (SELECT 1 FROM products p2 WHERE p2.sku = cur.sku AND p2.name LIKE ?)
            OR EXISTS (SELECT 1 FROM order_items oi2 WHERE oi2.sku = cur.sku AND oi2.name LIKE ?))`
    : "";
  const fParams = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];

  const CTE = `
    WITH cur AS (SELECT sku, qty, price FROM stock_snapshots WHERE day = ?),
         sold AS (
           SELECT oi.sku AS sku, SUM(oi.qty) AS qty
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.order_date >= ? AND ${CANCEL_SQL}
             AND oi.sku IS NOT NULL AND oi.sku <> ''
           GROUP BY oi.sku
         )`;

  const [sum] = await coreQuery(
    `${CTE}
     SELECT COUNT(*) AS skus,
            SUM(CASE WHEN cur.qty <= 0 THEN 1 ELSE 0 END) AS out_of_stock,
            SUM(CASE WHEN cur.qty > 0 AND cur.qty <= 3 THEN 1 ELSE 0 END) AS low,
            ROUND(COALESCE(SUM(cur.qty * cur.price),0),2) AS value
     FROM cur WHERE 1=1 ${filter}`,
    [day, since, ...fParams]
  );

  // จำนวนแถวของ "แท็บที่เลือกอยู่" — ใช้ทำเลขหน้า ไม่ใช่ตัวเลขบนแท็บ
  const [shown] = only
    ? await coreQuery(
        `${CTE} SELECT COUNT(*) AS c FROM cur WHERE ${only} ${filter}`,
        [day, since, ...fParams]
      )
    : [{ c: sum?.skus }];

  const rows = await coreQuery(
    `${CTE}
     SELECT cur.sku AS sku, cur.qty AS qty, cur.price AS price,
            COALESCE(sold.qty,0) AS sold30,
            COALESCE((SELECT name FROM products WHERE sku = cur.sku AND name <> ''),
                     (SELECT name FROM order_items WHERE sku = cur.sku AND name <> '' LIMIT 1)) AS name
     FROM cur LEFT JOIN sold ON sold.sku = cur.sku
     WHERE 1=1 ${only ? `AND ${only}` : ""} ${filter}
     ORDER BY ${sort} LIMIT ${limit} OFFSET ${offset}`,
    [day, since, ...fParams]
  );

  return {
    day,
    soldDays,
    limit,
    offset,
    only: o.only && only ? o.only : null,
    // ⚠️ total / outOfStock / low **ไม่ถูกกรองด้วย only** โดยตั้งใจ —
    //    ตัวเลขบนแท็บต้องบอกได้เสมอว่าแท็บอื่นมีกี่ตัว ไม่งั้นมันไม่ใช่แท็บ
    //    (หลักเดียวกับ byStatus ในจอรายการขาย)
    total: num(sum?.skus),
    outOfStock: num(sum?.out_of_stock),
    low: num(sum?.low),
    shown: num(shown?.c), // จำนวนแถวของแท็บที่เลือกอยู่ — เอาไปทำเลขหน้า
    value: num(sum?.value),
    rows: rows.map((r) => ({
      sku: r.sku,
      name: r.name || "",
      qty: num(r.qty),
      price: num(r.price),
      sold: num(r.sold30),
    })),
  };
}

/** สมุดเทียบสต็อกย้อนหลัง (ไว้ดูว่าส่วนต่างนิ่งหรือแกว่ง) */
export async function stockReconLog(days = 14) {
  if (!coreReady()) return [];
  return coreQuery(
    `SELECT * FROM stock_recon_log ORDER BY day DESC LIMIT ${Math.max(1, Math.min(60, num(days) || 14))}`
  );
}
