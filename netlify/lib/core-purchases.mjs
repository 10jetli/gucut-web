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
  /* โน้ตใต้ป้ายสถานะ (ฝั่งจอขอจากภาพ 27 · 5 ก.ย. 2569) — ZORT เรียก `description`
     (ชื่อเดียวกับที่ใบโอนใช้เป็น note อยู่แล้ว) · SQLite ไม่มี ADD COLUMN IF NOT EXISTS ⇒ กลืน error */
  await coreQuery(`ALTER TABLE purchase_orders ADD COLUMN note TEXT`).catch(() => null);
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS purchase_order_items (
       number TEXT NOT NULL, line INTEGER NOT NULL, sku TEXT, name TEXT,
       qty REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0,
       PRIMARY KEY (number, line))`
  );
  tablesReady = true;
}

/** ดึงใบสั่งซื้อทั้งหมดจาก ZORT มาเก็บ — เขียนเฉพาะใบที่เปลี่ยนจริง (โควตา D1) */
export async function syncPurchases(opt = {}) {
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
      note: String(p?.description ?? "").trim().slice(0, 200),
      items: Array.isArray(p?.list) ? p.list : [],
    }))
    .filter((r) => r.number);

  const prev = new Map(
    (
      await coreQuery(
        `SELECT number, vendor, po_date, status, amount, payment_status, warehouse, note, note FROM purchase_orders`
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
      String(p.warehouse ?? "") !== r.wh ||
      /* ⚠️ ขาดบรรทัดนี้ = คอลัมน์ใหม่ไม่มีวันถูกเติมให้ใบเก่าที่นิ่งแล้ว (new-columns-need-backfill)
          รอบแรกหลัง deploy ทุกใบจะ "เปลี่ยน" เพราะของเดิม note เป็น null ⇒ กวาดเติมให้เองครบ */
      String(p.note ?? "") !== r.note
    );
  });

  for (let i = 0; i < changed.length; i += 40) {
    const values = changed
      .slice(i, i + 40)
      .map(
        (r) =>
          `(${esc(r.number)},${esc(r.vendor)},${esc(r.date)},${esc(r.status)},${r.amount},` +
          `${esc(r.pay)},${esc(r.wh)},${esc(r.note)},datetime('now'))`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO purchase_orders (number,vendor,po_date,status,amount,payment_status,warehouse,note,updated_at)
       VALUES ${values}
       ON CONFLICT(number) DO UPDATE SET vendor=excluded.vendor, po_date=excluded.po_date,
         status=excluded.status, amount=excluded.amount, payment_status=excluded.payment_status,
         warehouse=excluded.warehouse, note=excluded.note, updated_at=excluded.updated_at`
    );
  }

  /* รายการสินค้าในใบ
     ⚠️ **บั๊กที่เจอ 3 ก.ย. 2569: เขียนเฉพาะ `changed` ⇒ ใบที่หัวไม่เปลี่ยนไม่เคยได้บรรทัดเลย**
        ตอนเพิ่มตาราง purchase_order_items ทีหลัง ใบ 32 ใบเดิมนิ่งอยู่แล้วทั้งหมด
        ⇒ sync กี่รอบก็ตอบ written 0 · lines 0 **ดูเหมือนทำงานปกติทุกครั้ง**
        ⇒ ต้องเติมใบที่ยังไม่มีบรรทัดด้วยเสมอ ไม่ใช่ดูแค่ว่าหัวใบเปลี่ยนไหม */
  /* ⚠️ **ฟิลด์จำนวนในบรรทัดใบซื้อของ ZORT ชื่อ `number` ไม่ใช่ `quantity`**
      (ชื่อเดียวกับ "เลขที่ใบ" ที่หัวใบ — คนละความหมายกันคนละระดับ)
      เดิมอ่าน quantity ⇒ ได้ 0 ทุกบรรทัด · ยอดรวมเป็น ฿0 **แต่จำนวนบรรทัดถูกต้องครบ**
      ดูเผิน ๆ เหมือนท่อทำงานแล้ว มีแถวขึ้นครบ 234 บรรทัด — แค่ตัวเลขเป็นศูนย์หมด */
  const haveLines = new Set(
    (await coreQuery(`SELECT DISTINCT number FROM purchase_order_items`).catch(() => [])).map((r) =>
      String(r.number)
    )
  );
  // repairItems=1 ⇒ เขียนบรรทัดใหม่ทุกใบ (ใช้ตอนแก้การจับคู่ฟิลด์ที่ผิด)
  const needLines = opt.repairItems
    ? rows.filter((r) => r.items.length)
    : rows.filter((r) => r.items.length && !haveLines.has(r.number));
  const todo = [...new Map([...changed, ...needLines].map((r) => [r.number, r])).values()];
  let lines = 0;
  for (const r of todo) {
    if (!r.items.length) continue;
    await coreQuery(`DELETE FROM purchase_order_items WHERE number = ${esc(r.number)}`);
    const values = r.items
      .slice(0, 200)
      .map(
        (it, i) =>
          `(${esc(r.number)},${i + 1},${esc(String(it?.sku ?? "").slice(0, 60))},` +
          `${esc(String(it?.name ?? "").slice(0, 160))},${num(it?.number ?? it?.quantity ?? it?.qty)},${num(it?.pricepernumber ?? it?.price)})`
      )
      .join(",");
    if (values) {
      await coreQuery(
        `INSERT INTO purchase_order_items (number,line,sku,name,qty,price) VALUES ${values}`
      );
      lines += r.items.length;
    }
  }

  return {
    fetched: rows.length,
    written: changed.length,
    skipped: rows.length - changed.length,
    lines,
    lineRepairs: needLines.length, // ใบเก่าที่ไม่เคยมีบรรทัดแล้วเพิ่งเติมให้
  };
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

