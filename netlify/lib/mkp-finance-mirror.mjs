/* 💰 กระจกการเงินมาร์เก็ตเพลส — **Shopee เท่านั้น** (18 ก.ย. 2569)
 *
 * ทำไมแค่ Shopee: เป็นเจ้าเดียวที่ **สูตรถูกวัดกับของจริงแล้ว**
 *   items − commission − serviceFee − sellerTransactionFee − paymentFee − shippingActual
 *     + shippingSubsidyByShopee + shippingPaidByBuyer  ≈ escrow ที่เขาบอก
 *   วัด 8 ใบ: ต่างกัน 1 บาทใน 6 ใบ · อีก 2 ใบต่าง 13 และ 19 (ยังมีช่องที่ไม่ได้จับคู่อีก ~70 ช่อง)
 *   ⚠️ Lazada/TikTok ยังไม่มีสูตรที่พิสูจน์แล้ว ⇒ **ห้ามเอาโค้ดนี้ไปลอกใช้กับเขาโดยไม่วัดใหม่**
 *      ตัวเลขการเงินที่ไม่ตรงแต่ดูน่าเชื่อ อันตรายกว่าไม่มีตัวเลข (คนเอาไปตัดสินใจเรื่องราคา)
 *
 * 🔑 กติกาตัวเลขของตารางนี้
 *   · ทุกคอลัมน์เงิน **ยอมให้เป็น NULL** ห้าม NOT NULL DEFAULT 0
 *     0 บาท = "ไม่มีค่านี้จริง ๆ" · NULL = "Shopee ไม่ส่งช่องนี้มา" — คนละเรื่องกันคนละทิศ
 *   · `formula_diff` = สูตรของเรา − escrow ที่เขาบอก ⇒ **ตัวเฝ้าสัญญา**
 *     วันที่ Shopee เพิ่ม/เปลี่ยนช่อง ค่านี้จะเริ่มเพี้ยนก่อนที่ใครจะรู้ตัว
 *     (กฎ nets-expire-silently — ตาข่ายที่เคยถูกแล้วหยุดอัปเดตจะเงียบ ไม่แดง)
 *   · `fields_count` = จำนวนช่องที่ escrow ส่งมารอบนั้น ⇒ ช่องเพิ่ม = สัญญาเปลี่ยน ต้องมาดู
 *   · `cogs` เก็บไว้ **ห้ามเอาไปคิดกำไร** — วัดแล้วเท่ากับราคาขายเป๊ะทั้ง 50 ใบ
 *     (Shopee เอาราคาขายมาใส่ช่องชื่อต้นทุน เพราะร้านไม่ได้กรอกต้นทุนไว้ในระบบเขา)
 *   · ไม่เก็บ `buyer_name` / ที่อยู่ / เบอร์ เด็ดขาด — ตัวอ่านไม่ส่งมาให้ตั้งแต่ต้นทาง
 *
 * ⏱️ Netlify ให้ฟังก์ชันรอผลได้ ~26 วินาที และ escrow ยิงได้ทีละใบ (ไม่มีเส้นแบบก้อน)
 *    ⇒ ตัวนี้ทำงานเป็น **รอบ ๆ** มีเพดานเวลาในตัว และคืน `remaining` ให้คนเรียกรู้ว่ายังเหลือ
 *    ⚠️ หมดเวลาแล้วต้องบอกว่า `truncatedByTime: true` — **ห้ามคืนผลบางส่วนที่หน้าตาเหมือนครบ**
 */

import { coreQuery } from "./coredb.mjs";
import { readShopeeOrderFees } from "./mkp-finance.mjs";

const TIME_BUDGET_MS = 17_000;   // เหลือที่ให้ตัวเรียกเขียนคำตอบ + เผื่อ D1 ข้ามแปซิฟิก (~286ms/คำขอ)
const MAX_PER_ROUND = 40;        // กันคนยิง limit=5000 แล้วฟังก์ชันตายกลางทาง

