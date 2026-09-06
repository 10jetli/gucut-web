// GUCUT Core — ตัวคุยกับฐานข้อมูล D1 (Cloudflare) ผ่าน REST
//
// "คลังเงา" ระยะ 0 ของแผนเลิกจ่าย ZORT (พิมพ์เขียว 30 ส.ค. 2569)
// ฐานชื่อ gucut-core อยู่โซน APAC — Account/DB id ไม่ใช่ความลับ (โผล่ใน URL อยู่แล้ว)
// ความลับมีตัวเดียวคือ CLOUDFLARE_D1_TOKEN (สร้างที่ Cloudflare → API Tokens → สิทธิ์ D1 Edit)
//
// ⚠️ ร้านมี Cloudflare สองบัญชี — บัญชีจริงคือ f496328a (10jetli: gucut.com + R2)
//    ส่วน MCP ใน claude.ai ผูกกับบัญชีเก่าอีกตัว (มี worker gucut-pwa สมัย Shopify)
//    ฐานแรกเผลอสร้างผ่าน MCP ไปตกบัญชีเก่า (28f8e8c7...) เลิกใช้แล้ว —
//    ฐานจริงสร้างใหม่ผ่าน dashboard บัญชี 10jetli (30 ส.ค. 2569)
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "f496328a3fb6eac88b6ff64eb4b52fd3";
/* ⚠️ **ค่าสำรองต้องเป็นฐานที่ใช้อยู่จริงเสมอ** (แก้ 5 ก.ย. 2569 หลังย้ายโซน)
    เดิมค่าสำรองเป็นฐานเก่า `a4007558-…` (โซน APAC) ⇒ วันไหน env หลุดไปสัก context เดียว
    ฟังก์ชันจะ**เงียบ ๆ ไปอ่านฐานเก่า** แล้วเราจะเห็นข้อมูลสองชุดแยกกันโดยไม่รู้ตัว
    (ฝั่งจอชี้จุดนี้เอง 5 ก.ย. — ของที่ไม่ล้มแต่ชี้ผิดที่ อันตรายกว่าของที่ล้ม) */
const DB_ID = process.env.CORE_D1_ID || "0b8ead77-4890-4ab7-a1e8-38936305feca";

export function coreReady() {
  return !!process.env.CLOUDFLARE_D1_TOKEN;
}

/* ── มาตรวัด: คำขอนี้คุยกับ D1 กี่รอบ และเสียเวลาไปเท่าไหร่ ── (5 ก.ย. 2569)
   เจ้าของร้านสั่ง "ไม่ย้าย แต่หาทางทำให้เร็วสุด ๆ" ⇒ ต้องรู้ก่อนว่าเวลาหายไปไหน

   วัดจากข้างนอกได้แค่ "ทั้งคำขอใช้กี่วินาที" ซึ่งบอกไม่ได้ว่าเป็นเพราะ D1 ช้า
   หรือเพราะ Netlify ช้า หรือเพราะเน็ตจากไทย ⇒ ทุกครั้งที่จะแก้ต้องเดาแล้วรอ deploy อีกวัน
   ⇒ ให้ทุกคำตอบติดหัวข้อมูล `x-d1-ms` `x-d1-count` `x-d1-max` มาเลย เปิด DevTools ดูได้ทันที

   ⚠️ **ต้องใช้ AsyncLocalStorage ห้ามใช้ตัวแปรระดับไฟล์**
      ฟังก์ชันหนึ่งตัวรับหลายคำขอพร้อมกันในคอนเทนเนอร์เดียวได้
      ตัวนับก้อนเดียว = คำขอ A นับเวลาของคำขอ B ปนเข้ามา แล้วตัวเลขจะมั่วแบบดูสมเหตุสมผล
      (ซึ่งอันตรายกว่าไม่มีตัวเลขเลย — ดูกฎ measure-must-prove-work)
   ⚠️ `x-d1-ms` เป็น **ผลบวกของทุกคำขอ** ⇒ ตอนยิงพร้อมกันมันจะมากกว่าเวลาจริง
      อยากรู้ว่า "รอ D1 จริง ๆ กี่วินาที" ให้ดู `x-d1-max` (ตัวที่ช้าที่สุด) คู่กันเสมอ */
