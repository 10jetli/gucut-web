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
/* ⚠️ **ไฟล์ .mjs ไม่มีตัวตรวจชนิดข้อมูล — ตัวแปรที่ไม่มีอยู่จริงพังตอนรันเท่านั้น**
    listDeadStock เรียก esc() ทั้งที่ไฟล์นี้ไม่เคยประกาศไว้ · `npm run build` เขียวสนิท
    เจอตอนฝั่งจอยิงของจริง (3 ก.ย. 2569) ⇒ เพิ่ม API ใหม่ในไฟล์ .mjs ต้องยิงจริงเสมอ */
const esc = (v) => `'${String(v ?? "").replace(/'/g, "''")}'`;
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
  const only =
    {
      out: "cur.qty <= 0",
      low: "cur.qty > 0 AND cur.qty <= 3",
      // แท็บ เปิด/ปิดใช้งาน แบบ ZORT — ต้องกรองที่ฐานข้อมูล ไม่ใช่ที่จอ
      // ⚠️ กรองฝั่งจอจากข้อมูลที่แบ่งหน้ามาแล้ว = เลขหน้าผิดและตัวนับผิดทันทีที่มีของจริง
      //    (บั๊กเดียวกับแท็บที่เคยกรองแค่ 400 แถวแรก)
      active: "COALESCE(p.active,1) = 1",
      inactive: "COALESCE(p.active,1) = 0",
    }[o.only] || "";

  // ⚠️ "บริการ" ไม่ใช่สินค้าที่มีสต็อกจริง (ค่าส่ง · ค่าบริการซ่อม · ค่าน้ำมัน)
  //    ZORT ติดธง producttype = 1 ให้ — ตรวจทั้งคลังแล้วมี 6 ตัว
  //    ของพวกนี้ยอดติดลบหนัก ๆ ได้ตามปกติ (ยิ่งขายยิ่งลบ) แล้วไป**ยึดแถวบนของแท็บ
  //    "ของใกล้หมด"** จนสินค้าจริงที่ควรสั่งของถูกดันตกหน้า
  // ⚠️ **ไม่กรองทิ้งเงียบ ๆ** — คืนจำนวนมาด้วยเสมอ (`services`) ให้จอบอกได้ว่าซ่อนไปกี่ตัว
  //    กติกาเดียวกับ total/outOfStock: ตัวเลขบนแท็บต้องบอกได้ว่าแท็บอื่นมีอะไร
  const kind =
    { goods: "COALESCE(p.product_type,0) = 0", service: "COALESCE(p.product_type,0) = 1" }[o.kind] || "";

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
  // ทะเบียนสินค้าเข้ามาทางนี้ — ราคาซื้อ · พร้อมขาย · หน่วย · เปิดใช้งาน · ประเภท
  const JOIN = `LEFT JOIN products p ON p.sku = cur.sku`;

  const [sum] = await coreQuery(
    `${CTE}
     SELECT COUNT(*) AS skus,
            SUM(CASE WHEN cur.qty <= 0 THEN 1 ELSE 0 END) AS out_of_stock,
            SUM(CASE WHEN cur.qty > 0 AND cur.qty <= 3 THEN 1 ELSE 0 END) AS low,
            ROUND(COALESCE(SUM(cur.qty * cur.price),0),2) AS value,
            /* ⚠️ **ZORT คิดมูลค่าสต็อกจาก "ราคาทุน" ไม่ใช่ราคาขาย** (วัดเทียบแล้ว 3 ก.ย. 2569)
                ราคาขายรวมได้ ฿26.7 ล้าน · ZORT โชว์ ฿16.4 ล้าน — ต่างกันสิบล้าน
                จอที่เขียนว่า "มูลค่าสินค้าทั้งหมด" ต้องใช้ valueCost ไม่ใช่ value
                ⚠️ และต้องบอกด้วยว่ากี่รหัสยังไม่มีราคาทุน ไม่งั้นยอดต่ำกว่าจริงเงียบ ๆ */
            ROUND(COALESCE(SUM(cur.qty * COALESCE(p.purchase_price,0)),0),2) AS value_cost,
            SUM(CASE WHEN cur.qty > 0 AND COALESCE(p.purchase_price,0) <= 0 THEN 1 ELSE 0 END) AS no_cost
     FROM cur ${JOIN} WHERE 1=1 ${kind ? `AND ${kind}` : ""} ${filter}`,
    [day, since, ...fParams]
  );

  // ⚠️ **นับ "บริการ" / "ปิดใช้งาน" นอกกรอบ kind เสมอ** — สองตัวนี้มีไว้บอกว่า
  //    *ซ่อนอะไรไว้กี่รายการ* ถ้าเอาไปกรองด้วย kind ด้วย พอตั้ง kind=goods มันจะตอบ 0
  //    แล้วจอจะเขียนว่า "ซ่อนบริการ 0 รายการ" ทั้งที่ซ่อนไป 6 — คือหายเงียบอีกแบบหนึ่ง
  const [aside] = await coreQuery(
    `${CTE}
     SELECT SUM(CASE WHEN COALESCE(p.product_type,0) = 1 THEN 1 ELSE 0 END) AS services,
            SUM(CASE WHEN COALESCE(p.active,1) = 0 THEN 1 ELSE 0 END) AS inactive
     FROM cur ${JOIN} WHERE 1=1 ${filter}`,
    [day, since, ...fParams]
  );

  // จำนวนแถวของ "แท็บที่เลือกอยู่" — ใช้ทำเลขหน้า ไม่ใช่ตัวเลขบนแท็บ
  const [shown] =
    only || kind
      ? await coreQuery(
          `${CTE} SELECT COUNT(*) AS c FROM cur ${JOIN}
           WHERE 1=1 ${only ? `AND ${only}` : ""} ${kind ? `AND ${kind}` : ""} ${filter}`,
          [day, since, ...fParams]
        )
      : [{ c: sum?.skus }];

  const rows = await coreQuery(
    `${CTE}
     SELECT cur.sku AS sku, cur.qty AS qty, cur.price AS price,
            COALESCE(sold.qty,0) AS sold30,
            p.purchase_price AS buy, p.available AS avail, p.unit AS unit,
            p.product_type AS ptype, p.active AS active, p.weight AS weight,
            COALESCE((SELECT name FROM products WHERE sku = cur.sku AND name <> ''),
                     (SELECT name FROM order_items WHERE sku = cur.sku AND name <> '' LIMIT 1)) AS name
     FROM cur LEFT JOIN sold ON sold.sku = cur.sku ${JOIN}
     WHERE 1=1 ${only ? `AND ${only}` : ""} ${kind ? `AND ${kind}` : ""} ${filter}
     ORDER BY ${sort} LIMIT ${limit} OFFSET ${offset}`,
    [day, since, ...fParams]
  );

  /* คอลัมน์ Marketplace แบบ ZORT — โลโก้ช่องทางที่สินค้าตัวนั้นกำลังลงขายอยู่
     ⚠️ ล้มไม่ได้ทำให้ทั้งจอพัง — เช็คไม่ได้ก็แค่ไม่มีโลโก้ พร้อมบอกว่าเช็คใครได้บ้าง
     ⚠️ **จอต้องแยก "ไม่ได้ลงขาย" ออกจาก "เรายังเช็คไม่ได้"** ดูที่ checkedMarketplaces
        Lazada ยังรอ review ⇒ จะไม่โผล่ใน checked ตลอด ไม่ใช่ว่าไม่มีของลงขาย */
  /* จำนวนที่ ZORT มีจริง กับจำนวนที่เราเก็บไม่ได้เพราะไม่มีรหัส
     ⚠️ **ห้ามซ่อนเงียบ** — หัวจอเขียน 2,672 ทั้งที่ ZORT มี 2,898 โดยไม่บอกอะไร
        คือโรคเดียวกับที่เพิ่งแก้ในจอหมวดหมู่ (เลขบนหัวไม่ตรงกับความจริง) */
  let zc = {};
  try {
    const { getStore } = await import("@netlify/blobs");
    const c = await getStore("gucut-coupon").get("zort-product-counts", { type: "json" });
    if (c?.zortTotal) {
      zc = {
        zortTotal: num(c.zortTotal),
        noSkuInZort: num(c.noSku),
        noSkuWithStock: num(c.noSkuWithStock),
        zortCountedAt: c.at || null,
      };
    }
  } catch {
    // ไม่มีตัวนับก็ไม่ส่งฟิลด์นี้ — จอไม่แสดงอะไร ดีกว่าส่งเลขที่เดาเอง
  }

  let mk = { checkedMarketplaces: [], marketplacesAt: null };
  let mkKey = null;
  if (o.marketplaces) {
    try {
      const { marketplaceListings } = await import("./marketplace-listings.mjs");
      const ml = await marketplaceListings();
      /* ⚠️ **รหัสบนแพลตฟอร์มเป็นระดับตัวเลือก แต่คลังเราเก็บรหัสฐาน**
          Shopee ขาย `00369-54T` `00369-25T` … ส่วนคลังมีแค่ `00369`
          จับคู่ตรง ๆ = ไม่ขึ้นโลโก้สักแถวเดียว (เจอจริงตอนยิงรอบแรก 3 ก.ย. 2569
          เช็ค Shopee สำเร็จ แต่ผลลัพธ์ว่างเปล่า ซึ่งดูเหมือน "ไม่ได้ลงขายอะไรเลย")
          ⇒ ตัดท้ายทีละขีดแล้วติดโลโก้ให้รหัสฐานด้วย (กติกาเดียวกับ missing-sku) */
      const byKey = new Map();
      const put = (k, tags) => {
        if (!k) return;
        const cur = byKey.get(k) || new Set();
        for (const t of tags) cur.add(t);
        byKey.set(k, cur);
      };
      for (const [code, tags] of Object.entries(ml.listings)) {
        put(code, tags);
        let b = code;
        while (b.includes("-")) {
          b = b.slice(0, b.lastIndexOf("-"));
          put(b, tags);
        }
      }
      mkKey = byKey;
      mk = {
        checkedMarketplaces: ml.checked,
        marketplacesAt: new Date(ml.at).toISOString(),
        marketplacesNotConnected: ml.notConnected,
        marketplacesFailed: ml.failed,
      };
    } catch (e) {
      mk.marketplacesError = String(e?.message || e).slice(0, 160);
    }
  }

  return {
    day,
    soldDays,
    limit,
    offset,
    only: o.only && only ? o.only : null,
    kind: o.kind && kind ? o.kind : null,
    // ⚠️ **`only` กับ `kind` ต้องปฏิบัติคนละแบบ — พลาดตรงนี้ได้แท็บที่โกหก**
    //    `only` = "แท็บ" ⇒ สรุปต้อง **ไม่** ถูกกรอง ไม่งั้นเลขบนแท็บอื่นหายไปหมด
    //    `kind` = "โหมดว่ากำลังดูของกลุ่มไหน" ⇒ สรุปต้อง **ถูก** กรองตามไปด้วย
    //    เจอจริง 2 ก.ย. 2569 ก่อนขึ้นจอ: kind=goods&only=out ตอบ outOfStock 564
    //    แต่แถวจริงในแท็บมี 558 ⇒ แท็บเขียน "ของหมด (564)" กดเข้าไปนับได้ 558
    //    เป็นบั๊กตัวเดียวกับ "ยกเลิก (44) กดแล้วว่าง" ที่เพิ่งแก้ไปเมื่อเช้าวันเดียวกัน
    total: num(sum?.skus),
    outOfStock: num(sum?.out_of_stock),
    low: num(sum?.low),
    // ⬇️ สองตัวนี้นับข้าม kind เสมอ (ดูเหตุผลที่ตัวแปร aside)
    services: num(aside?.services), // จำนวน "บริการ" — จอเอาไปบอกว่าซ่อนไปกี่ตัว
    inactive: num(aside?.inactive), // จำนวนที่ปิดใช้งาน (ตอนนี้ 0 ทั้งคลัง — แท็บจะว่าง ต้องเขียนบอก)
    shown: num(shown?.c), // จำนวนแถวของแท็บที่เลือกอยู่ — เอาไปทำเลขหน้า
    ...zc, // ZORT มีกี่ตัว · เราขาดไปกี่ตัวเพราะไม่มีรหัส (ห้ามซ่อนเงียบ)
    value: num(sum?.value), // ราคาขายรวม — **ไม่ใช่ตัวที่ ZORT โชว์**
    valueCost: num(sum?.value_cost), // ราคาทุนรวม — ตัวนี้ตรงกับ "มูลค่าสินค้าทั้งหมด" ของ ZORT
    noCostSkus: num(sum?.no_cost), // ยังไม่ได้กรอกราคาทุน ⇒ valueCost ต่ำกว่าจริงเท่านี้รหัส
    ...mk,
    rows: rows.map((r) => ({
      sku: r.sku,
      name: r.name || "",
      qty: num(r.qty),
      price: num(r.price),
      sold: num(r.sold30),
      // ⚠️ ราคาซื้อ 281 ตัวเป็น 0 จริง (ยังไม่ได้กรอกต้นทุน) — ส่ง null ไม่ใช่ 0
      //    จอต้องขึ้น "—" ไม่ใช่ "฿0" ไม่งั้นอ่านว่าของฟรี แล้วคิดกำไรผิดทั้งแถว
      buy: num(r.buy) > 0 ? num(r.buy) : null,
      // ⚠️ พร้อมขาย ≠ คงเหลือ จริง 155 ตัว (ของถูกจองไว้ในออเดอร์ที่ยังไม่ส่ง)
      //    null = ยังไม่มีในทะเบียน ให้จอแสดง "—" ห้ามเดาว่าเท่ากับ qty
      available: r.avail === null || r.avail === undefined ? null : num(r.avail),
      unit: r.unit || "",
      // ⚠️ null = ยังไม่ได้กรอกน้ำหนัก (669 จาก 2,898 เท่านั้นที่มี) — จอต้องขึ้น "—" ห้ามขึ้น 0
      weight: r.weight === null || r.weight === undefined ? null : num(r.weight),
      service: num(r.ptype) === 1,
      active: r.active === null || r.active === undefined ? null : num(r.active) === 1,
      // ⚠️ **ต้องหยิบตรงนี้ ไม่ใช่ไปแปะไว้บนแถวดิบ** — แถวถูกแปลงเป็นวัตถุใหม่ตรงนี้
      //    ค่าที่แปะไว้ก่อนหน้าจะหลุดหายเงียบ ๆ ทั้งที่โค้ดข้างบนทำงานสำเร็จทุกบรรทัด
      //    (เจอจริง 3 ก.ย. 2569 — checkedMarketplaces มาถูก แต่ทุกแถวไม่มีฟิลด์เลย
      //     ดูเหมือน "ร้านไม่ได้ลงขายอะไรเลย" ทั้งที่ของจริงลงขายเกือบทุกตัว)
      ...(mkKey ? { marketplaces: [...(mkKey.get(String(r.sku)) || [])] } : {}),
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

/** จอ "สินค้าจม" ในรายงานสินค้าของ ZORT — ของที่ยังมีในคลังแต่ขายไม่ออกเกิน N วัน
 *
 *  ⚠️ **ตอบได้แค่เท่าที่มีประวัติออเดอร์จริง** — คลังเงาเก็บออเดอร์ย้อนหลังเท่าที่เคยดึงมา
 *     ถ้าประวัติสั้นกว่าช่วงที่ถาม จะได้จอที่บอกว่า "ทุกอย่างจม" ซึ่งผิดสนิท
 *     ⇒ ส่ง historyFrom กับ enoughHistory ออกไปทุกครั้ง **จอต้องเช็คก่อนแสดงผล**
 *        ไม่พอ = บอกตรง ๆ ว่ายังตอบไม่ได้ ห้ามแสดงรายการที่ดูเหมือนคำตอบ
 *  ⚠️ ZORT ไม่มีฟิลด์ "วันขายล่าสุด" ในสินค้า (ตรวจครบ 30 ฟิลด์แล้ว 3 ก.ย. 2569)
 *     ทางเดียวคือไล่จากใบขาย — จึงต้องมีประวัติในมือก่อนเท่านั้น
 */
export async function listDeadStock(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const days = Math.max(1, Math.min(3650, num(o.days) || 90));
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));

  const [snap] = await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`);
  const day = snap?.d;
  if (!day) return { note: "ยังไม่มีภาพถ่ายสต็อกในคลังเรา" };

  const [hist] = await coreQuery(`SELECT MIN(order_date) AS f, MAX(order_date) AS t FROM orders`);
  const historyFrom = hist?.f || null;
  // ⚠️ นับวันจาก "วันที่ถ่ายสต็อก" ไม่ใช่วันนี้ — สองค่านี้ไม่จำเป็นต้องเป็นวันเดียวกัน
  const cut = new Date(new Date(`${day}T00:00:00Z`).getTime() - days * 864e5)
    .toISOString()
    .slice(0, 10);
  const enoughHistory = Boolean(historyFrom) && historyFrom <= cut;

  const where = `cur.qty > 0 AND COALESCE(p.product_type,'') <> 'Service'`;
  const [sum] = await coreQuery(
    `SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(cur.qty * cur.price),0),2) AS value
     FROM stock_snapshots cur
     LEFT JOIN products p ON p.sku = cur.sku
     LEFT JOIN (SELECT sku, MAX(o.order_date) AS last_sold
                FROM order_items i JOIN orders o ON o.id = i.order_id
                GROUP BY sku) s ON s.sku = cur.sku
     WHERE cur.day = ${esc(day)} AND ${where}
       AND (s.last_sold IS NULL OR s.last_sold < ${esc(cut)})`
  );
  const rows = await coreQuery(
    `SELECT cur.sku AS sku, COALESCE(NULLIF(p.name,''), cur.name) AS name,
            COALESCE(p.category,'') AS category, s.last_sold AS lastSoldAt,
            cur.qty AS onhand, ROUND(cur.qty * cur.price, 2) AS value, cur.price AS price
     FROM stock_snapshots cur
     LEFT JOIN products p ON p.sku = cur.sku
     LEFT JOIN (SELECT sku, MAX(o.order_date) AS last_sold
                FROM order_items i JOIN orders o ON o.id = i.order_id
                GROUP BY sku) s ON s.sku = cur.sku
     WHERE cur.day = ${esc(day)} AND ${where}
       AND (s.last_sold IS NULL OR s.last_sold < ${esc(cut)})
     ORDER BY (cur.qty * cur.price) DESC, cur.sku
     LIMIT ${limit} OFFSET ${offset}`
  );
  return {
    day,
    days,
    cut, // ขายครั้งสุดท้ายก่อนวันนี้ = ถือว่าจม
    total: num(sum?.c),
    value: num(sum?.value),
    limit,
    offset,
    historyFrom, // ออเดอร์เก่าสุดที่คลังเงามี
    enoughHistory, // false = ประวัติสั้นกว่าช่วงที่ถาม **จอห้ามแสดงรายการ**
    note: enoughHistory
      ? "รายการที่ยังมีของในคลังแต่ไม่มีใบขายในช่วงที่กำหนด"
      : `ตอบไม่ได้ — คลังเงามีประวัติออเดอร์ตั้งแต่ ${historyFrom || "ยังไม่มีเลย"} ` +
        `ซึ่งสั้นกว่าช่วง ${days} วันที่ถาม · ต้องเติมประวัติย้อนหลังก่อน`,
    rows,
  };
}

/** สต็อกการ์ดรายสินค้า — ตารางการเคลื่อนไหวในหน้ารายละเอียดสินค้า (แบบ ZORT)
 *
 *  ⚠️ **ครอบคลุมไม่เท่า ZORT และต้องบอกให้ชัดว่าขาดอะไร**
 *     ได้: ขาย (order_items) · ซื้อ (purchase_order_items) · ปรับมือของเราเอง (stock_moves)
 *     ไม่ได้: **ใบ "ปรับ" · "ยกมา" · "โอน" ของ ZORT รายสินค้า**
 *            เพราะกระจกใบโอนเก็บแค่ "หัวใบ" ไม่มีรายการสินค้าในใบ
 *            และ ZORT ไม่เปิด API ให้ดึงรายการในใบโอน (ยิงจริงแล้ว 404)
 *            ⇒ ยอดคงเหลือสะสมจึงคำนวณย้อนหลังให้ไม่ได้ **ห้ามใส่คอลัมน์ "คงเหลือ" มั่ว**
 *  ⚠️ **ไม่มีข้อมูลรายคลัง** — ZORT มีตัวกรองคลัง (โกดัง/KLD/ANJ) เราไม่มี
 *     ⇒ ส่ง warehouses: null ออกไป ให้จอเขียนว่าทำไมกรองไม่ได้ ไม่ใช่ทำ dropdown เปล่า
 */
export async function stockCard(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const sku = String(o.sku ?? "").trim().slice(0, 60);
  if (!sku) return { error: "ต้องระบุ sku" };
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));

  /* ชื่อโหมดตรงกับตัวเลือกของ ZORT เท่าที่เราทำได้จริง
     ⚠️ **ค่าที่ไม่รู้จักต้องบอกออกไป ห้ามถอยไป all เงียบ ๆ**
        เดิมสะท้อน applied.kind = ค่าที่ส่งมา แต่ข้างในใช้ all ⇒ **ตัวสะท้อนโกหก**
        จอที่ใช้ applied เป็นด่านจะ "ผ่าน" ทั้งที่ข้อมูลไม่ตรงตัวกรองที่ขอ
        (ฝั่งจอทำนายเคสนี้ไว้ก่อนแล้วขอให้ยิงทดสอบ — เจอจริง 4 ก.ย. 2569)
        ⇒ applied.kind ต้องเป็น "ค่าที่ใช้จริง" เสมอ + บอกด้วยว่าค่าที่ส่งมาถูกเมิน */
  const KINDS = {
    all: ["sale", "buy", "adjust"],
    trade: ["sale", "buy"], // รายการซื้อขายทั้งหมด
    sale: ["sale"],
    buy: ["buy"],
    adjust: ["adjust"], // รายการปรับ (ของเราเอง — ไม่ใช่ใบปรับของ ZORT)
  };
  const asked = String(o.kind ?? "all");
  const known = Object.prototype.hasOwnProperty.call(KINDS, asked);
  const kind = known ? asked : "all";
  const want = KINDS[kind];

  const rows = [];
  if (want.includes("sale")) {
    for (const r of await coreQuery(
      `SELECT o.order_date AS date, 'ขาย' AS kind, o.status AS status,
              o.number AS ref, o.customer AS party, -oi.qty AS qty, oi.amount AS amount
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE oi.sku = ${esc(sku)} AND ${CANCEL_SQL.replace(/status/g, "o.status")}
       ORDER BY o.order_date DESC LIMIT ${limit}`
    )) rows.push(r);
  }
  if (want.includes("buy")) {
    for (const r of await coreQuery(
      `SELECT po.po_date AS date, 'ซื้อ' AS kind, po.status AS status,
              i.number AS ref, po.vendor AS party, i.qty AS qty, ROUND(i.qty * i.price, 2) AS amount
       FROM purchase_order_items i LEFT JOIN purchase_orders po ON po.number = i.number
       WHERE i.sku = ${esc(sku)}
       ORDER BY po.po_date DESC LIMIT ${limit}`
    )) rows.push(r);
  }
  if (want.includes("adjust")) {
    for (const r of await coreQuery(
      `SELECT date(at, '+7 hours') AS date, 'ปรับ (ของเราเอง)' AS kind, reason AS status,
              ref AS ref, '' AS party, qty AS qty, NULL AS amount
       FROM stock_moves WHERE sku = ${esc(sku)}
       ORDER BY at DESC LIMIT ${limit}`
    ).catch(() => [])) rows.push(r);
  }

  rows.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  /* ⚠️ **นับของทั้งหมดแยกตามแหล่ง — ไม่ใช่แค่ที่แสดง** (ฝั่งจอเจอตอนยิงจริง 4 ก.ย. 2569)
      เดิมดึงแต่ละแหล่ง LIMIT เท่ากัน แล้วรวม-เรียง-ตัด ⇒ ใบซื้อ 4 ใบที่เก่ากว่า
      ถูกดันตกหมดเมื่อใบขายเต็มเพดาน · จอเขียนว่า "รายการซื้อขายทั้งหมด"
      แต่แสดงใบขายล้วน ⇒ **อ่านได้ว่ารหัสนี้ไม่เคยซื้อเข้าเลย ทั้งที่ซื้อ 4 ครั้ง**
      ⇒ ส่งจำนวนจริงไปด้วย จอจะได้เขียน "แสดง 100 จาก N" แทนการเดาจากการชนเพดาน */
  const counts = { sale: 0, buy: 0, adjust: 0 };
  if (want.includes("sale")) {
    const [c] = await coreQuery(
      `SELECT COUNT(*) AS c FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE oi.sku = ${esc(sku)} AND ${CANCEL_SQL.replace(/status/g, "o.status")}`
    );
    counts.sale = num(c?.c);
  }
  if (want.includes("buy")) {
    const [c] = await coreQuery(
      `SELECT COUNT(*) AS c FROM purchase_order_items WHERE sku = ${esc(sku)}`
    );
    counts.buy = num(c?.c);
  }
  if (want.includes("adjust")) {
    const [c] = await coreQuery(
      `SELECT COUNT(*) AS c FROM stock_moves WHERE sku = ${esc(sku)}`
    ).catch(() => [{ c: 0 }]);
    counts.adjust = num(c?.c);
  }
  const total = counts.sale + counts.buy + counts.adjust;
  const shown = Math.min(rows.length, limit);
  return {
    sku,
    // ⚠️ สะท้อน **ค่าที่ใช้จริง** ไม่ใช่ค่าที่ส่งมา — ฝั่งจอใช้เป็นด่านจริง ห้ามถอด
    applied: { sku, kind, limit },
    total, // จำนวนจริงทั้งหมดในตัวกรองนี้ (ไม่ใช่จำนวนที่แสดง)
    shown,
    counts, // แยกตามแหล่ง — จอเขียนได้ว่า "ขาย N · ซื้อ M · ปรับ K"
    // ⚠️ true = มีของถูกตัดออกเพราะชนเพดาน **จอต้องเขียนบอก ห้ามตัดเงียบ**
    truncated: total > shown,
    // ค่าที่ส่งมาแต่ไม่รู้จัก → บอกให้รู้ ไม่เมินเงียบ
    ...(known ? {} : { ignored: { kind: asked }, note: `ไม่รู้จักตัวกรอง "${asked}" — ใช้ "all" แทน` }),
    kinds: [
      { key: "all", label: "การเคลื่อนไหว" },
      { key: "trade", label: "รายการซื้อขายทั้งหมด" },
      { key: "sale", label: "รายการขายเท่านั้น" },
      { key: "buy", label: "รายการซื้อเท่านั้น" },
      { key: "adjust", label: "รายการปรับเท่านั้น" },
    ],
    // ⚠️ ZORT มี 8 ตัวเลือก เราทำได้ 5 — บอกไปตรง ๆ ว่าขาดอันไหนและเพราะอะไร
    missingKinds: [
      "การเคลื่อนไหวที่รอโอนเท่านั้น",
      "รายการยกมา",
      "รายการโอนระหว่างคลัง",
    ],
    warehouses: null, // ไม่มีข้อมูลรายคลัง — จอต้องเขียนเหตุผล ไม่ใช่ทำ dropdown เปล่า
    coverage:
      "ครอบคลุม: ขาย · ซื้อ · ปรับด้วยมือในระบบเรา · " +
      "ยังไม่รวม: ใบ 'ปรับ' และ 'ยกมา' ของ ZORT รายสินค้า (กระจกใบโอนเก็บแค่หัวใบ " +
      "และ ZORT ไม่เปิด API ให้ดึงรายการในใบ) · ไม่มีคอลัมน์คงเหลือสะสมเพราะคำนวณย้อนหลังไม่ครบ",
    rows: rows.slice(0, limit),
  };
}

/** 🔔 ตัวตรวจ "สินค้าหายจากช่องทางขาย" — จับเรื่องแบบเครื่อง 00073 ที่หายไป 3 เดือน
 *
 *  ⚠️ **นี่คือบั๊กคลาสเดียวกับที่เราไล่จับทั้งวัน แต่เป็นเวอร์ชันธุรกิจ**
 *     ไม่มีจอไหนแดง · ไม่มี error สักตัว · ระบบทุกตัวรายงานว่าปกติ
 *     **ยอดแค่หายไปเงียบ ๆ 3 เดือน** แล้วรู้ตอนบังเอิญมาไล่ดูกราฟ
 *     (เครื่อง 00073: พ.ค. 0 · มิ.ย. 1 · ก.ค. 1 ชิ้น ทั้งที่มีของ 66 ตัวในคลัง
 *      และเดือนเดียวกันนั้นร้านขายของอื่นบน Lazada ได้ 180-250 ใบตามปกติ
 *      ⇒ เสียโอกาสราว 100-150 ชิ้น หรือ 600,000-900,000 บาท)
 *
 *  ⚠️ **ไม่ต้องใช้ API ของมาร์เก็ตเพลสเลย** — ใช้ช่องทางที่ติดมากับใบขายใน ZORT
 *     ⇒ ครอบคลุม Lazada · Shopee · TikTok ได้ทันที **รวมเจ้าที่เรายังต่อ API ไม่ได้**
 *
 *  ⚠️ **ไม่ใช่ตัวตรวจว่า "ขายไม่ดี" — เป็นตัวตรวจว่า "หายไปจากช่องทางที่เคยขายได้"**
 *     เกณฑ์: เคยขายช่องทางนั้นสม่ำเสมอในอดีต · ช่วงหลังเงียบสนิท · **แต่ยังมีของในคลัง**
 *     ของหมด = ไม่เข้าข่าย (นั่นคือปัญหาสต็อก คนละเรื่อง)
 */
export async function channelGaps(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const quiet = Math.max(7, Math.min(365, num(o.quietDays) || 45)); // เงียบกี่วันถึงนับว่าหาย
  const look = Math.max(30, Math.min(730, num(o.lookbackDays) || 365)); // ดูอดีตย้อนไปแค่ไหน
  const minSold = Math.max(1, num(o.minSold) || 5); // เคยขายอย่างน้อยกี่ชิ้นถึงถือว่า "เคยขายได้"
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));

  const [snap] = await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`);
  const day = snap?.d;
  if (!day) return { note: "ยังไม่มีภาพถ่ายสต็อก" };
  const cut = new Date(new Date(`${day}T00:00:00Z`).getTime() - quiet * 864e5).toISOString().slice(0, 10);
  const from = new Date(new Date(`${day}T00:00:00Z`).getTime() - look * 864e5).toISOString().slice(0, 10);

  const [hist] = await coreQuery(`SELECT MIN(order_date) AS f FROM orders`);
  const historyFrom = hist?.f || null;
  // ⚠️ ประวัติสั้นกว่าช่วงที่ถาม = ตอบไม่ได้ **ห้ามตอบเป็นรายการที่ดูเหมือนคำตอบ**
  const enough = Boolean(historyFrom) && historyFrom <= from;

  const rows = enough
    ? await coreQuery(
        `WITH sold AS (
           SELECT oi.sku AS sku, o.channel AS ch,
                  SUM(CASE WHEN o.order_date <  ${esc(cut)} THEN oi.qty ELSE 0 END) AS before_qty,
                  SUM(CASE WHEN o.order_date >= ${esc(cut)} THEN oi.qty ELSE 0 END) AS after_qty,
                  MAX(o.order_date) AS last_sold
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.order_date >= ${esc(from)} AND ${CANCEL_SQL.replace(/status/g, "o.status")}
             AND oi.sku IS NOT NULL AND oi.sku <> ''
             AND COALESCE(o.channel,'') <> '' AND o.channel NOT LIKE '%POS%'
           GROUP BY oi.sku, o.channel
         )
         SELECT s.sku AS sku, s.ch AS channel, s.before_qty AS soldBefore,
                s.last_sold AS lastSoldOnChannel, cur.qty AS onhand,
                COALESCE((SELECT name FROM products WHERE sku = s.sku), cur.name) AS name,
                ROUND(cur.qty * cur.price, 2) AS stockValue
         FROM sold s JOIN stock_snapshots cur ON cur.sku = s.sku AND cur.day = ${esc(day)}
         WHERE s.after_qty = 0 AND s.before_qty >= ${minSold} AND cur.qty > 0
         ORDER BY s.before_qty DESC LIMIT ${limit}`
      )
    : [];

  return {
    day,
    quietDays: quiet,
    lookbackDays: look,
    minSold,
    cut, // ไม่มีการขายบนช่องทางนั้นตั้งแต่วันนี้ = เข้าข่าย
    historyFrom,
    enoughHistory: enough,
    total: rows.length,
    applied: { quietDays: quiet, lookbackDays: look, minSold, limit },
    note: enough
      ? "สินค้าที่เคยขายได้บนช่องทางนั้น แต่เงียบสนิทช่วงหลัง ทั้งที่ยังมีของในคลัง"
      : `ตอบไม่ได้ — มีประวัติออเดอร์ตั้งแต่ ${historyFrom || "ยังไม่มีเลย"} ซึ่งสั้นกว่าช่วง ${look} วันที่ถาม`,
    // ⚠️ ไม่ได้แปลว่า "ถูกซ่อน" เสมอไป — อาจหยุดขายเอง ปรับราคา หรือของรุ่นนั้นเลิกทำ
    //    จอต้องเขียนว่าเป็น "จุดที่ควรไปดู" ไม่ใช่ "ข้อสรุปว่าผิดพลาด"
    caveat:
      "เป็นจุดที่ควรไปดูในหน้าร้านช่องทางนั้น ไม่ใช่ข้อสรุปว่าถูกซ่อน — " +
      "อาจหยุดขายเอง เปลี่ยนรุ่น หรือปรับราคาก็ได้",
    rows,
  };
}