export async function ensureFeesTable() {
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS shopee_fees (
      order_sn TEXT PRIMARY KEY,
      day TEXT,
      escrow REAL, items_total REAL,
      commission REAL, service_fee REAL, payment_fee REAL, seller_txn_fee REAL,
      ship_buyer REAL, ship_actual REAL, ship_subsidy REAL, ship_discount_seller REAL,
      voucher_shopee REAL, voucher_seller REAL, coins REAL,
      cogs REAL, withholding_tax REAL,
      formula_diff REAL, fields_count INTEGER,
      at TEXT DEFAULT (datetime('now')))`,
    [], { heal: false }
  );
  /* ดัชนีตามวัน — จอจะถามแบบ "เดือนนี้ค่าธรรมเนียมรวมเท่าไร" ซึ่งกรองด้วย day เสมอ */
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_sp_fees_day ON shopee_fees(day)`, [], { heal: false });
}

/* สูตรที่วัดแล้ว — คืน null ถ้า **ช่องที่จำเป็นขาด** ห้ามแทน 0 แล้วคิดต่อ
   (ขาดช่องแล้วแทน 0 = ได้ diff สวยงามที่ไม่ได้พิสูจน์อะไร — กฎ blank-input-invents-output) */
export function shopeeNet(f) {
  const need = ["itemsTotal", "commission", "serviceFee", "paymentFee", "shippingActual"];
  if (need.some((k) => f?.[k] === null || f?.[k] === undefined)) return null;
  const n = (v) => (v === null || v === undefined ? 0 : v);   // ช่องที่ "ไม่มีก็แปลว่าไม่มีรายการนั้น"
  return f.itemsTotal - f.commission - f.serviceFee - n(f.sellerTransactionFee) - f.paymentFee
    - f.shippingActual + n(f.shippingSubsidyByShopee) + n(f.shippingPaidByBuyer);
}

/** เติมกระจกค่าธรรมเนียม Shopee ทีละรอบ
 *  @param {object} o
 *  @param {number} o.days  ย้อนหลังกี่วัน (คิดเป็นวันไทย — `order_date` ในกระจกเก็บวันไทยแล้ว)
 *  @param {number} o.limit กี่ใบต่อรอบ (เพดาน 40)
 *  @param {boolean} o.refresh ยิงซ้ำใบที่มีอยู่แล้ว (ค่าปกติ: ข้ามใบที่มีแล้ว)
 */