import { AsyncLocalStorage } from "node:async_hooks";

const d1Meter = new AsyncLocalStorage();

/** ครอบตัวจัดการคำขอด้วยตัวนี้ แล้วเรียก `d1Stats()` ตอนจะตอบ */
export function withD1Meter(fn) {
  return d1Meter.run({ count: 0, ms: 0, max: 0, wrote: false }, fn);
}

/** ตัวเลขของคำขอปัจจุบัน — อยู่นอก withD1Meter จะได้ null (ไม่ throw) */
export function d1Stats() {
  const m = d1Meter.getStore();
  return m
    ? { count: m.count, ms: Math.round(m.ms), max: Math.round(m.max), wrote: m.wrote }
    : null;
}

/* ── "คำขอนี้เขียนฐานข้อมูลไปหรือเปล่า" ── (ฝั่งจอขอ 5 ก.ย. 2569)
   ฝั่งจอเก็บคำตอบไว้ในหน่วยความจำ 60 วิ เพื่อให้กดสลับเมนูแล้วเห็นทันที
   ⇒ ต้องล้างของเก่าทิ้งทุกครั้งที่มีการบันทึกข้อมูล ไม่งั้นคนกดบันทึกแล้วเห็นเลขเก่า **แล้วจะกดซ้ำ**

   ⚠️ **ฝั่งเบราว์เซอร์แยกเองไม่ได้เด็ดขาด** — API ฝั่งนี้มี 10 ตัวที่เขียนข้อมูลแต่เรียกด้วย GET
      (`?sync=1` `?recon=1` `?snapshot=1` `?init=1` …) หน้าตาเหมือน GET ที่อ่านอย่างเดียวเป๊ะ
      ⇒ ให้จอจดรายชื่อเอาไว้เอง = **วันที่มีคนเพิ่มตัวที่ 11 จอจะโชว์เลขผิดเงียบ ๆ**
      ที่เดียวที่รู้ความจริงคือตรงนี้ — ตอนที่ SQL วิ่งไปเขียนจริง ๆ

   ⚠️ **ต้องไม่นับ DDL แบบ "สร้างถ้ายังไม่มี"** — จอที่อ่านอย่างเดียวหลายตัว
      (listTransfers · listBundleItems) ยิง CREATE TABLE IF NOT EXISTS ทุกครั้งที่เปิด
      นับด้วยเมื่อไหร่ = แทบทุกคำขอกลายเป็น "เขียนแล้ว" ⇒ แคชไม่เคยถูกใช้เลยสักครั้ง
      แล้วจะดูเหมือนแคชพัง ทั้งที่มันถูกล้างทิ้งทุกวินาที */
const WRITE_HEAD = /^\s*(?:\/\*[\s\S]*?\*\/|--[^\n]*\n|\s)*(INSERT|UPDATE|DELETE|REPLACE|DROP|CREATE|ALTER)\b/i;
const SAFE_DDL = /\bIF\s+NOT\s+EXISTS\b/i;

export function sqlWrites(sql) {
  const m = WRITE_HEAD.exec(String(sql || ""));
  if (!m) return false;
  const verb = m[1].toUpperCase();
  // ALTER TABLE ... ADD COLUMN = เปลี่ยนโครง ไม่ได้เปลี่ยนข้อมูล · ยิงซ้ำทุกครั้งที่ init
  if (verb === "ALTER") return false;
  if ((verb === "CREATE" || verb === "DROP") && SAFE_DDL.test(sql)) return false;
  return true;
}

