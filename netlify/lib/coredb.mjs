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
const DB_ID = process.env.CORE_D1_ID || "a4007558-23ba-41df-8311-1c674ff12ae5";

export function coreReady() {
  return !!process.env.CLOUDFLARE_D1_TOKEN;
}

/** ยิง SQL หนึ่งประโยค (พารามิเตอร์ใช้ ? ตามลำดับ) — คืน rows */
export async function coreQuery(sql, params = []) {
  const token = process.env.CLOUDFLARE_D1_TOKEN;
  if (!token) throw new Error("ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN");
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
  ]) {
    await coreQuery(sql).catch(() => null);
  }
  return { tables: 10 };
}
