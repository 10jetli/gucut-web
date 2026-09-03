// กระจก "ใบสั่งซื้อ" (Purchase Order) จาก ZORT เข้าคลังเงา + รายชื่อคลังสินค้า
//
// ⚠️ **นี่คือคนละชุดข้อมูลกับ "ระบบสั่งของโรงงาน" ที่หลังร้านมีอยู่แล้ว** (ฝั่งจอทักมา 3 ก.ย. 2569)
//    ระบบสั่งของโรงงานอ่านจาก /api/sheets — สินค้า · ผู้ขาย · มัดจำ · กำหนดส่ง
//    ส่วนจอ "รายการซื้อ" ของ ZORT คือใบ PO-2026xxxxx 32 ใบ ฿6.2 ล้าน
//    ⇒ **ห้ามเอาจอสั่งของโรงงานไปดัดให้หน้าตาเหมือนใบ PO** จะได้จอที่เหมือนแต่ข้อมูลผิดความหมาย
//       ซึ่งอันตรายกว่าจอที่หน้าตาไม่เหมือนเลย เพราะคนอ่านจะเชื่อว่าเป็นของเดียวกัน
//
// endpoint ที่ใช้ได้จริง: /v4/PurchaseOrder/GetPurchaseOrders
// (ลองมาแล้ว 404: Purchase/GetPurchases · Purchase/GetPurchaseList · Buy/GetBuys)
import { coreQuery, coreReady } from "./coredb.mjs";

const esc = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const BASE = "https://open-api.zortout.com/v4";

function headers() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME) return null;
  return { storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET };
}

