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
  return { tables: 10 };
}