export async function mirrorShopeeFees(o = {}) {
  const t0 = Date.now();
  const days = Math.max(1, Math.min(120, parseInt(o.days ?? "14", 10) || 14));
  const limit = Math.max(1, Math.min(MAX_PER_ROUND, parseInt(o.limit ?? "20", 10) || 20));
  const refresh = !!o.refresh;
  await ensureFeesTable();

  /* หาใบที่ยังไม่มีในกระจกค่าธรรมเนียม
     ⚠️ คิดวันแบบไทย: D1 `datetime('now')` เป็น UTC ⇒ ต้อง +7 ก่อนตัดวัน
        ไม่บวก = หน้าต่างเหลื่อม 7 ชม. แล้วใบช่วงเช้าไทยหลุดรอบ (เจอมาแล้วที่ core-stock) */
  const sql = `SELECT o.order_sn, o.order_date FROM shopee_orders o
      ${refresh ? "" : "LEFT JOIN shopee_fees f ON f.order_sn = o.order_sn"}
      WHERE o.order_date >= date('now', '+7 hours', ?)
        ${refresh ? "" : "AND f.order_sn IS NULL"}
      ORDER BY o.order_date DESC LIMIT ?`;
  const todo = await coreQuery(sql, [`-${days} days`, limit]);
  const rows = Array.isArray(todo?.results) ? todo.results : [];

  /* เหลืออีกกี่ใบ — ถามแยกเพื่อให้คนเรียกรู้ว่าต้องยิงอีกกี่รอบ
     ⚠️ เลขนี้วัด **ก่อน** รอบนี้เขียน ⇒ ป้ายกำกับว่าเป็น "ก่อนรอบนี้" ห้ามให้อ่านเป็นยอดคงเหลือหลังรอบ */
  const left = await coreQuery(
    `SELECT COUNT(*) AS n FROM shopee_orders o
       LEFT JOIN shopee_fees f ON f.order_sn = o.order_sn
      WHERE o.order_date >= date('now', '+7 hours', ?) AND f.order_sn IS NULL`,
    [`-${days} days`]
  );

  const out = {
    ok: true, platform: "shopee", grain: "order-fees",
    ขอบเขต: `ออเดอร์ Shopee ในกระจกย้อน ${days} วัน (วันไทย)`,
    หยิบมารอบนี้: rows.length,
    ค้างก่อนรอบนี้: Number(left?.results?.[0]?.n ?? 0),
    เขียนแล้ว: 0, ข้ามเพราะไม่มีก้อนรายได้: 0, ยิงไม่สำเร็จ: 0,
    truncatedByTime: false,
    ใบที่สูตรต่างเกิน2บาท: [],
  };
  if (!rows.length) {
    out.สรุป = refresh
      ? "ไม่มีใบในช่วงนี้เลย — กระจกออเดอร์ Shopee อาจยังไม่ได้ซิงก์ช่วงนี้ (ไม่ใช่ว่าไม่มีค่าธรรมเนียม)"
      : "ครบแล้วในช่วงนี้ — ทุกใบมีค่าธรรมเนียมในกระจกหมด";
    return out;
  }

  for (const r of rows) {
    /* ⏱️ เช็คเวลาก่อนยิงใบถัดไป ไม่ใช่หลังยิง — เหลือ 1 วิแล้วยิงต่อคือแช่แข็งกลางทาง */
    if (Date.now() - t0 > TIME_BUDGET_MS) { out.truncatedByTime = true; break; }
    const f = await readShopeeOrderFees(r.order_sn);
    if (f?.skip) { out.skip = f.skip; break; }               // ยังไม่ได้เชื่อมร้าน ⇒ หยุดทั้งรอบ ไม่ใช่นับเป็นพลาด
    if (!f?.ok) { out.ยิงไม่สำเร็จ += 1; out.ตัวอย่างข้อผิดพลาด ??= String(f?.error ?? "").slice(0, 160); continue; }
    if (!f.found) { out["ข้ามเพราะไม่มีก้อนรายได้"] += 1; continue; }

    const net = shopeeNet(f);
    const diff = net === null || f.escrowAmount === null ? null : Math.round((net - f.escrowAmount) * 100) / 100;
    await coreQuery(
      `INSERT INTO shopee_fees (order_sn, day, escrow, items_total, commission, service_fee,
         payment_fee, seller_txn_fee, ship_buyer, ship_actual, ship_subsidy, ship_discount_seller,
         voucher_shopee, voucher_seller, coins, cogs, withholding_tax, formula_diff, fields_count, at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
       ON CONFLICT(order_sn) DO UPDATE SET
         day=excluded.day, escrow=excluded.escrow, items_total=excluded.items_total,
         commission=excluded.commission, service_fee=excluded.service_fee,
         payment_fee=excluded.payment_fee, seller_txn_fee=excluded.seller_txn_fee,
         ship_buyer=excluded.ship_buyer, ship_actual=excluded.ship_actual,
         ship_subsidy=excluded.ship_subsidy, ship_discount_seller=excluded.ship_discount_seller,
         voucher_shopee=excluded.voucher_shopee, voucher_seller=excluded.voucher_seller,
         coins=excluded.coins, cogs=excluded.cogs, withholding_tax=excluded.withholding_tax,
         formula_diff=excluded.formula_diff, fields_count=excluded.fields_count, at=datetime('now')`,
      [r.order_sn, r.order_date ?? null, f.escrowAmount, f.itemsTotal, f.commission, f.serviceFee,
        f.paymentFee, f.sellerTransactionFee, f.shippingPaidByBuyer, f.shippingActual,
        f.shippingSubsidyByShopee, f.shippingDiscountSeller, f.voucherByShopee, f.voucherBySeller,
        f.coinsByShopee, f.cogs, f.withholdingTax, diff,
        Array.isArray(f.fieldsSeenThisPage) ? f.fieldsSeenThisPage.length : null]
    );
    out.เขียนแล้ว += 1;
    /* 🔎 ใบที่สูตรเพี้ยน — โชว์ไม่เกิน 5 ใบ (เลขนี้เพื่อการแสดงผล ห้ามเอาไปตัดสินใจ) */
    if (diff !== null && Math.abs(diff) > 2 && out.ใบที่สูตรต่างเกิน2บาท.length < 5)
      out.ใบที่สูตรต่างเกิน2บาท.push({ order_sn: r.order_sn, ต่าง: diff });
  }

  out.สรุป = `เขียน ${out.เขียนแล้ว} ใบ` +
    (out.truncatedByTime ? " · หมดเวลารอบนี้ ยังไม่ครบ ต้องยิงซ้ำ" : "") +
    (out.ยิงไม่สำเร็จ ? ` · ยิงไม่สำเร็จ ${out.ยิงไม่สำเร็จ} ใบ` : "");
  return out;
}