/** ยิง SQL หนึ่งประโยค (พารามิเตอร์ใช้ ? ตามลำดับ) — คืน rows */
export async function coreQuery(sql, params = []) {
  const token = process.env.CLOUDFLARE_D1_TOKEN;
  if (!token) throw new Error("ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN");
  const meter = d1Meter.getStore();
  const t0 = meter ? Date.now() : 0;
  /* ⚠️ ต้องจดเวลา **ทั้งตอนสำเร็จและตอนล้ม** — ถ้าจดเฉพาะตอนสำเร็จ
      คำขอที่หมดเวลา (15 วิ) จะไม่ถูกนับ แล้วมาตรวัดจะบอกว่า "D1 เร็วดี"
      ในวันที่ D1 ล่มพอดี ⇒ ชี้ผิดทางในวันที่ต้องการมันที่สุด */
  const done = () => {
    if (!meter) return;
    const d = Date.now() - t0;
    meter.count += 1;
    meter.ms += d;
    if (d > meter.max) meter.max = d;
    /* ⚠️ ติดธงแม้ตอนล้ม — คำสั่งเขียนที่หมดเวลากลางทาง **อาจเขียนสำเร็จไปแล้ว**
        แค่คำตอบไม่กลับมา ⇒ ต้องถือว่าเขียนแล้วเสมอ แล้วให้จอล้างของเก่าทิ้ง
        (พลาดไปทางล้างเกิน ยอมได้ · พลาดไปทางไม่ล้าง = คนเห็นเลขก่อนบันทึกแล้วกดซ้ำ) */
    if (sqlWrites(sql)) meter.wrote = true;
  };
  try {
    return await d1Fetch(token, sql, params);
  } finally {
    done();
  }
}