let tablesReady = false;
async function ensureTables() {
  if (tablesReady) return;
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS purchase_orders (
       number TEXT PRIMARY KEY, vendor TEXT, po_date TEXT, status TEXT,
       amount REAL NOT NULL DEFAULT 0, payment_status TEXT, warehouse TEXT,
       updated_at TEXT)`
  );
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_orders(po_date)`);
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS purchase_order_items (
       number TEXT NOT NULL, line INTEGER NOT NULL, sku TEXT, name TEXT,
       qty REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0,
       PRIMARY KEY (number, line))`
  );
  tablesReady = true;
}

/** ดึงใบสั่งซื้อทั้งหมดจาก ZORT มาเก็บ — เขียนเฉพาะใบที่เปลี่ยนจริง (โควตา D1) */
export async function syncPurchases() {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const h = headers();
  if (!h) return { skip: "ยังไม่ได้ตั้งรหัส ZORT" };
  await ensureTables();

  const all = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${BASE}/PurchaseOrder/GetPurchaseOrders?limit=100&page=${page}`, {
      headers: h,
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    const list = Array.isArray(data?.list) ? data.list : [];
    all.push(...list);
    if (list.length < 100) break;
  }
  if (!all.length) return { error: "ดึงใบสั่งซื้อจาก ZORT ไม่ได้" };

  const rows = all
    .map((p) => ({
      number: String(p?.number ?? "").trim().slice(0, 60),
      vendor: String(p?.customername ?? "").trim().slice(0, 160),
      date: String(p?.purchaseorderdate ?? "").slice(0, 10),
      status: String(p?.status ?? "").slice(0, 40),
      amount: num(p?.amount),
      pay: String(p?.paymentstatus ?? "").slice(0, 40),
      wh: String(p?.warehousecode ?? "").slice(0, 40),
      items: Array.isArray(p?.list) ? p.list : [],
    }))
    .filter((r) => r.number);

  const prev = new Map(
    (
      await coreQuery(
        `SELECT number, vendor, po_date, status, amount, payment_status, warehouse FROM purchase_orders`
      )
    ).map((r) => [r.number, r])
  );
  const changed = rows.filter((r) => {
    const p = prev.get(r.number);
    return (
      !p ||
      String(p.vendor ?? "") !== r.vendor ||
      String(p.po_date ?? "") !== r.date ||
      String(p.status ?? "") !== r.status ||
      num(p.amount) !== r.amount ||
      String(p.payment_status ?? "") !== r.pay ||
      String(p.warehouse ?? "") !== r.wh
    );
  });

  for (let i = 0; i < changed.length; i += 40) {
    const values = changed
      .slice(i, i + 40)
      .map(
        (r) =>
          `(${esc(r.number)},${esc(r.vendor)},${esc(r.date)},${esc(r.status)},${r.amount},` +
          `${esc(r.pay)},${esc(r.wh)},datetime('now'))`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO purchase_orders (number,vendor,po_date,status,amount,payment_status,warehouse,updated_at)
       VALUES ${values}
       ON CONFLICT(number) DO UPDATE SET vendor=excluded.vendor, po_date=excluded.po_date,
         status=excluded.status, amount=excluded.amount, payment_status=excluded.payment_status,
         warehouse=excluded.warehouse, updated_at=excluded.updated_at`
    );
  }

  // รายการสินค้าในใบ — เขียนใหม่ทั้งใบเฉพาะใบที่เปลี่ยน (ลบ-เขียนใหม่ = รันซ้ำได้)
  let lines = 0;
  for (const r of changed) {
    if (!r.items.length) continue;
    await coreQuery(`DELETE FROM purchase_order_items WHERE number = ${esc(r.number)}`);
    const values = r.items
      .slice(0, 200)
      .map(
        (it, i) =>
          `(${esc(r.number)},${i + 1},${esc(String(it?.sku ?? "").slice(0, 60))},` +
          `${esc(String(it?.name ?? "").slice(0, 160))},${num(it?.quantity ?? it?.qty)},${num(it?.pricepernumber ?? it?.price)})`
      )
      .join(",");
    if (values) {
      await coreQuery(
        `INSERT INTO purchase_order_items (number,line,sku,name,qty,price) VALUES ${values}`
      );
      lines += r.items.length;
    }
  }

  return { fetched: rows.length, written: changed.length, skipped: rows.length - changed.length, lines };
}

/** จอ "รายการซื้อ" แบบ ZORT — วันที่ · เลขที่ · ผู้ติดต่อ · มูลค่า · สถานะ · ชำระเงิน */
export async function listPurchases(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await ensureTables();
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));
  const q = String(o.q ?? "").trim().slice(0, 60);
  const filter = q ? `AND (number LIKE ${esc(`%${q}%`)} OR vendor LIKE ${esc(`%${q}%`)})` : "";

  const [sum] = await coreQuery(
    `SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS total FROM purchase_orders WHERE 1=1 ${filter}`
  );
  // แท็บสถานะแบบ ZORT — **นับข้ามตัวกรองสถานะเสมอ** (กติกาเดียวกับจอรายการขาย)
  const byStatus = await coreQuery(
    `SELECT status, COUNT(*) AS c FROM purchase_orders WHERE 1=1 ${filter} GROUP BY status ORDER BY c DESC`
  );
  const rows = await coreQuery(
    `SELECT number, vendor, po_date, status, amount, payment_status, warehouse
     FROM purchase_orders WHERE 1=1 ${filter}
     ORDER BY po_date DESC, number DESC LIMIT ${limit} OFFSET ${offset}`
  );
  return { total: num(sum?.c), amount: num(sum?.total), limit, offset, byStatus, rows };
}

/** รายชื่อคลังสินค้าจาก ZORT — **คนละอย่างกับ "สาขาที่ขายหน้าร้าน"**
 *  ⚠️ ZORT มี 3 คลัง: NEW (โกดัง) · KLD · ANJ — แต่ POS ขายได้แค่ 2 สาขา
 *     โกดังไม่ใช่จุดขาย ⇒ `list=branches` (POS) กับ `list=warehouses` (คลัง) ต้องแยกกันเสมอ
 *     เอามารวมกันเมื่อไหร่ จะมีคนเปิดบิลขายจากโกดังได้ ซึ่งไม่ตรงกับที่ร้านทำจริง */
export async function listWarehouses() {
  const h = headers();
  if (!h) return { error: "ยังไม่ได้ตั้งรหัส ZORT" };
  const res = await fetch(`${BASE}/Warehouse/GetWarehouses?limit=100`, {
    headers: h,
    signal: AbortSignal.timeout(12000),
  }).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const list = Array.isArray(data?.list) ? data.list : null;
  if (!list) return { error: "ดึงคลังสินค้าจาก ZORT ไม่ได้" };
  return {
    count: list.length,
    warehouses: list.map((w) => ({
      code: String(w?.code ?? ""),
      name: String(w?.name ?? ""),
      province: String(w?.province ?? ""),
      // ⚠️ ที่อยู่คลังไม่ส่งออกไปหน้าจอลูกค้า — หน้านี้เป็นหลังร้านล้วน แต่จำกัดไว้เท่าที่ใช้
      isPos: ["KLD", "ANJ"].includes(String(w?.code ?? "").toUpperCase()),
    })),
    note: "โกดัง (NEW) ไม่ใช่จุดขาย — เครื่องคิดเงินเปิดบิลได้เฉพาะสาขาที่ isPos = true",
  };
}