/** สรุปค่าธรรมเนียมจากกระจก — ให้จอเรียกอ่าน (ไม่ยิง Shopee เลย เร็วและไม่กินโควตา)
 *  ⚠️ ทุกยอดมาจาก **ใบที่มีในกระจกเท่านั้น** ⇒ ต้องคืน `ครอบกี่ใบ` คู่ไปด้วยทุกครั้ง
 *     ไม่คืน = คนอ่านจะคิดว่าเป็นยอดของทุกใบในช่วงนั้น (กฎ partial-coverage-reported-as-full)
 */
export async function shopeeFeesSummary(o = {}) {
  const days = Math.max(1, Math.min(400, parseInt(o.days ?? "30", 10) || 30));
  await ensureFeesTable();
  const q = await coreQuery(
    `SELECT COUNT(*) AS ใบในกระจก,
            ROUND(SUM(escrow),2) AS ยอดโอนสุทธิ,
            ROUND(SUM(items_total),2) AS ราคาสินค้ารวม,
            ROUND(SUM(commission),2) AS คอมมิชชั่น,
            ROUND(SUM(service_fee),2) AS ค่าบริการ,
            ROUND(SUM(payment_fee),2) AS ค่าธรรมเนียมชำระเงิน,
            ROUND(SUM(ship_actual),2) AS ค่าส่งตามจริง,
            ROUND(SUM(voucher_seller),2) AS ส่วนลดที่ร้านออกเอง,
            ROUND(SUM(withholding_tax),2) AS ภาษีหักณที่จ่าย,
            SUM(CASE WHEN formula_diff IS NULL THEN 1 ELSE 0 END) AS ใบที่เทียบสูตรไม่ได้,
            SUM(CASE WHEN ABS(formula_diff) > 2 THEN 1 ELSE 0 END) AS ใบที่สูตรต่างเกิน2บาท,
            ROUND(MAX(ABS(formula_diff)),2) AS ต่างมากสุด
       FROM shopee_fees WHERE day >= date('now', '+7 hours', ?)`,
    [`-${days} days`]
  );
  const all = await coreQuery(
    `SELECT COUNT(*) AS n FROM shopee_orders WHERE order_date >= date('now', '+7 hours', ?)`,
    [`-${days} days`]
  );
  const row = q?.results?.[0] ?? {};
  const inMirror = Number(row["ใบในกระจก"] ?? 0);
  const total = Number(all?.results?.[0]?.n ?? 0);
  return {
    ok: true, platform: "shopee", grain: "order-fees",
    ขอบเขต: `ย้อน ${days} วัน (วันไทย)`,
    ...row,
    ครอบกี่ใบ: `${inMirror} จาก ${total} ใบในกระจกออเดอร์`,
    ครอบครบไหม: total === 0 ? null : inMirror >= total,
    /* 🔴 ครอบไม่ครบต้องประกาศตัว — ไม่งั้นยอดรวมข้างบนถูกอ่านเป็นยอดของทุกใบ */
    ...(total > inMirror ? { "⚠️ ยอดข้างบนยังไม่ครบ": `ขาด ${total - inMirror} ใบ — ยิง ?mkpfeesync=1 ต่อจนครบก่อนเอาไปใช้` } : {}),
    "หมายเหตุ cogs": "ไม่รวมในสรุปโดยตั้งใจ — Shopee ส่งราคาขายมาในช่องชื่อต้นทุน (วัดแล้ว 50/50 ใบเท่ากันเป๊ะ)",
  };
}