/* ══ รายการโอนสินค้า (Transfer) ══════════════════════════════════════
   ⚠️ **ร้านใช้จอนี้หนักที่สุดในกลุ่มสินค้า — 12,196 รายการ** (เห็นจากจอจริง 3 ก.ย. 2569)
      เป็นบันทึกการย้ายของระหว่างคลัง และการ "ปรับ" สต็อก
      ⇒ เป็นเส้นเลือดของความถูกต้องของสต็อก ไม่ใช่จอประกอบ
   ⚠️ **อย่าเอาไปปนกับ stock_moves ของเรา** — stock_moves คือของที่ "เราปรับเอง"
      ส่วนตารางนี้คือกระจกของ ZORT · ปนกันเมื่อไหร่ = ตัดสต็อกสองรอบ
   ⚠️ ดึงย้อนหลังเป็นช่วง ไม่ดึงทั้ง 12,000 รายการรวดเดียว — เขียน D1 ก้อนใหญ่
      เสี่ยงชนโควตาและใช้เวลาเกินที่ Netlify ให้ฟังก์ชันรอ (เคยชนมาแล้ว 2 ก.ย.) */
export async function syncTransfers(days = 90, opt = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const h = headers();
  if (!h) return { skip: "ยังไม่ได้ตั้งรหัส ZORT" };
  await coreQuery(
    /* ⚠️ **กุญแจหลักต้องเป็น `id` ห้ามใช้ `number`** — พลาดมาแล้ว 3 ก.ย. 2569
        เลขที่ใบใน ZORT **ซ้ำกันได้จริง** 546 เลขซ้ำ ใบถูกกลืนหายไป 581 ใบ
        (TF-2022062674 ซ้ำถึง 4 ใบ) · `id` ต่างหากที่ไม่ซ้ำครบ 12,002
        และมันหายแบบ **เงียบสนิท** — ดึงครบ เขียนครบ ไม่มี error สักตัว
        รู้เพราะเอาผลรวมในตารางไปเทียบกับจำนวนที่ ZORT บอกเท่านั้น */
    `CREATE TABLE IF NOT EXISTS transfers (
       id TEXT PRIMARY KEY, number TEXT, kind TEXT, from_wh TEXT, to_wh TEXT,
       status TEXT, transfer_date TEXT, reference TEXT, note TEXT, updated_at TEXT)`
  );
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_tf_date ON transfers(transfer_date)`);
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_tf_number ON transfers(number)`);

  const back = Math.max(1, Math.min(3650, num(days) || 90));
  const since = new Date(Date.now() - back * 864e5).toISOString().slice(0, 10);

  // ⚠️ **ดึงย้อนหลังครบทั้ง 12,000 ใบต้องแบ่งรอบ** — Netlify ให้ฟังก์ชันรอผลแค่ 26 วินาที
  //    61 หน้าเรียงกันไม่มีทางจบในคำขอเดียว ⇒ ตัดเป็นช่วงหน้าแล้วให้คนเรียกวนต่อเอง
  //    คืน nextPage มาด้วยเมื่อยังไม่หมด · ไม่มี nextPage = ครบแล้ว
  const startPage = Math.max(1, num(opt.startPage) || 1);
  const maxPages = Math.max(1, Math.min(20, num(opt.maxPages) || 6));
  const rows = [];
  let nextPage = null;
  // ⚠️ หยุดเมื่อเจอใบที่เก่ากว่าช่วงที่ขอ — ZORT เรียงใหม่ไปเก่าอยู่แล้ว
  for (let page = startPage; page < startPage + maxPages; page++) {
    const res = await fetch(`${BASE}/Transfer/GetTransfers?limit=200&page=${page}`, {
      headers: h,
      signal: AbortSignal.timeout(12000),
    }).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    const list = Array.isArray(data?.list) ? data.list : [];
    if (!list.length) break;
    let hitOld = false;
    for (const t of list) {
      const date = String(t?.transferdate ?? "").slice(0, 10);
      if (date && date < since) { hitOld = true; continue; }
      const id = String(t?.id ?? "").trim().slice(0, 60);
      if (!id) continue;
      rows.push({
        id,
        number: String(t?.number ?? "").trim().slice(0, 60),
        kind: String(t?.transferType ?? "").slice(0, 40),
        from: String(t?.fromwarehousecode ?? "").slice(0, 40),
        to: String(t?.towarehousecode ?? "").slice(0, 40),
        status: String(t?.status ?? "").slice(0, 40),
        date,
        ref: String(t?.reference ?? "").slice(0, 80),
        note: String(t?.description ?? "").slice(0, 200),
      });
    }
    if (hitOld || list.length < 200) break;
    nextPage = page + 1;
  }
  if (!rows.length) return { fetched: 0, written: 0, since, startPage, nextPage: null };

  const prev = new Map(
    (
      await coreQuery(
        `SELECT id, number, kind, from_wh, to_wh, status, transfer_date, reference, note
         FROM transfers WHERE transfer_date >= ${esc(since)}`
      )
    ).map((r) => [String(r.id), r])
  );
  const changed = rows.filter((r) => {
    const p = prev.get(r.id);
    return (
      !p || String(p.number ?? "") !== r.number || String(p.kind ?? "") !== r.kind || String(p.from_wh ?? "") !== r.from ||
      String(p.to_wh ?? "") !== r.to || String(p.status ?? "") !== r.status ||
      String(p.transfer_date ?? "") !== r.date || String(p.reference ?? "") !== r.ref ||
      String(p.note ?? "") !== r.note
    );
  });

  for (let i = 0; i < changed.length; i += 60) {
    const values = changed
      .slice(i, i + 60)
      .map(
        (r) =>
          `(${esc(r.id)},${esc(r.number)},${esc(r.kind)},${esc(r.from)},${esc(r.to)},${esc(r.status)},` +
          `${esc(r.date)},${esc(r.ref)},${esc(r.note)},datetime('now'))`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO transfers (id,number,kind,from_wh,to_wh,status,transfer_date,reference,note,updated_at)
       VALUES ${values}
       ON CONFLICT(id) DO UPDATE SET number=excluded.number, kind=excluded.kind, from_wh=excluded.from_wh,
         to_wh=excluded.to_wh, status=excluded.status, transfer_date=excluded.transfer_date,
         reference=excluded.reference, note=excluded.note, updated_at=excluded.updated_at`
    );
  }
  return {
    fetched: rows.length,
    written: changed.length,
    skipped: rows.length - changed.length,
    since,
    startPage,
    nextPage, // ยังไม่หมด — เรียกซ้ำด้วย startPage=nextPage · null = ครบแล้ว
  };
}

/** ทิ้งตาราง transfers แล้วสร้างใหม่ — ใช้ตอนโครงกุญแจเปลี่ยน
 *  ⚠️ ปลอดภัยเพราะตารางนี้เป็น **กระจก** ล้วน ดึงกลับมาใหม่ได้ทั้งหมดจาก ZORT
 *     ห้ามเอาท่านี้ไปใช้กับตารางที่มีของที่เราเป็นเจ้าของเอง (stock_moves · orders) */
export async function resetTransfers() {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const [before] = await coreQuery(`SELECT COUNT(*) AS c FROM transfers`).catch(() => [{ c: 0 }]);
  await coreQuery(`DROP TABLE IF EXISTS transfers`);
  return { dropped: num(before?.c) };
}

/** จอ "รายการโอนสินค้า" แบบ ZORT */
/** รายละเอียดใบโอนรายใบ — บรรทัดสินค้า + เลขพัสดุ (ฝั่งจอ /core/receive ขอมา 6 ก.ย. 2569)
 *
 *  📌 ยิงตรวจ 9 ชื่อ 2 โมดูลแล้ว ⇒ มีจริง 2 เส้น
 *     ✅ Transfer/GetTransfers (รายการ — ตัวที่ syncTransfers ใช้อยู่)
 *     ✅ Transfer/GetTransferDetail (รายใบ — ตัวนี้)
 *     ❌ Transfer/GetTransfer · GetTransferList · list · Warehouse/GetTransfer(s|List|Detail)
 *     ตัวคุมกลุ่ม Product/GetProducts → resCode 100
 *
 *  ⚠️ **ยังไม่เคยยิงของจริง** — รู้แค่ว่า "เส้นมีอยู่" ยังไม่รู้ว่าคืนช่องอะไรบ้าง
 *     ⇒ ตัวนี้จึงคืน `fields` (ชื่อช่องที่เจอจริง) กลับไปด้วยเสมอ **ห้ามลบทิ้ง**
 *     จอจะได้รู้ว่ามีเลขพัสดุให้ใช้ไหม แทนที่จะเดาจากชื่อฟังก์ชัน
 *  ⚠️ ดึงสด ไม่เก็บลงกระจก — ใช้ตอนคนกำลังยืนรับของ ต้องได้ค่าล่าสุดเสมอ
 */
export async function getTransferDetail(id) {
  const h = headers();
  if (!h) return { error: "ยังไม่ได้ตั้งรหัส ZORT" };
  const key = String(id ?? "").trim();
  if (!key) return { error: "ต้องระบุเลขใบโอน" };
  const res = await fetch(
    `${BASE}/Transfer/GetTransferDetail?id=${encodeURIComponent(key)}`,
    { headers: h, signal: AbortSignal.timeout(15000) }
  ).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  if (!data) return { error: "ดึงรายละเอียดใบโอนจาก ZORT ไม่ได้" };
  /* ⚠️ ZORT วางตัวใบไว้คนละที่แล้วแต่เส้น — ลองทุกรูปที่เคยเจอในโปรเจกต์นี้
      หาไม่เจอ = **บอกว่าหาไม่เจอ** ห้ามคืนใบว่างที่หน้าตาเหมือน "ใบนี้ไม่มีของ" */
  const t = data?.detail ?? data?.data ?? (Array.isArray(data?.list) ? data.list[0] : null);
  if (!t || typeof t !== "object") {
    return { error: "ZORT ตอบมาแต่หาตัวใบไม่เจอ", fields: Object.keys(data ?? {}) };
  }
  const lines = Array.isArray(t.list) ? t.list : Array.isArray(t.items) ? t.items : null;
  return {
    live: true,
    number: String(t.number ?? ""),
    status: String(t.status ?? ""),
    date: String(t.transferdate ?? "").slice(0, 10),
    from: String(t.fromwarehousecode ?? ""),
    to: String(t.towarehousecode ?? ""),
    // เลขพัสดุ — ZORT ผูกไว้ตั้งแต่ต้นทาง (จอรับสินค้าของ ZORT ค้นด้วยเลขนี้ได้)
    tracking: String(t.trackingno ?? t.trackingNo ?? t.tracking ?? ""),
    /* ⚠️ null = **ไม่มีช่องบรรทัดสินค้ามาให้** · [] = มีช่องแต่ใบนี้ไม่มีของ
        สองอย่างนี้จอต้องเขียนคนละคำ (คลาสสามสถานะเดิม) */
    lines: lines
      ? lines.map((i) => ({
          sku: String(i?.sku ?? ""),
          name: String(i?.name ?? ""),
          qty: num(i?.number ?? i?.amount),
        }))
      : null,
    // ชื่อช่องที่ ZORT ส่งมาจริง — ให้จอ (และคนไล่ปัญหา) เห็นว่ามีอะไรให้ใช้บ้าง
    fields: Object.keys(t).sort(),
  };
}

export async function listTransfers(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await coreQuery(
    /* ⚠️ **กุญแจหลักต้องเป็น `id` ห้ามใช้ `number`** — พลาดมาแล้ว 3 ก.ย. 2569
        เลขที่ใบใน ZORT **ซ้ำกันได้จริง** 546 เลขซ้ำ ใบถูกกลืนหายไป 581 ใบ
        (TF-2022062674 ซ้ำถึง 4 ใบ) · `id` ต่างหากที่ไม่ซ้ำครบ 12,002
        และมันหายแบบ **เงียบสนิท** — ดึงครบ เขียนครบ ไม่มี error สักตัว
        รู้เพราะเอาผลรวมในตารางไปเทียบกับจำนวนที่ ZORT บอกเท่านั้น */
    `CREATE TABLE IF NOT EXISTS transfers (
       id TEXT PRIMARY KEY, number TEXT, kind TEXT, from_wh TEXT, to_wh TEXT,
       status TEXT, transfer_date TEXT, reference TEXT, note TEXT, updated_at TEXT)`
  );
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));
  const q = String(o.q ?? "").trim().slice(0, 60);
  const filter = q ? `AND (number LIKE ${esc(`%${q}%`)} OR reference LIKE ${esc(`%${q}%`)})` : "";
  /* ⚠️ **ยิงพร้อมกัน ห้ามเรียงกัน** (แก้ 5 ก.ย. 2569) — สามตัวนี้ไม่มีตัวไหนต้องรอกัน
      ⚠️ CREATE TABLE ข้างบนยังต้องอยู่ก่อนและ await จริง ๆ — ห้ามย้ายลงมาในนี้
         สามตัวนี้อ่านตารางนั้น ถ้ายังไม่ถูกสร้างจะล้มทั้งชุด */
  const [sumRows, byStatus, rows] = await Promise.all([
    coreQuery(
      `SELECT COUNT(*) AS c, MIN(transfer_date) AS oldest FROM transfers WHERE 1=1 ${filter}`
    ),
    // แท็บสถานะ — นับข้ามตัวกรองสถานะเสมอ (กติกาเดียวกับทุกจอ)
    coreQuery(
      `SELECT status, COUNT(*) AS c FROM transfers WHERE 1=1 ${filter} GROUP BY status ORDER BY c DESC`
    ),
    coreQuery(
      `SELECT id, number, kind, from_wh, to_wh, status, transfer_date, reference, note
       FROM transfers WHERE 1=1 ${filter}
       ORDER BY transfer_date DESC, number DESC LIMIT ${limit} OFFSET ${offset}`
    ),
  ]);
  const sum = sumRows[0];
  return {
    total: num(sum?.c),
    oldest: sum?.oldest || null,
    limit,
    offset,
    byStatus,
    /* ⚠️ จอต้องบอกว่าเก็บย้อนหลังแค่ช่วงหนึ่ง ไม่ใช่ทั้งหมดที่ ZORT มี
       ค่าที่วัดได้ (6 ก.ย. 2569): กระจก **12,002** ใบ · ZORT บอก **12,196** ใบ (วัด 3 ก.ย.)
       ⇒ ห่างกัน **194** ใบ

       🔬 **ข้อสังเกตที่ยังไม่ได้พิสูจน์ — ห้ามเอาไปเขียนบนจอว่าเป็นคำอธิบาย**
          194 บังเอิญเท่ากับจำนวนใบ "ปรับ" ที่รู้อยู่แล้วว่าดึงด้วย API ไม่ได้
          **แต่มีคำอธิบายคู่แข่งที่อธิบายได้เหมือนกัน**: กระจกเก็บย้อนหลังเป็น "ช่วง"
          โดยตั้งใจ ⇒ ส่วนต่างอาจมาจากขอบช่วง ไม่ใช่จากใบ "ปรับ" เลยก็ได้
          และเลขสองตัวนี้ **วัดคนละวัน** (3 vs 6 ก.ย.) ⇒ ส่วนต่างอาจมาจากใบที่เพิ่งเกิดด้วย

          วิธีแยกให้ขาด (ทำตอนยิงของจริง): ถาม ZORT ยอดรวมวันนี้ + ดูว่า `oldest` ของกระจก
          เท่ากับใบเก่าสุดของ ZORT ไหม · ถ้าเท่ากันแปลว่าไม่ใช่เรื่องขอบช่วง
       ⚠️ เลขที่ "ตรงพอดีจนน่าเชื่อ" คือจุดที่ต้องระวังที่สุด ไม่ใช่จุดที่ควรเชื่อที่สุด */
    note: "กระจกเก็บย้อนหลังเป็นช่วง ไม่ใช่ทั้งหมดที่ ZORT มี — ดูวันที่เก่าสุดที่ oldest",
    rows,
  };
}

/** ใบเสนอราคา — จอ "รายการขาย → ใบเสนอราคา" ของ ZORT
 *  ⚠️ ร้านมีแค่ 3 ใบ (ไม่ค่อยได้ใช้) — ดึงสดทุกครั้ง ไม่ต้องทำกระจก
 *     ทำกระจกให้ของที่มี 3 แถวคือเพิ่มที่ให้ข้อมูลไม่ตรงกันได้เปล่า ๆ */
export async function listQuotations(limit = 50) {
  const h = headers();
  if (!h) return { error: "ยังไม่ได้ตั้งรหัส ZORT" };
  const n = Math.max(1, Math.min(200, num(limit) || 50));
  const res = await fetch(`${BASE}/Quotation/GetQuotations?limit=${n}`, {
    headers: h,
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const list = Array.isArray(data?.list) ? data.list : null;
  if (!list) return { error: "ดึงใบเสนอราคาจาก ZORT ไม่ได้" };
  return {
    total: num(data?.count),
    live: true, // ดึงสดจาก ZORT ไม่ใช่กระจก — จอเขียนบอกได้ว่าเป็นข้อมูลสด
    rows: list.map((q) => ({
      /* ⚠️ **เลขที่ใบ (`number`) กับ id ในระบบ ZORT เป็นคนละตัว**
          เส้นดึงรายละเอียดรายใบรับ **id เท่านั้น** ส่งเลขที่ใบไปได้ค่าว่างเงียบ ๆ
          (เจอจริง 6 ก.ย. 2569 — ส่ง "QT-202609001" ไปแล้วดึงไม่ได้ ทั้งที่เส้นมีอยู่จริง)
          ⇒ ส่ง id ออกมาด้วยเสมอ ไม่งั้นจอกดดูใบไหนก็ไม่ได้ */
      id: q?.id ?? null,
      number: String(q?.number ?? ""),
      customer: String(q?.customername ?? ""),
      phone: String(q?.customerphone ?? ""),
      amount: num(q?.amount),
      status: String(q?.status ?? ""),
      date: String(q?.quotationdateString ?? q?.quotationdate ?? "").slice(0, 10),
      reference: String(q?.reference ?? ""),
    })),
  };
}

/** รายการสินค้าในใบซื้อ — สำหรับจอ "รายงาน → ยอดซื้อ" แบบแยกรายสินค้า
 *  ⚠️ ข้อมูลนี้ **เก็บอยู่แล้ว** ตั้งแต่ทำ syncPurchases แต่ไม่เคยมีทางอ่าน
 *     ⇒ ฝั่งจอจึงเข้าใจว่าคลังเงาเก็บแค่หัวใบ · ของมีอยู่ แค่ไม่มีประตู */
export async function listPurchaseItems(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));
  const q = String(o.q ?? "").trim().slice(0, 60);
  const filter = q ? `AND (i.sku LIKE ${esc(`%${q}%`)} OR i.name LIKE ${esc(`%${q}%`)})` : "";
  const [sum] = await coreQuery(
    `SELECT COUNT(DISTINCT i.sku) AS skus, COUNT(*) AS lines,
            ROUND(COALESCE(SUM(i.qty * i.price),0),2) AS amount
     FROM purchase_order_items i WHERE 1=1 ${filter}`
  );
  // รวมรายสินค้า — แบบเดียวกับที่ ZORT แสดงในรายงานยอดซื้อ
  const rows = await coreQuery(
    `SELECT i.sku AS sku, MAX(i.name) AS name,
            SUM(i.qty) AS qty, ROUND(SUM(i.qty * i.price),2) AS amount,
            COUNT(DISTINCT i.number) AS orders,
            MAX(po.po_date) AS lastDate
     FROM purchase_order_items i
     LEFT JOIN purchase_orders po ON po.number = i.number
     WHERE 1=1 ${filter}
     GROUP BY i.sku ORDER BY SUM(i.qty * i.price) DESC LIMIT ${limit} OFFSET ${offset}`
  );
  /* ⚠️ **บรรทัดสรุปที่ถูก + ตารางที่ไม่ครบ = อันตรายกว่าตัวเลขผิดตรง ๆ**
      (ฝั่งจอเจอตอนยิงจริง 4 ก.ย. 2569) — จอเขียนสรุป '217 รหัส ฿6,225,166'
      ซึ่งถูก เพราะเป็นเลขรวมจากท่อ **แต่ตารางมีแค่ 200 แถว ขาด 17 รหัส**
      และคอลัมน์ % คิดจากผลรวมของ 200 แถวที่แสดง ไม่ใช่ยอดในบรรทัดสรุป
      ⇒ คนละฐานกันเงียบ ๆ · ไม่มีอะไรดูขัดตาเลย
      ⇒ ส่ง total · shown · truncated · applied ไปด้วยเสมอ **ห้ามตัดเงียบ** */
  const shown = rows.length;
  return {
    skus: num(sum?.skus),
    lines: num(sum?.lines),
    amount: num(sum?.amount),
    total: num(sum?.skus), // จำนวนรหัสทั้งหมดในตัวกรองนี้ (ตารางจัดกลุ่มตาม sku)
    shown,
    truncated: num(sum?.skus) > shown + offset,
    applied: { q: q || null, limit, offset },
    limit,
    offset,
    rows,
  };
}

/** ใบคืนของ (Credit Note) — จอ "รายการขาย → รับคืนสินค้า" ของ ZORT
 *
 *  ⚠️ **เส้นนี้เกือบถูกประกาศว่าไม่มี** — ยิงชื่อเดียวไม่เจอแล้วเกือบสรุปว่า ZORT ไม่เปิด
 *     ยิงครบ 8 ชื่อ 2 method ตามกติกาใหม่ (6 ก.ย. 2569) ถึงเจอ `ReturnOrder/GetReturnOrders`
 *     (GET 200 · POST 405 — 405 ยืนยันอีกชั้นว่าเส้นมีจริงแค่ผิด method)
 *     ที่ไม่มีจริง: GetReturnOrderList · GetList · list · Order/… · Buy/… · Return/GetReturns
 *
 *  ⚠️ **ปิดชื่อลูกค้าบางส่วนตั้งแต่ที่ท่อ ไม่ใช่ไปปิดที่จอ** (ฝั่งจอขอมา และ ZORT เองก็ปิดในจอนี้)
 *     จอนี้ไม่มีเหตุต้องเห็นชื่อเต็ม ⇒ ส่งออกไปเต็มเมื่อไหร่ มันจะไปนอนอยู่ในไฟล์ของอีก repo
 *  ⚠️ ดึงสดทุกครั้ง ไม่ทำกระจก — เหตุผลเดียวกับใบเสนอราคา (ของไม่เยอะ และไม่ได้ใช้เทียบยอด)
 */
/** อ่านรายละเอียดใบเสนอราคารายใบ — **อ่านอย่างเดียว**
 *  ทำขึ้น 6 ก.ย. 2569 ตอนยิงสร้างใบจริงใบแรกแล้วพบว่า **ยอดเงินเป็น ฿0**
 *  ทั้งที่ส่ง `pricepernumber` ไป ⇒ ต้องเห็นของที่ ZORT เก็บจริงถึงจะรู้ว่าชื่อช่องไหนถูก
 *  ⚠️ **ห้ามเดาชื่อช่องแล้วแก้ตัวส่ง** — เดาผิดคือใบเสนอราคาราคาศูนย์ทั้งร้าน
 *     ส่งช่องที่ ZORT คืนมาจริงกลับไปให้ดูด้วยตา แล้วค่อยตัดสิน */
export async function getQuotationDetail(id, raw = false) {
  const h = headers();
  if (!h) return { error: "ยังไม่ได้ตั้งรหัส ZORT" };
  const key = String(id ?? "").trim();
  if (!key) return { error: "ต้องระบุเลขที่ใบ" };
  const res = await fetch(
    `${BASE}/Quotation/GetQuotationDetail?id=${encodeURIComponent(key)}`,
    { headers: h, signal: AbortSignal.timeout(15000) }
  ).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  if (!data) return { error: "ดึงรายละเอียดใบเสนอราคาจาก ZORT ไม่ได้" };
  /* ⚠️ **โหมดดูของดิบ — สำหรับไล่ปัญหาเท่านั้น ห้ามให้จอเรียกประจำ**
      ทำเพิ่ม 6 ก.ย. 2569 เพราะตัวย่อด้านล่างหยิบ `list[0]` มาแสดง
      แล้ว `list[0]` ของเส้นนี้คือ **บรรทัดสินค้า ไม่ใช่หัวใบ** ⇒ ที่เห็นว่าเป็น "ใบ" มาตลอด
      จริง ๆ คือบรรทัดเดียว และ `number: "1"` ที่นึกว่าเลขที่ใบ คือ **จำนวนชิ้น**
      ⇒ ตัวย่อที่ตีความให้เรียบร้อยแล้ว **ปิดบังโครงสร้างจริง** จนไล่ปัญหาต่อไม่ได้
      ⚠️ ห้าม log และห้ามส่งเข้า Telegram — มีชื่อ/เบอร์ลูกค้าในใบจริง */
  if (raw) return { live: true, raw: data };
  const q = data?.detail ?? data?.data ?? (Array.isArray(data?.list) ? data.list[0] : null);
  if (!q || typeof q !== "object")
    return { error: "ZORT ตอบมาแต่หาตัวใบไม่เจอ", fields: Object.keys(data ?? {}) };
  const lines = Array.isArray(q.list) ? q.list : Array.isArray(q.items) ? q.items : null;
  return {
    live: true,
    number: String(q.number ?? ""),
    /* ส่งช่องเงินทุกชื่อที่เป็นไปได้กลับไป **โดยไม่เลือกให้** — คนดูจะได้เห็นเองว่าช่องไหนมีค่า */
    "เงินที่ ZORT เก็บไว้": Object.fromEntries(
      Object.entries(q).filter(([k, v]) => /price|amount|total|net|grand/i.test(k) && v !== null)
    ),
    /* สามสถานะ: null = ไม่มีช่องบรรทัด · [] = ใบนี้ไม่มีของ · มีของ = ได้บรรทัดจริง */
    lines: lines
      ? lines.map((i) => ({
          "ทุกช่องในบรรทัด": Object.fromEntries(
            Object.entries(i ?? {}).filter(([, v]) => v !== null && v !== "")
          ),
        }))
      : null,
    fields: Object.keys(q).sort(),
  };
}

export async function listReturnOrders(limit = 50) {
  const h = headers();
  if (!h) return { error: "ยังไม่ได้ตั้งรหัส ZORT" };
  const n = Math.max(1, Math.min(200, num(limit) || 50));
  const res = await fetch(`${BASE}/ReturnOrder/GetReturnOrders?limit=${n}`, {
    headers: h,
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const list = Array.isArray(data?.list) ? data.list : null;
  /* ⚠️ แยก "ดึงไม่สำเร็จ" ออกจาก "ไม่มีใบสักใบ" — จอต้องเขียนคนละคำ
      (สอง 0 ที่หน้าตาเหมือนกันแต่คนละความหมาย) */
  if (!list) return { error: "ดึงใบคืนของจาก ZORT ไม่ได้" };
  return {
    total: num(data?.count),
    live: true,
    rows: list.map((r) => ({
      number: String(r?.number ?? ""),
      reference: String(r?.reference ?? ""),
      /* ชื่อลูกค้า **ส่งเต็ม ไม่ปิดบัง** — เจ้าของร้านชี้ขาด 6 ก.ย. 2569
         เหตุผล: จออยู่หลังรหัสหลังร้านอยู่แล้ว · กดเข้าใบก็เห็นชื่อเต็ม ⇒ ปิดในจอรายการ
         เพิ่มความยุ่งยากโดยไม่ได้ปิดการเข้าถึงจริง · คนแพ็กของต้องอ่านชื่อผู้รับจากจอรายการ
         · และ ZORT เองก็โชว์เต็ม (กฎ "เหมือน ZORT 100%")
         ⚠️ ดาว/จุดที่เห็นในบางแถวมาจาก**มาร์เก็ตเพลสปิดมาเอง** ไม่ใช่ฝีมือเรา — ห้ามอ่านสลับกัน
         ⚠️ **ข้อนี้ไม่ครอบคลุมเลขประจำตัวผู้เสียภาษีในจอผู้ติดต่อ ซึ่งยังปิดตามเดิม**
            เกณฑ์ที่ใช้แยก: ของที่คนต้องใช้ทำงานทุกวัน (ชื่อผู้รับ) ปิดไม่ได้ ·
            ของที่ไม่ได้ใช้ประจำวันแต่หลุดแล้วเจ็บ (เลขผู้เสียภาษี) ปิดไว้ */
      customer: String(r?.customername ?? ""),
      amount: num(r?.amount),
      status: String(r?.status ?? ""),
      warehouse: String(r?.warehousename ?? ""),
      date: String(r?.returnorderdateString ?? r?.returnorderdate ?? "").slice(0, 10),
      paid: String(r?.paymentstatus ?? r?.paymentStatus ?? ""),
    })),
  };
}

/* 🗑️ `maskName` ถูกลบทิ้ง 6 ก.ย. 2569 — **บทเรียนที่ทำให้มันเกิดขึ้นมาตั้งแต่แรก ห้ามลืม**
   ผมเห็นชื่อผู้ซื้อจากมาร์เก็ตเพลสมาเป็นดาว ๆ (`อ******อ`) แล้ว **ทำตามหน้าตาที่เห็น**
   ทั้งที่ดาวพวกนั้นเป็นของ Shopee/Lazada ไม่ใช่กติกาของร้าน
   ⇒ **ลอกความบังเอิญมาเป็นกติกา** — ดูเหมือนการตัดสินใจ แต่ไม่มีเหตุผลอยู่ข้างใต้
      ผลคือไม่มีใครกล้าแก้ เพราะไม่มีใครรู้ว่ามันมีไว้ทำไม
      และเกิดอาการ "ลูกค้าคนเดียวกันโชว์คนละแบบในสองจอ" ซึ่งชวนให้คนคิดว่าระบบพัง
   จะปิดข้อมูลอะไรอีก ให้เขียน **เหตุผล + ใครสั่ง + วันที่** กำกับเสมอ ไม่งั้นห้ามปิด */
