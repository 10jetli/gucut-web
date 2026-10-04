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

import { coreQuery, แถวจากผล } from "./coredb.mjs";
import { readShopeeOrderFees } from "./mkp-finance.mjs";

const TIME_BUDGET_MS = 17_000;   // เหลือที่ให้ตัวเรียกเขียนคำตอบ + เผื่อ D1 ข้ามแปซิฟิก (~286ms/คำขอ)
const MAX_PER_ROUND = 40;        // กันคนยิง limit=5000 แล้วฟังก์ชันตายกลางทาง

/** เกณฑ์ "สูตรต่าง" หน่วยบาท — **แหล่งเดียว**
 *  🔑 ช่องสถานะ (`status.mjs`) · สรุป · เส้นอ่านรายใบ ต้องใช้เลขเดียวกัน
 *     ไม่งั้นสองจอบอกคนละจำนวนเรื่องเดียวกัน แล้วไม่มีใครรู้ว่าจะเชื่อใคร */
export const เกณฑ์ต่างบาท = 2;

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
      /* ค่าคอมมิชชันโฆษณา/แอฟฟิลิเอต — อธิบายผลต่างได้ 95.2% (ยืนยัน 91/91 ใบ 4 ต.ค. 2569)
         ⚠️ แถวที่ซิงก์มาก่อนวันนั้นเป็น NULL และ formula_diff ของแถวเก่าคิดจากสูตรที่ยังไม่มีช่องนี้
            ⇒ ต้องกวาดซ้ำให้แถวเก่าคิดใหม่ ไม่ใช่เชื่อเลขเดิม
         (ห้ามใส่ backtick ในคอมเมนต์ก้อนนี้ — อยู่ใน template literal ⇒ ปิดสตริงกลางทาง
          ผมเหยียบคลาสนี้เป็นครั้งที่สองในคืนเดียว node --check จับได้ทั้งสองครั้ง) */
      ams_commission REAL,
      formula_diff REAL, fields_count INTEGER,
      at TEXT DEFAULT (datetime('now')))`,
    [], { heal: false }
  );
  /* ━━ คอลัมน์ที่เพิ่มทีหลัง ต้องมาทาง ALTER เสมอ ━━
     🔴 `CREATE TABLE IF NOT EXISTS` ข้างบน **ไม่แตะตารางที่มีอยู่แล้ว** ⇒ เขียน `ams_commission`
        ลงใน DDL อย่างเดียวจะไม่เกิดคอลัมน์บนฐานจริงที่มีแถวอยู่แล้ว **แบบเงียบสนิท**
        แล้ว INSERT รอบถัดไปจะตอบ "no such column" — ผมเกือบ push แบบนั้นไปแล้ว 4 ต.ค. 2569
     🔑 ตารางนี้ **ไม่ได้ถูกสร้างใน coreInit()** ⇒ ALTER ต้องอยู่ที่นี่ ไม่ใช่ในรายการของ coredb.mjs
        (ถ้าย้ายไปที่นั่น มันจะยิงตอนที่ตารางอาจยังไม่เกิด แล้วได้ "no such table" ที่ไม่ถูกกลืน)
     ⚠️ กลืนได้เฉพาะ "คอลัมน์มีอยู่แล้ว" — อย่างอื่นต้องโยนต่อ (กฎเดียวกับ coredb.mjs)
        กลืนหมด = วันที่ ALTER พลาดจริง จะไม่มีใครรู้จนกระทบที่อื่น */
  for (const sql of [
    `ALTER TABLE shopee_fees ADD COLUMN ams_commission REAL`,
    `ALTER TABLE shopee_fees ADD COLUMN reverse_shipping_fee REAL`,
  ]) {
    try {
      await coreQuery(sql, [], { heal: false });
    } catch (e) {
      const ข้อความ = String(e?.message || e);
      if (!/duplicate column|already exists/i.test(ข้อความ)) throw e;
    }
  }
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
    - f.shippingActual + n(f.shippingSubsidyByShopee) + n(f.shippingPaidByBuyer)
    /* ━━ ค่าคอมมิชชันโฆษณา/แอฟฟิลิเอต (เพิ่ม 4 ต.ค. 2569) ━━
       📏 ยืนยันครบ 91/91 ใบที่สูตรต่าง: อธิบายผลต่างได้ **4,571 จาก 4,801 บาท = 95.2%**
          `|diff − ams| ≤ 1 บาท` ใน 87/91 ใบ · ค่ากลางของส่วนที่เหลือ 1.00 บาท
       ⚠️ อยู่ในกอง `n()` (ไม่มีก็แปลว่าไม่มีรายการนั้น) **ไม่ใช่กอง `need`**
          เพราะใบที่ไม่ได้ลงโฆษณาจะไม่มีช่องนี้เลย ⇒ ใส่ใน `need` จะทำให้สูตรคืน null ทั้งที่ควรคิดได้
       ⚠️ **ยังเหลือ 230 บาทใน 4 ใบที่ ams = 0** (38 · 38 · 38 · 29) ⇒ ชิ้นที่สองคนละเรื่อง
          ⇒ ห้ามเขียนว่าสูตรปิดจบ */
    - n(f.amsCommission)
    /* ━━ ค่าส่งกลับตอนคืนสินค้า (5 ต.ค. 2569) — ปิด 4 ใบสุดท้ายที่ยังต่าง ━━
       📏 38 · 38 · 38 · 29 ตรงกับผลต่างครบ 4/4 ใบ · ทั้งสี่เป็นใบคืนสินค้า
       ⚠️ อยู่ในกอง n() เพราะใบปกติไม่มีช่องนี้เลย (สุ่มใบที่สูตรตรง 15 ใบ = 0 ทั้งหมด)
          ใส่ใน need จะทำให้สูตรคืน null ทั้งที่คิดได้
       🔑 ช่องที่เกือบเลือกผิด: actual_shipping_fee ตรง 2 ใน 4 ⇒ เกณฑ์คือ "อธิบายได้ทุกใบ" */
    - n(f.reverseShippingFee);
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
  /* ━━ ลำดับการหยิบใบ: โหมดปกติ vs โหมดกวาดซ้ำ ━━
     🔴 **ของเดิมโหมด refresh เดินหน้าไม่ได้เลย** (เจอ 4 ต.ค. 2569 ตอนจะกวาดซ้ำ 91 ใบจริง)
        เพราะ refresh ถอด LEFT JOIN ออก แล้วเรียง order_date DESC LIMIT 40
        ⇒ ยิงกี่รอบก็ได้ **40 ใบใหม่สุดชุดเดิมทุกรอบ** ใบที่เก่ากว่านั้นไม่มีวันถึงคิว
        ⇒ ⇒ "กวาดซ้ำทั้งกระจก" ทำไม่ได้ และหน้าตาเหมือนทำได้ทุกประการ (แต่ละรอบตอบ เขียนแล้ว 40)
     🔑 โหมดกวาดซ้ำจึงเรียงจาก **ใบที่ซิงก์ไว้นานที่สุดก่อน** (at เก่าสุด · ไม่มีแถว = ก่อนสุด)
        การเขียนทุกครั้งตั้ง at=datetime('now') ⇒ ใบที่เพิ่งกวาดจะไปท้ายคิวเอง
        ⇒ ยิงซ้ำเรื่อย ๆ แล้ว **ครบทั้งกระจกแน่นอน** ไม่ต้องจำ offset และยิงซ้ำเกินก็ไม่เสียหาย */
  const sql = `SELECT o.order_sn, o.order_date FROM shopee_orders o
      LEFT JOIN shopee_fees f ON f.order_sn = o.order_sn
      WHERE o.order_date >= date('now', '+7 hours', ?)
        ${refresh ? "" : "AND f.order_sn IS NULL"}
      ORDER BY ${refresh ? "CASE WHEN f.at IS NULL THEN 0 ELSE 1 END, f.at ASC," : ""} o.order_date DESC
      LIMIT ?`;
  const todo = await coreQuery(sql, [`-${days} days`, limit]);
  const rows = แถวจากผล(todo, "หาใบที่ยังไม่มีค่าธรรมเนียม");

  /* เหลืออีกกี่ใบ — ถามแยกเพื่อให้คนเรียกรู้ว่าต้องยิงอีกกี่รอบ
     ⚠️ เลขนี้วัด **ก่อน** รอบนี้เขียน ⇒ ป้ายกำกับว่าเป็น "ก่อนรอบนี้" ห้ามให้อ่านเป็นยอดคงเหลือหลังรอบ
     ⚠️ โหมดกวาดซ้ำนับคนละอย่าง: "ยังไม่มีแถว" ไม่ใช่เกณฑ์ที่มีความหมายในโหมดนั้น
        ⇒ นับ "ใบที่ยังไม่เคยกวาดด้วยสูตรใหม่" แทน (ams_commission เป็น NULL)
        เอาเกณฑ์เดียวกันทั้งสองโหมด = เลขจะเป็น 0 ตลอดในโหมดกวาดซ้ำ แล้วดูเหมือนเสร็จตั้งแต่รอบแรก */
  const left = refresh
    ? await coreQuery(
        `SELECT COUNT(*) AS n FROM shopee_orders o
           JOIN shopee_fees f ON f.order_sn = o.order_sn
          WHERE o.order_date >= date('now', '+7 hours', ?) AND f.ams_commission IS NULL`,
        [`-${days} days`]
      )
    : await coreQuery(
        `SELECT COUNT(*) AS n FROM shopee_orders o
           LEFT JOIN shopee_fees f ON f.order_sn = o.order_sn
          WHERE o.order_date >= date('now', '+7 hours', ?) AND f.order_sn IS NULL`,
        [`-${days} days`]
      );

  const out = {
    ok: true, platform: "shopee", grain: "order-fees",
    ขอบเขต: `ออเดอร์ Shopee ในกระจกย้อน ${days} วัน (วันไทย)`,
    หยิบมารอบนี้: rows.length,
    ค้างก่อนรอบนี้: Number(แถวจากผล(left, "นับใบที่ยังค้าง")[0]?.n ?? 0),
    /* 🔑 ป้ายบอกว่าเลข "ค้างก่อนรอบนี้" ข้างบนนับอะไร — สองโหมดนับคนละอย่าง
       ไม่ติดป้าย = คนอ่านเลขเดียวกันคนละความหมายโดยไม่มีอะไรบอก */
    "ค้างก่อนรอบนี้นับอะไร": refresh
      ? "ใบที่ยังไม่เคยกวาดด้วยสูตรที่มีค่าคอมโฆษณา (ams_commission เป็น NULL)"
      : "ใบที่ยังไม่มีแถวในกระจกค่าธรรมเนียมเลย",
    โหมด: refresh ? "กวาดซ้ำ (เรียงจากใบที่ซิงก์ไว้นานสุด)" : "เติมใบที่ยังไม่มี",
    เขียนแล้ว: 0, ข้ามเพราะไม่มีก้อนรายได้: 0, ยิงไม่สำเร็จ: 0,
    truncatedByTime: false,
    ใบที่สูตรต่างเกิน2บาท: [],
  };
  if (!rows.length) {
    /* 🔑 **"ครบแล้ว" กับ "ไม่มีอะไรให้ทำ" แยกจากกันด้วยเลข ไม่ใช่ด้วยถ้อยคำ** (27 ก.ย. 2569)
       ของเดิมพูดว่า *ครบแล้วในช่วงนี้ — ทุกใบมีค่าธรรมเนียมในกระจกหมด* ซึ่งเป็น
       **คำยืนยันเชิงบวก** ที่ออกมาเหมือนกันทั้งตอนครบจริง และตอนตัวอ่านพัง (`rows` ว่างเสมอ)
       ⇒ ⇒ เก้าวันที่ไม่เคยเขียนอะไรเลย หน้าจอขึ้นข้อความว่าทุกอย่างเรียบร้อย
       ⇒ ข้อความกับตรรกะต้องมาจาก **ตัวแปรตัวเดียวกัน** และต้องส่งเลขติดไปด้วยทุกครั้ง
          ถ้าออเดอร์ในช่วง > 0 แต่หยิบได้ 0 และค้าง 0 ⇒ ฟ้องตัวเองทันที */
    const ออเดอร์ในช่วง = Number(แถวจากผล(await coreQuery(
      `SELECT COUNT(*) AS n FROM shopee_orders WHERE order_date >= date('now', '+7 hours', ?)`,
      [`-${days} days`]
    ), "นับออเดอร์ในช่วง (ตอนไม่มีใบให้ทำ)")[0]?.n ?? 0);
    out.ออเดอร์ในช่วง = ออเดอร์ในช่วง;
    out.สรุป = ออเดอร์ในช่วง === 0
      ? `ไม่มีออเดอร์ Shopee ในกระจกย้อน ${days} วันเลย — ไม่มีอะไรให้ทำ (คนละเรื่องกับ "ค่าธรรมเนียมครบ")`
      : refresh
        ? `มีออเดอร์ ${ออเดอร์ในช่วง} ใบ แต่หยิบมาได้ 0 ใบทั้งที่สั่ง refresh ⇒ ผิดปกติ ให้ดูตัวอ่านแถว`
        : `ครบแล้ว — ออเดอร์ ${ออเดอร์ในช่วง} ใบในช่วงนี้มีค่าธรรมเนียมในกระจกหมด (ค้าง ${out["ค้างก่อนรอบนี้"]} ใบ)`;
    /* ค้าง > 0 แต่หยิบได้ 0 = ขัดกันในตัว ⇒ ห้ามรายงานว่าครบ */
    if (out["ค้างก่อนรอบนี้"] > 0) {
      out.ok = false;
      out.สรุป = `ขัดกันในตัว: ค้าง ${out["ค้างก่อนรอบนี้"]} ใบ แต่หยิบมาได้ 0 ใบ ⇒ ตัวหยิบใบมีปัญหา ไม่ใช่ครบ`;
    }
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
         voucher_shopee, voucher_seller, coins, cogs, withholding_tax, ams_commission,
         reverse_shipping_fee, formula_diff, fields_count, at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
       ON CONFLICT(order_sn) DO UPDATE SET
         day=excluded.day, escrow=excluded.escrow, items_total=excluded.items_total,
         commission=excluded.commission, service_fee=excluded.service_fee,
         payment_fee=excluded.payment_fee, seller_txn_fee=excluded.seller_txn_fee,
         ship_buyer=excluded.ship_buyer, ship_actual=excluded.ship_actual,
         ship_subsidy=excluded.ship_subsidy, ship_discount_seller=excluded.ship_discount_seller,
         voucher_shopee=excluded.voucher_shopee, voucher_seller=excluded.voucher_seller,
         coins=excluded.coins, cogs=excluded.cogs, withholding_tax=excluded.withholding_tax,
         ams_commission=excluded.ams_commission,
         reverse_shipping_fee=excluded.reverse_shipping_fee,
         formula_diff=excluded.formula_diff, fields_count=excluded.fields_count, at=datetime('now')`,
      [r.order_sn, r.order_date ?? null, f.escrowAmount, f.itemsTotal, f.commission, f.serviceFee,
        f.paymentFee, f.sellerTransactionFee, f.shippingPaidByBuyer, f.shippingActual,
        f.shippingSubsidyByShopee, f.shippingDiscountSeller, f.voucherByShopee, f.voucherBySeller,
        f.coinsByShopee, f.cogs, f.withholdingTax, f.amsCommission ?? null,
        f.reverseShippingFee ?? null, diff,
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
/** ตรวจว่ายอดในสรุป "ปิดบัญชี" ได้ไหม — คืนช่องอธิบายส่วนต่าง
 *
 * 🔑 เกณฑ์: ราคาสินค้ารวม − ยอดโอนสุทธิ ต้องเท่ากับผลรวมของค่าธรรมเนียมทุกช่อง + ผลต่างสูตร
 *    เหลือเท่าไรคือ **ของที่เรายังไม่รู้จัก** ⇒ ต้องโชว์เป็นตัวเลข ไม่ใช่เงียบ
 * ⚠️ ขาดช่องไหน (null) ⇒ **ไม่คิดให้เลย** แล้วบอกว่าขาดช่องอะไร
 *    (แทน null ด้วย 0 แล้วคิดต่อ = ได้ส่วนต่างสวยงามที่ไม่ได้พิสูจน์อะไร)
 */
export function ปิดบัญชี(row) {
  const ช่อง = ["ราคาสินค้ารวม", "ยอดโอนสุทธิ", "คอมมิชชั่น", "ค่าบริการ", "ค่าธรรมเนียมชำระเงิน",
    "ค่าส่งตามจริง", "ค่าธุรกรรมผู้ขาย", "ค่าส่งที่Shopeeออกให้", "ค่าส่งที่ผู้ซื้อจ่าย", "ผลต่างสูตรรวม"];
  const ขาด = ช่อง.filter((k) => row[k] === null || row[k] === undefined);
  if (ขาด.length) return { "🧾 ปิดบัญชีไม่ได้": `ไม่มีค่าในช่อง: ${ขาด.join(" · ")}` };
  const n = (k) => Number(row[k]);
  const ส่วนต่าง = n("ราคาสินค้ารวม") - n("ยอดโอนสุทธิ");
  /* 🔑 **ค่าธรรมเนียมที่มีชื่อ** — ช่องที่ Shopee บอกเราว่าเป็นอะไร */
  const มีชื่อ = n("คอมมิชชั่น") + n("ค่าบริการ") + n("ค่าธรรมเนียมชำระเงิน")
    + n("ค่าส่งตามจริง") + n("ค่าธุรกรรมผู้ขาย")
    - n("ค่าส่งที่Shopeeออกให้") - n("ค่าส่งที่ผู้ซื้อจ่าย");
  const ผลต่างสูตร = n("ผลต่างสูตรรวม");
  const เหลือ = Math.round((ส่วนต่าง - มีชื่อ - ผลต่างสูตร) * 100) / 100;
  const ฐาน = n("ราคาสินค้ารวม");
  const pct = (x) => (ฐาน > 0 ? `${(x / ฐาน * 100).toFixed(2)}%` : null);
  return {
    "🧾 ส่วนต่างราคาสินค้า−เงินเข้า": Math.round(ส่วนต่าง * 100) / 100,
    "🧾 ค่าธรรมเนียมที่มีชื่อ": Math.round(มีชื่อ * 100) / 100,
    /* 🔴 **`ผลต่างสูตร` ห้ามนับเป็น "อธิบายได้" เด็ดขาด** (แก้ทันทีที่เห็นของจริง 27 ก.ย. 2569)
       รอบแรกผมเขียนให้มันรวมอยู่ในช่อง "อธิบายได้จากช่องที่มี" ⇒ คำตอบขึ้นว่า
       **เหลืออธิบายไม่ได้ 0** ทั้งที่ `ผลต่างสูตรรวม = 3,900` คือ *นิยามของส่วนที่สูตรอธิบายไม่ได้*
       ⇒ ⇒ นั่นคือ **เขียวลวง** ชนิดเดียวกับที่ไล่จับกันทั้งวัน และเทสของผมไม่จับ
          เพราะผมตั้งเคสไว้ด้วย `ผลต่างสูตรรวม: 0` ⇒ ทางที่มีปัญหาไม่เคยถูกเดินเลย
       🔑 บทเรียน: **เคสทดสอบที่ตั้งค่าเป็นศูนย์ = ตัดทางนั้นออกจากการทดสอบ** */
    "🧾 ผลต่างสูตร (ยังไม่รู้ว่าเป็นค่าอะไร)": Math.round(ผลต่างสูตร * 100) / 100,
    "🧾 เหลืออธิบายไม่ได้แม้รวมผลต่างสูตร": เหลือ,
    ...(Math.abs(ผลต่างสูตร) > 1
      ? { "⚠️ ผลต่างสูตรไม่เป็นศูนย์": `${Math.round(ผลต่างสูตร * 100) / 100} บาท (${pct(ผลต่างสูตร)} ของราคาสินค้า) ` +
          "— เป็นรายการที่สูตรเรายังไม่รู้จัก **ห้ามเฉลี่ยทิ้ง** ไล่จากใบที่ formula_diff ใหญ่สุด" }
      : {}),
    ...(Math.abs(เหลือ) > 1
      ? { "🔴 ปิดบัญชีไม่ลงจริง": `${เหลือ} บาท — แม้รวมผลต่างสูตรแล้วยังไม่ลงตัว ⇒ มีช่องที่เรายังไม่รู้ว่ามี` }
      : {}),
    "🧾 เปอร์เซ็นต์ค่าธรรมเนียมเทียบราคาสินค้า": pct(ส่วนต่าง),
    "🧾 เปอร์เซ็นต์เฉพาะค่าธรรมเนียมที่มีชื่อ": pct(มีชื่อ),
  };
}

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
            -- 🔴 สี่ช่องนี้ต้องอยู่ในสรุป ไม่ใช่มีแต่ในตาราง (27 ก.ย. 2569)
            --    ฝั่งจอย้ายข้างสมการจาก shopeeNet แล้วพิสูจน์ว่า:
            --      itemsTotal - escrow = (คอม + ค่าบริการ + ค่าธรรมเนียมชำระเงิน + ค่าส่งตามจริง)
            --                            + ค่าธุรกรรมผู้ขาย - ค่าส่งที่ Shopee ออก - ค่าส่งที่ผู้ซื้อจ่าย
            --                            + ผลรวม formula_diff
            --    ⇒ ส่วนต่าง 2,306 บาทที่ "ไม่มีชื่อ" คือสี่ช่องนี้รวมกัน — ของอยู่ในตารางครบทุกใบ
            --      แต่สรุปไม่ได้ SELECT ออกมา ⇒ ของมีครบ แต่ช่องที่ทำให้บวกกันได้ไม่ถูกส่งออก
            --    🔑 กลไกเดียวกับ l.fired ใน stock-push-sweep.mjs เป๊ะ — ครั้งที่สองในวันเดียว
            ROUND(SUM(seller_txn_fee),2) AS ค่าธุรกรรมผู้ขาย,
            ROUND(SUM(ship_subsidy),2) AS ค่าส่งที่Shopeeออกให้,
            ROUND(SUM(ship_buyer),2) AS ค่าส่งที่ผู้ซื้อจ่าย,
            -- สามช่องนี้เขียนลงมาตลอดแต่ไม่เคยถูกรวมในสรุป (ด่าน (6) จับได้ 4 ต.ค. 2569)
            --  🔑 เจตนาของด่านนั้นคือ "ของที่อยู่ในฐานต้องมีทางดู" ไม่ใช่ "ของที่เราคิดว่าสำคัญ"
            --     เพราะวันที่ยอดไม่ตรง คนจะต้องไล่ทุกช่อง ไม่ใช่เฉพาะช่องที่เราเดาไว้ล่วงหน้า
            ROUND(SUM(voucher_shopee),2) AS ส่วนลดที่Shopeeออกให้,
            ROUND(SUM(ship_discount_seller),2) AS ส่วนลดค่าส่งที่ร้านออกเอง,
            ROUND(SUM(coins),2) AS เหรียญShopee,
            ROUND(SUM(reverse_shipping_fee),2) AS ค่าส่งกลับตอนคืนสินค้า,
            -- 🔴 **ป้ายนี้ผมตั้งผิดเมื่อ 4 ต.ค. แล้วแก้ 5 ต.ค.** เดิมเขียนว่า "ต้นทุนที่ Shopee รายงาน"
            --    ซึ่งโกหกบนจอเงิน: วัดแล้ว cogs == items_total **เป๊ะ 12/12 ใบ** (เคยวัด 50/50 ใบ 18 ก.ย.)
            --    ⇒ Shopee เอา **ราคาขาย** มาใส่ช่องชื่อต้นทุน (ร้านไม่ได้กรอกต้นทุนไว้ในระบบเขา)
            --    และมัน **กลายเป็น 0 ย้อนหลังเมื่อใบถูกคืนสินค้า** (กวาดซ้ำครั้งเดียว ยอดลด 23,650 บาท)
            --    🚫 ห้ามเอาช่องนี้ไปคิดกำไรเด็ดขาด — กำไรจะออกมา 0 ทุกใบและดูเหมือนตัวเลขจริง
            --    ⇒ ต้นทุนจริงของเราอยู่ที่ตาราง order_item_cost (ตรึงตอนขาย) ไม่ใช่ที่นี่
            --    🔑 ที่ผมพลาด: ด่านของผมบอกว่าคอลัมน์ทุกตัวต้องถูก SELECT (ถูกในภาพรวม)
            --       แล้วผมทำตามโดยไม่อ่านคำเตือนที่อยู่ห่าง 8 บรรทัดใน mkp-finance.mjs
            --       ⇒ **ด่านรายงานตำแหน่ง ไม่ได้รายงานข้อบกพร่อง** ด่านไม่รู้ว่าช่องไหนเป็นกับดัก
            ROUND(SUM(cogs),2) AS ราคาสินค้าที่Shopeeใส่ในช่องชื่อต้นทุน_ไม่ใช่ต้นทุน,
            -- ค่าคอมโฆษณา/แอฟฟิลิเอต — เพิ่ม 4 ต.ค. 2569 (อธิบายผลต่างเดิมได้ 95.2%)
            ROUND(SUM(ams_commission),2) AS ค่าคอมโฆษณา,
            -- 🔑 แถวที่ซิงก์ก่อน 4 ต.ค. เป็น NULL ⇒ formula_diff ของแถวนั้นคิดจากสูตรเก่า
            --    เลขนี้ต้องอยู่ในสรุป ไม่ใช่ให้คนเดา: ยังไม่เป็น 0 = ยังกวาดซ้ำไม่ครบ
            --    (ห้ามแปล "ผลต่างยังเยอะ" เป็น "แก้สูตรไม่สำเร็จ" ขณะเลขนี้ยังไม่เป็นศูนย์)
            SUM(CASE WHEN ams_commission IS NULL THEN 1 ELSE 0 END) AS ใบที่ยังไม่ได้กวาดซ้ำ,
            ROUND(SUM(formula_diff),2) AS ผลต่างสูตรรวม,
            SUM(CASE WHEN formula_diff IS NULL THEN 1 ELSE 0 END) AS ใบที่เทียบสูตรไม่ได้,
            SUM(CASE WHEN ABS(formula_diff) > ${เกณฑ์ต่างบาท} THEN 1 ELSE 0 END) AS ใบที่สูตรต่างเกิน2บาท,
            ROUND(MAX(ABS(formula_diff)),2) AS ต่างมากสุด
       FROM shopee_fees WHERE day >= date('now', '+7 hours', ?)`,
    [`-${days} days`]
  );
  const all = await coreQuery(
    `SELECT COUNT(*) AS n FROM shopee_orders WHERE order_date >= date('now', '+7 hours', ?)`,
    [`-${days} days`]
  );
  const row = แถวจากผล(q, "สรุปค่าธรรมเนียม")[0] ?? {};
  const inMirror = Number(row["ใบในกระจก"] ?? 0);
  const total = Number(แถวจากผล(all, "นับออเดอร์ทั้งช่วง")[0]?.n ?? 0);
  return {
    ok: true, platform: "shopee", grain: "order-fees",
    ขอบเขต: `ย้อน ${days} วัน (วันไทย)`,
    ...row,
    ครอบกี่ใบ: `${inMirror} จาก ${total} ใบในกระจกออเดอร์`,
    /* 🧾 **บรรทัดปิดบัญชี — ให้คำตอบตรวจตัวเองได้ ไม่ต้องให้คนมาบวกมือ**
       ถ้า `เหลืออธิบายไม่ได้` ไม่ใช่ ~0 แปลว่ามีรายการที่สูตรเรายังไม่รู้จัก **อย่าเฉลี่ยทิ้ง** */
    ...ปิดบัญชี(row),
    ครอบครบไหม: total === 0 ? null : inMirror >= total,
    /* 🔴 ครอบไม่ครบต้องประกาศตัว — ไม่งั้นยอดรวมข้างบนถูกอ่านเป็นยอดของทุกใบ */
    ...(total > inMirror ? { "⚠️ ยอดข้างบนยังไม่ครบ": `ขาด ${total - inMirror} ใบ — ยิง ?mkpfeesync=1 ต่อจนครบก่อนเอาไปใช้` } : {}),
    "หมายเหตุ cogs": "ไม่รวมในสรุปโดยตั้งใจ — Shopee ส่งราคาขายมาในช่องชื่อต้นทุน (วัดแล้ว 50/50 ใบเท่ากันเป๊ะ)",
  };
}

/** แถวในกระจกค่าธรรมเนียม **รายใบ** — อ่านอย่างเดียว ไม่ยิง Shopee (ใบ `t_mum2bzeg`)
 *
 * 🔴 **ที่มา 4 ต.ค. 2569**: ช่องสถานะขึ้นเหลืองว่า "สูตรคิดยอดโอนไม่ตรง N ใบ" มาหลายวัน
 *    แต่ **ไม่มีทางดูได้เลยว่าใบไหน** — สรุปให้แต่ยอดรวม · ตัวซิงก์เก็บตัวอย่างแค่ 5 ใบต่อรอบ
 *    และมันไล่จาก "40 ใบใหม่สุด" ซ้ำทุกรอบ ⇒ ใบที่ต่างซึ่งอยู่ลึกกว่านั้น **ไม่มีวันถูกหยิบมาโชว์**
 *    ⇒ ⇒ คำเตือนที่บอกว่า "มีปัญหา" แต่ไม่บอกว่า "ที่ไหน" ทำให้งานค้างโดยไม่มีใครเริ่มได้
 *    🔑 ตัวตรวจเขียนสั่งไว้เองว่า **"ไล่จากใบที่ `formula_diff` ใหญ่สุด"** — เส้นนี้คือสิ่งที่ทำให้ทำตามได้
 *
 * 🔒 **ไม่มีช่องที่เป็นข้อมูลส่วนตัวเลย** — ตารางนี้ไม่เคยเก็บชื่อผู้ซื้อ/ที่อยู่/เบอร์
 *    (ตัวอ่านไม่ส่งมาให้ตั้งแต่ต้นทาง · ดูกติกาหัวไฟล์) ⇒ เส้นนี้จึงคืนทุกคอลัมน์ที่มีได้
 * ⚠️ `limit` มีเพดาน และต้องคืน **จำนวนที่เข้าเงื่อนไขทั้งหมด** คู่กับ **จำนวนที่คืนมา**
 *    ไม่คืน = คนอ่านจะคิดว่าเห็นครบทุกใบ (กฎ partial-coverage-reported-as-full)
 */
export async function shopeeFeeRows(o = {}) {
  const days = Math.max(1, Math.min(400, parseInt(o.days ?? "120", 10) || 120));
  const limit = Math.max(1, Math.min(200, parseInt(o.limit ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(o.offset ?? "0", 10) || 0);
  const เฉพาะที่ต่าง = !!o.off;
  await ensureFeesTable();
  const เงื่อนไขวัน = `day >= date('now', '+7 hours', ?)`;
  /* 🔑 เกณฑ์ "ต่าง" ต้องเป็น **เลขเดียวกับที่ช่องสถานะใช้** (2 บาท)
     สองที่ใช้เกณฑ์ต่างกัน = จอกับหน้าสถานะบอกคนละจำนวน เรื่องเดียวกัน (กฎ one-threshold-one-source) */
  const เงื่อนไขต่าง = เฉพาะที่ต่าง ? ` AND ABS(formula_diff) > ${เกณฑ์ต่างบาท}` : "";
  const [นับ] = แถวจากผล(await coreQuery(
    `SELECT COUNT(*) AS n FROM shopee_fees WHERE ${เงื่อนไขวัน}${เงื่อนไขต่าง}`,
    [`-${days} days`],
  ), "นับแถวที่เข้าเงื่อนไข");
  const rows = แถวจากผล(await coreQuery(
    `SELECT order_sn, day, escrow, items_total, commission, service_fee, payment_fee,
            seller_txn_fee, ship_buyer, ship_actual, ship_subsidy, ship_discount_seller,
            voucher_shopee, voucher_seller, coins, withholding_tax,
            -- cogs = ต้นทุนที่ Shopee บอกมาในใบ escrow — **เขียนลงตั้งแต่วันแรกแต่ไม่เคยถูกอ่าน**
            --    ด่าน (6) ในเทสเป็นคนจับได้ 4 ต.ค. 2569 ⇒ ของมีอยู่ในฐานครบ แค่ไม่มีทางดู
            --    (ห้ามใส่ backtick ในคอมเมนต์ก้อนนี้ — อยู่ใน template literal · ผมเหยียบ
            --     คลาสนี้เป็นครั้งที่ 3 ในคืนเดียว ทั้ง 3 ครั้ง node --check เป็นคนจับ)
            cogs,
            -- 🔴 ช่องที่เขียนลงแต่ไม่ได้ SELECT ออกมา = ช่องที่ไม่มีใครตรวจได้ (คลาสเดิมของไฟล์นี้
            --    เจอครั้งที่สามแล้ว: สรุปขาด 4 ช่อง 27 ก.ย. · unit_cost เขียนได้อ่านไม่ได้ 4 ต.ค.)
            ams_commission, reverse_shipping_fee, formula_diff, fields_count
       FROM shopee_fees WHERE ${เงื่อนไขวัน}${เงื่อนไขต่าง}
       ORDER BY ABS(COALESCE(formula_diff, 0)) DESC, day DESC LIMIT ? OFFSET ?`,
    [`-${days} days`, limit, offset],
  ), "อ่านแถวกระจกค่าธรรมเนียม");
  const ทั้งหมด = Number(นับ?.n ?? 0);
  return {
    ok: true, platform: "shopee", grain: "order-fees",
    ขอบเขต: `ย้อน ${days} วัน (วันไทย)` + (เฉพาะที่ต่าง ? ` · เฉพาะใบที่สูตรต่างเกิน ${เกณฑ์ต่างบาท} บาท` : " · ทุกใบในกระจก"),
    เรียงจาก: "ค่าสัมบูรณ์ของผลต่างสูตร มากไปน้อย",
    เข้าเงื่อนไขทั้งหมด: ทั้งหมด,
    คืนมากี่แถว: rows.length,
    /* ⚠️ เห็นไม่ครบต้องประกาศตัว ไม่ใช่ให้คนเดาจากการเทียบสองเลขข้างบนเอง */
    ...(offset + rows.length < ทั้งหมด
      ? { "⚠️ ยังไม่ครบ": `เห็น ${offset + rows.length} จาก ${ทั้งหมด} ใบ — ขอต่อด้วย &offset=${offset + rows.length}` }
      : {}),
    "🔒 ความเป็นส่วนตัว": "ตารางนี้ไม่เก็บชื่อผู้ซื้อ/ที่อยู่/เบอร์ ⇒ ไม่มีช่องส่วนตัวให้หลุด",
    rows,
  };
}