async function d1Fetch(token, sql, params) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB_ID}/query`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(15000),
    }
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(`D1 ${res.status}: ${JSON.stringify(data?.errors || data).slice(0, 300)}`);
  }
  return data.result?.[0]?.results ?? [];
}

/** สร้างตารางทั้งหมด (idempotent — IF NOT EXISTS ทุกตัว) — เรียกผ่าน /api/core?init=1 ครั้งเดียวพอ */
export async function coreInit() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, number TEXT NOT NULL,
      channel TEXT, status TEXT, amount REAL NOT NULL DEFAULT 0,
      customer TEXT, order_date TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel)`,
    `CREATE TABLE IF NOT EXISTS order_items (
      order_id TEXT NOT NULL, line INTEGER NOT NULL, sku TEXT, name TEXT,
      qty REAL NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (order_id, line))`,
    `CREATE INDEX IF NOT EXISTS idx_items_sku ON order_items(sku)`,
    `CREATE TABLE IF NOT EXISTS stock_moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL, qty REAL NOT NULL,
      reason TEXT NOT NULL, ref TEXT, at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_moves_sku ON stock_moves(sku)`,
    // ⚠️ ตารางนี้ไว้ "ปรับมือ" เท่านั้น (รับของเข้า · โอน · ปรับยอด) ห้ามให้ตัว sync เขียน
    //    ยอดขายคำนวณสดจาก order_items ทุกครั้ง (ลบ-เขียนใหม่ทั้งใบ = รันซ้ำได้)
    //    ดัชนีนี้บังคับ "หนึ่งเหตุ-หนึ่งอ้างอิง-หนึ่ง SKU = หนึ่งแถว" ให้คนเขียนรอบหน้า
    //    ยิงซ้ำได้โดยไม่เบิ้ล — กติกาเดียวกับตัวนับคนเข้าเว็บ
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_moves_once ON stock_moves(reason,ref,sku)`,
    `CREATE TABLE IF NOT EXISTS stock_snapshots (
      day TEXT NOT NULL, sku TEXT NOT NULL, name TEXT, qty REAL, price REAL,
      PRIMARY KEY (day, sku))`,
    `CREATE TABLE IF NOT EXISTS recon_log (
      day TEXT PRIMARY KEY, zort_orders INTEGER, zort_amount REAL,
      core_orders INTEGER, core_amount REAL, diff_notes TEXT,
      at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS products (
      sku TEXT PRIMARY KEY, name TEXT, sellprice REAL, updated_at TEXT)`,
    // ออเดอร์ที่ดึงตรงจาก Shopee Open API (แผนลับขั้น 3 — เทียบ 3 ทางกับ ZORT)
    // ⚠️ แยกตารางจาก orders โดยตั้งใจ — ถ้ายัดรวม recon เดิมจะนับเบิ้ลทันที
    `CREATE TABLE IF NOT EXISTS shopee_orders (
      order_sn TEXT PRIMARY KEY, status TEXT, amount REAL NOT NULL DEFAULT 0,
      buyer TEXT, order_date TEXT, create_time INTEGER,
      updated_at TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_sp_orders_date ON shopee_orders(order_date)`,
    // รายการสินค้าในออเดอร์ Shopee (ระดับ SKU) — รากฐานของ ledger ตัดสต็อกเองในขั้นถัดไป
    `CREATE TABLE IF NOT EXISTS shopee_order_items (
      order_sn TEXT NOT NULL, line INTEGER NOT NULL, sku TEXT, name TEXT,
      qty REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (order_sn, line))`,
    `CREATE INDEX IF NOT EXISTS idx_sp_items_sku ON shopee_order_items(sku)`,
    // สมุดเทียบสต็อกรายวัน (คลังเราคำนวณเอง vs ZORT) — แบบเดียวกับ recon_log ฝั่งออเดอร์
    // เก็บไว้ดูแนวโน้ม: ส่วนต่างต้องนิ่งและเข้าใจได้ทุกตัวก่อนถึงจะกล้าให้คลังเราเป็นตัวจริง
    /* ⚠️ **ตัวจับชีพจรของงานตามเวลา** (4 ก.ย. 2569)
        ฝั่งจอชี้ว่าทุกการ์ด/แท็บนับจากกระจกล้วน ๆ ถ้าซิงก์ตายเงียบไปหนึ่งวัน
        จอจะยังโชว์เลขเดิมสวยงามโดยไม่มีอะไรฟ้อง
        ⚠️ **ห้ามใช้ MAX(updated_at) แทนตัวนี้** — ตัวซิงก์เขียนเฉพาะแถวที่เปลี่ยน
           คืนไหนไม่มีออเดอร์ขยับเลย MAX(updated_at) จะเก่าทั้งที่ซิงก์ทำงานปกติ
           ⇒ "ครั้งสุดท้ายที่ข้อมูลเปลี่ยน" กับ "ครั้งสุดท้ายที่เราไปดู" คนละคำถาม
        เก็บเป็นคีย์-ค่า อัปทับคีย์เดิม ⇒ ไม่โตตามเวลา (48 รอบ/วันเขียนแถวเดิม) */
    `CREATE TABLE IF NOT EXISTS core_meta (
      k TEXT PRIMARY KEY, v TEXT, at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS stock_recon_log (
      day TEXT PRIMARY KEY, base_day TEXT, skus INTEGER, matched INTEGER,
      mismatched INTEGER, abs_diff REAL, notes TEXT,
      at TEXT DEFAULT (datetime('now')))`,
  ];
  for (const sql of stmts) await coreQuery(sql);
  // ⚠️ คอลัมน์ที่เพิ่มทีหลังต้องมาทาง ALTER TABLE เสมอ — แก้ CREATE TABLE ข้างบนไม่มีผล
  //    เพราะ IF NOT EXISTS จะไม่แตะตารางที่มีอยู่แล้ว คอลัมน์ใหม่จะไม่เกิดขึ้นแบบเงียบ ๆ
  //    SQLite ไม่มี ADD COLUMN IF NOT EXISTS → ยิงซ้ำจะ error จึงกลืนทิ้ง
  for (const sql of [
    `ALTER TABLE orders ADD COLUMN pay_method TEXT`, // เงินสด/บัตร/โอน — ใช้ปิดยอดสิ้นวัน
    /* ข้อมูลขนส่ง — **ไม่มี endpoint แยกใน ZORT** (Logistic/Shipping/Delivery ตอบ 404 หมด)
       แต่ซ่อนอยู่ในใบขายอยู่แล้ว: ใบขายมี 114 ฟิลด์ รวม trackingno · shippingchannel ·
       shippingname · shippingdate · isCOD ⇒ เก็บตอน sync ออเดอร์ไปเลย ไม่ต้องยิงเพิ่ม */
    `ALTER TABLE orders ADD COLUMN tracking_no TEXT`,
    `ALTER TABLE orders ADD COLUMN ship_channel TEXT`,
    `ALTER TABLE orders ADD COLUMN ship_name TEXT`,
    `ALTER TABLE orders ADD COLUMN ship_date TEXT`,
    `ALTER TABLE orders ADD COLUMN is_cod INTEGER`,
    // สถานะชำระเงินจาก ZORT (Paid · Unpaid …) — คนละอย่างกับ status ของใบ
    `ALTER TABLE orders ADD COLUMN pay_status TEXT`,
    /* สถานะฝั่งมาร์เก็ตเพลสที่ ZORT ใช้แยกแท็บ "รอชำระ" กับ "รอโอนสินค้า"
       (AWAITING_SHIPMENT · READY_TO_SHIP · pending …) — ยืนยันจากจอ ZORT 4 ก.ย. 2569
       ⚠️ pay_status แยกสองกองนี้ไม่ได้ — มีใบที่ "ชำระครบ" แต่ยังอยู่กอง "รอโอนสินค้า"
       ⚠️ **เพิ่มคอลัมน์ใหม่ต้องกวาดย้อนหลังด้วย** ไม่งั้นใบเก่าที่นิ่งแล้วจะว่างถาวร
          (ตัวซิงก์เขียนเฉพาะใบที่เปลี่ยน — ดู core-sync.mjs รอบกวาดกว้างตี 2) */
    `ALTER TABLE orders ADD COLUMN integration_status TEXT`,
    /* น้ำหนักสินค้า (กรัม) — ZORT ส่งมาใน Product/GetProducts อยู่แล้ว
       ⚠️ **มีค่าจริงแค่ 669 จาก 2,898 ตัว (23%)** ⇒ ส่วนใหญ่ยังไม่ได้กรอก
          ต้องคืน null ไม่ใช่ 0 — **0 กรัมแปลว่าของไม่มีน้ำหนัก ไม่ใช่ยังไม่รู้**
          (กติกาเดียวกับราคาซื้อที่ตัดสินไว้แล้ว) */
    `ALTER TABLE products ADD COLUMN weight REAL`,
    /* ⚠️ **คอลัมน์นี้ถูกเพิ่มไว้แล้วแต่ตัวซิงก์ไม่เคยเขียนลงไปเลย** (พบ 5 ก.ย. 2569)
        เป็น new-columns-need-backfill อีกหน้าตาหนึ่ง — ไม่ใช่ลืมกวาดย้อนหลัง แต่ **ลืมต่อท่อ**
        ⇒ เพิ่มคอลัมน์แล้วต้องตามไปแก้ core-sync ด้วยเสมอ ไม่งั้นมันว่างตลอดกาลอย่างเงียบ ๆ */
    `ALTER TABLE orders ADD COLUMN bill_discount REAL`, // ส่วนลดท้ายบิล (บาท) = discountamount
    /* ค่าส่งระดับใบ — ต้องมีเพื่อออกใบกำกับให้ยอดตรงกับที่เก็บเงินจริง
       สูตรที่พิสูจน์แล้ว: หัวใบ = ผลรวมบรรทัด − ส่วนลดท้ายบิล + ค่าส่ง */
    `ALTER TABLE orders ADD COLUMN ship_amount REAL`,
    `ALTER TABLE order_items ADD COLUMN discount REAL`, // ส่วนลดต่อชิ้น (บาท/ชิ้น)
    // กุญแจกันยิงซ้ำที่จอ POS สร้างเอง — ดูเหตุผลเต็มใน pos.mjs (createSale)
    `ALTER TABLE orders ADD COLUMN client_ref TEXT`,
    // ทะเบียนสินค้า — ฟิลด์ที่จอสินค้าต้องใช้ให้เหมือน ZORT
    `ALTER TABLE products ADD COLUMN purchase_price REAL`, // ราคาซื้อ (ต้นทุน)
    `ALTER TABLE products ADD COLUMN product_type INTEGER`, // 0 = สินค้า · 1 = บริการ (ไม่มีสต็อกจริง)
    `ALTER TABLE products ADD COLUMN active INTEGER`,       // เปิด/ปิดใช้งาน
    `ALTER TABLE products ADD COLUMN unit TEXT`,            // หน่วยนับ
    `ALTER TABLE products ADD COLUMN onhand REAL`,          // คงเหลือในมือ
    `ALTER TABLE products ADD COLUMN available REAL`,       // พร้อมขาย (หักที่จองไว้แล้ว)
    // หมวดหมู่ "ของจริง" จาก ZORT — 42 หมวด ครอบคลุม 87% ของคลัง
    // ⚠️ ดีกว่าการเดาหมวดจากชื่อสินค้ามาก (ของเดิมเดาได้ 52%) ห้ามกลับไปใช้การเดาเป็นหลัก
    `ALTER TABLE products ADD COLUMN category TEXT`,
    `ALTER TABLE products ADD COLUMN category_id TEXT`,
    `ALTER TABLE products ADD COLUMN sub_category TEXT`,
  ]) {
    await coreQuery(sql).catch(() => null);
  }
  // นับจากคำสั่ง CREATE TABLE จริงใน stmts — เพิ่มตารางแล้วเลขนี้ตามเอง
  // (เคยเขียนตายตัวว่า 10 ซึ่งจะกลายเป็นเท็จเงียบ ๆ ทันทีที่มีคนเพิ่มตาราง)
  return { tables: stmts.filter((s) => /CREATE\s+TABLE/i.test(s)).length };
}

/** ฐานข้อมูลอยู่โซนไหนจริง ๆ — อ่านจาก Cloudflare ตรง ๆ ไม่ใช่จากคอมเมนต์ในไฟล์นี้
 *
 *  ⚠️ **มีไว้เพราะคอมเมนต์เชื่อไม่ได้** — หัวไฟล์นี้เขียนว่า "อยู่โซน APAC" มาตลอด
 *     แต่ไม่มีใครเคยยิงถามของจริงเลยสักครั้ง (stale-state-comments)
 *     และคำตอบนี้เปลี่ยนคำแนะนำทั้งหมด: ถ้าฐานอยู่ APAC แต่ฟังก์ชันอยู่ us-east
 *     ทุกคำขอต้องข้ามแปซิฟิกไป-กลับ ⇒ ย้ายโซนฐานได้กำไรมากกว่าแก้โค้ดทั้งวัน
 *  ⚠️ อ่านอย่างเดียว ไม่แตะข้อมูล · ต้องมีรหัสหลังร้านถึงเรียกได้
 */
export async function d1Info() {
  const token = process.env.CLOUDFLARE_D1_TOKEN;
  if (!token) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const t0 = Date.now();
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB_ID}`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }
  ).catch((e) => ({ ok: false, status: 0, _err: String(e?.message || e) }));
  const meta = Date.now() - t0;

  // ยิง SQL ที่เบาที่สุดเท่าที่จะเบาได้ 3 ครั้ง — วัด "ค่าเดินทางล้วน ๆ" ไม่ปนเวลาคิดเลข
  const pings = [];
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    await d1Fetch(token, "SELECT 1 AS ok", []).catch(() => null);
    pings.push(Date.now() - t);
  }

  const data = res.ok ? await res.json().catch(() => null) : null;
  const r = data?.result || {};
  return {
    name: r.name ?? null,
    // ชื่อช่องที่ Cloudflare ใช้ต่างกันตามรุ่น API ⇒ หยิบทุกตัวที่เป็นไปได้ แล้วส่งดิบไปด้วย
    region: r.running_in_region ?? r.region ?? r.primary_location_hint ?? null,
    sizeBytes: r.file_size ?? null,
    tables: r.num_tables ?? null,
    version: r.version ?? null,
    metaMs: meta,
    /* ⚠️ ตัวเลขที่ใช้ตัดสินคือ **ค่ากลางของ pingMs** ไม่ใช่ metaMs
        (metaMs เป็นการอ่านทะเบียนฐาน คนละเส้นทางกับการยิง SQL)
        ราว 20–40 ms = ฐานอยู่ใกล้ฟังก์ชัน · ราว 180–250 ms = คนละฝั่งมหาสมุทร */
    pingMs: pings,
    pingMedian: pings.slice().sort((a, b) => a - b)[1] ?? null,
    note: "ยิงจากในฟังก์ชัน Netlify ⇒ เป็นระยะทาง 'ฟังก์ชัน ↔ D1' ล้วน ๆ ไม่ปนเน็ตจากเครื่องคนดู",
    raw: r,
  };
}
