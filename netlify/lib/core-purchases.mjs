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
  /* ⚠️ **อ่านไม่ได้ ≠ ยังไม่มีบรรทัดสักใบ** (แก้ 7 ก.ย. 2569)
      เดิม `.catch(() => [])` ⇒ คำขอล้มแล้วได้เซตว่าง ⇒ ระบบสรุปว่า **"ยังไม่เคยเขียนบรรทัดเลย"**
      ⇒ กระโดดไปเขียนใหม่ **ทุกใบในระบบ** ทั้งที่ของเดิมอยู่ครบ

      ✅ **ตรวจแล้วข้อมูลไม่ซ้ำ** — เขียนแบบ DELETE ก่อนแล้ว INSERT และตารางมี PRIMARY KEY (number,line)
      ⚠️ **แต่มันถูกโดยบังเอิญ ไม่ใช่เพราะตั้งใจ** [[correct-by-accident]]
         ความเสียหายจริงคือ **เผาโควตา D1 เงียบ ๆ** — ไฟล์นี้เขียนกำกับเองว่าเลี่ยงการเขียนซ้ำ
         เพราะโควตา แล้วทางที่ล้มก็พาไปเขียนทุกใบพอดี **โดยไม่มีอะไรฟ้องสักคำ**
      ⇒ อ่านไม่ได้ = **ข้ามงานเติมบรรทัดรอบนี้ไปเลย** แล้วบอกออกไปว่าข้ามเพราะอะไร
         (ใบที่เนื้อหาเปลี่ยนจริงยังถูกเขียนตามปกติ — ไม่ได้หยุดทั้งการซิงก์) */
  let haveLines = null;
  try {
    const got = await coreQuery(`SELECT DISTINCT number FROM purchase_order_items`);
    if (Array.isArray(got)) haveLines = new Set(got.map((r) => String(r.number)));
  } catch {
    haveLines = null; // อ่านไม่ได้จริง ๆ
  }

  // repairItems=1 ⇒ เขียนบรรทัดใหม่ทุกใบ (ใช้ตอนแก้การจับคู่ฟิลด์ที่ผิด)
  const linesUnknown = haveLines === null && !opt.repairItems;
  const needLines = opt.repairItems
    ? rows.filter((r) => r.items.length)
    : linesUnknown
      ? [] // ไม่รู้ว่าใบไหนมีบรรทัดแล้ว ⇒ ไม่เดา ไม่เขียนทับทั้งระบบ
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
    /* ⚠️ **ต้องบอกออกไปว่ารอบนี้ข้ามงานเติมบรรทัด** ไม่งั้น lineRepairs:0 จะอ่านได้ว่า
        "ไม่มีใบไหนต้องเติม" ซึ่งตรงข้ามกับความจริง ("อ่านไม่ได้เลยไม่รู้ว่าต้องเติมใบไหน")
        เป็นกับดักสามสถานะตัวเดิม: ไม่มีงาน · มีงานทำเสร็จ · **ไม่รู้ว่ามีงานไหม** */
    ...(linesUnknown
      ? { lineRepairsSkipped: "อ่านตารางบรรทัดใบซื้อไม่ได้รอบนี้ — ข้ามงานเติมบรรทัดไว้ก่อน (ไม่ได้แปลว่าไม่มีใบต้องเติม)" }
      : {}),
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
/* ── แยก "หัวใบ" ออกจาก "บรรทัดสินค้า" — ใช้ร่วมกันทั้งใบเสนอราคาและใบโอน ──
 *
 * 🔴 **บั๊กที่ตัวนี้เกิดมาแก้ (ฝั่งจอจับได้ 9 ก.ย. 2569)**
 *    เดิมเขียนว่า `data.detail ?? data.data ?? data.list[0]`
 *    แต่ ZORT **วางตัวใบไว้ที่ระดับบนสุดเลย** และ `data.list` คือ **อาร์เรย์บรรทัดสินค้า**
 *    ⇒ ตกไปหยิบ `list[0]` = บรรทัดแรก มาเป็นทั้งใบทุกครั้ง
 *    ⇒ `number` ที่นึกว่าเลขที่ใบ คือ **จำนวนชิ้นในบรรทัด** (TF ขึ้น "ใบโอน 37")
 *       และกล่องเงินโชว์ `pricepernumber` = ราคาต่อหน่วย ไม่ใช่ยอดใบ
 *    ⚠️ **มันผิดแบบดูเหมือนถูก** — หน้าจอมีเลขครบทุกช่อง ไม่มี error สักตัว
 *       จับได้เพราะ `lines` เป็น null ทุกใบ (ของจริงต้องมีบรรทัด) เท่านั้น
 *
 * ⚠️ **ห้ามกลับไปใช้ `list[0]` เป็นหัวใบเด็ดขาด** ไม่ว่าจะเพิ่มเงื่อนไขอะไรก็ตาม
 * ⚠️ **export ออกมาเพื่อให้ทดสอบได้จริง** — ไม่ใช่เพื่อให้ที่อื่นเรียกใช้
 *    (ตัวที่ทดสอบไม่ได้ = ตัวที่ไม่มีใครรู้ว่ามันยังถูกอยู่ไหม)
 * ⚠️ หาหัวใบไม่เจอ = **คืน null แล้วให้ผู้เรียกตอบว่าหาไม่เจอ**
 *    ห้ามคืนบรรทัดสินค้าเป็นทางถอยกลับ — ผิดเงียบแย่กว่าตอบว่าไม่รู้
 */
const LINE_MARKERS = ["sku", "productid", "pricepernumber", "bundleitemid", "totalprice"];
/** จริงเมื่อหน้าตาเป็น "บรรทัดสินค้า" ไม่ใช่หัวใบ */
export function looksLikeLine(o) {
  if (!o || typeof o !== "object") return false;
  return LINE_MARKERS.some((k) => k in o);
}
/** หาหัวใบจากคำตอบดิบของ ZORT · คืน null ถ้าไม่เจอของที่หน้าตาเป็นหัวใบ */
export function pickDocHeader(data) {
  for (const cand of [data?.detail, data?.data, data]) {
    if (!cand || typeof cand !== "object" || Array.isArray(cand)) continue;
    if (looksLikeLine(cand)) continue;          // บรรทัดสินค้า — ข้าม
    if (!("number" in cand) && !("id" in cand)) continue;
    return cand;
  }
  return null;
}
/** บรรทัดสินค้าในใบ · null = ZORT ไม่ส่งช่องบรรทัดมาเลย (คนละความหมายกับ []) */
export function docLines(doc) {
  const l = Array.isArray(doc?.list) ? doc.list : Array.isArray(doc?.items) ? doc.items : null;
  return l;
}

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
  const t = pickDocHeader(data);
  if (!t) {
    return { error: "ZORT ตอบมาแต่หาหัวใบไม่เจอ", fields: Object.keys(data ?? {}) };
  }
  const lines = docLines(t);
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
  const q = pickDocHeader(data);
  if (!q) return { error: "ZORT ตอบมาแต่หาหัวใบไม่เจอ", fields: Object.keys(data ?? {}) };
  const lines = docLines(q);
  return {
    live: true,
    number: String(q.number ?? ""),
    /* ── ช่องที่จอใช้แสดงจริง (เพิ่ม 9 ก.ย. 2569 หลังรู้โครงจริงแล้ว) ──
       ก่อนหน้านี้ตัวนี้เป็น "เครื่องมือไล่ปัญหา" ล้วน ๆ ส่งแต่ก้อนเงินดิบให้คนอ่านเอง
       เพราะตอนนั้น **ยังไม่รู้ว่าช่องไหนคือยอดใบ** ⇒ เดาไม่ได้ ห้ามเดา
       ตอนนี้ยิงของจริงเห็นแล้วว่า `amount` คือยอดใบ จึงส่งเป็นช่องตรง ๆ ได้
       ⚠️ **ยังส่งก้อนเงินดิบไปด้วยเหมือนเดิม ห้ามลบ** — วันที่ ZORT เปลี่ยนชื่อช่อง
          จอจะเห็นว่ามีช่องอื่นโผล่มา แทนที่จะเห็น amount กลายเป็น 0 เงียบ ๆ */
    status: String(q.status ?? ""),
    date: String(q.quotationdateString ?? q.quotationdate ?? "").slice(0, 10),
    customer: String(q.customername ?? ""),
    amount: num(q.amount),
    vatAmount: num(q.vatamount),
    discountAmount: num(q.discountamount),
    shippingAmount: num(q.shippingamount),
    /* ส่งช่องเงินทุกชื่อที่เป็นไปได้กลับไป **โดยไม่เลือกให้** — คนดูจะได้เห็นเองว่าช่องไหนมีค่า */
    "เงินที่ ZORT เก็บไว้": Object.fromEntries(
      Object.entries(q).filter(([k, v]) => /price|amount|total|net|grand/i.test(k) && v !== null)
    ),
    /* สามสถานะ: null = ไม่มีช่องบรรทัด · [] = ใบนี้ไม่มีของ · มีของ = ได้บรรทัดจริง */
    lines: lines
      ? lines.map((i) => ({
          sku: String(i?.sku ?? ""),
          name: String(i?.name ?? ""),
          qty: num(i?.number),                 // ⚠️ ZORT ใช้ชื่อ `number` แทนจำนวน — ตัวเดียวกับที่เคยถูกอ่านผิดเป็นเลขที่ใบ
          unit: String(i?.unittext ?? ""),
          pricePerUnit: num(i?.pricepernumber),
          total: num(i?.totalprice),
          "ทุกช่องในบรรทัด": Object.fromEntries(
            Object.entries(i ?? {}).filter(([, v]) => v !== null && v !== "")
          ),
        }))
      : null,
    fields: Object.keys(q).sort(),
  };
}

/**
 * รวมของที่ลูกค้าคืน **แยกรายรหัสสินค้า** — ใช้ตอบว่าแผนสั่งซื้อสั่งเกินรหัสไหนบ้าง
 *
 * ⚠️ **ทำไมต้องมี**: `reorderPlan` คิดความต้องการจากใบขาย **โดยไม่หักของที่ลูกค้าคืน**
 *    ⇒ รหัสที่ถูกคืนบ่อยจะถูกสั่งเกิน · ยอดรวมทั้งร้านเล็ก (90 วัน = ฿26,399)
 *    **แต่ยอดรวมไม่ใช่เกณฑ์ที่ถูก** (ฝั่งจอชี้ 7 ก.ย. 2569) — ต้องดู **รายรหัสที่แย่ที่สุด**
 *    รหัสไหนที่ของคืนเกิน ~10% ของยอดขายตัวเอง = แผนสั่งเกินสำหรับรหัสนั้นอย่างมีนัย
 *
 * ⚠️ ใบคืนในรายการรวม **ไม่มีรายการสินค้าติดมา** ⇒ ต้องดึงรายใบ
 *    ⇒ จำกัดด้วยช่วงวัน (ค่าเริ่มต้น 90 วัน ≈ 45 ใบ) **ไม่ใช่ดึงทั้ง 682 ใบ**
 *    ⚠️ ใบไหนดึงไม่ได้ = **นับแยกไว้ที่ `unreadable` ห้ามนับเป็นศูนย์**
 *       ไม่งั้นรหัสที่อยู่ในใบนั้นจะดูเหมือนไม่เคยถูกคืน ซึ่งตรงข้ามกับความจริง
 */
export async function returnsBySku(daysRaw = 90) {
  const h = headers();
  if (!h) return { error: "ยังไม่ได้ตั้งรหัส ZORT" };
  const days = Math.max(7, Math.min(365, num(daysRaw) || 90));
  const since = new Date(Date.now() + 7 * 3600e3 - days * 864e5).toISOString().slice(0, 10);

  const res = await fetch(`${BASE}/ReturnOrder/GetReturnOrders?limit=200`, {
    headers: h,
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const list = Array.isArray(data?.list) ? data.list : null;
  if (!list) return { error: "ดึงรายการใบคืนจาก ZORT ไม่ได้" };

  const inRange = list.filter(
    (r) => String(r?.returnorderdateString ?? r?.returnorderdate ?? "").slice(0, 10) >= since
  );

  /* ยิงรายละเอียดพร้อมกัน — ห้ามไล่เรียงกัน (เพดานเวลาฟังก์ชัน 26 วิ) */
  const details = await Promise.all(
    inRange.slice(0, 120).map(async (r) => {
      const id = r?.id;
      if (!id) return null;
      const d = await fetch(`${BASE}/ReturnOrder/GetReturnOrderDetail?id=${encodeURIComponent(id)}`, {
        headers: h,
        signal: AbortSignal.timeout(12000),
      })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      return { number: r?.number, at: String(r?.returnorderdateString ?? "").slice(0, 10), d };
    })
  );

  const bySku = new Map();
  let unreadable = 0;
  let lines = 0;
  for (const got of details) {
    if (!got) { unreadable += 1; continue; }
    const rows = Array.isArray(got.d?.list) ? got.d.list : null;
    if (!rows) { unreadable += 1; continue; }
    for (const it of rows) {
      const sku = String(it?.sku ?? "").trim();
      if (!sku) continue;
      lines += 1;
      const cur = bySku.get(sku) ?? { sku, qty: 0, docs: 0, name: String(it?.name ?? "") };
      cur.qty += num(it?.number ?? it?.qty);
      cur.docs += 1;
      bySku.set(sku, cur);
    }
  }

  /* ── เทียบกับยอดขายของรหัสนั้นเอง — ขั้นนี้คือขั้นที่ตอบคำถามจริง ──
     ⚠️ ยอดคืนดิบตอบไม่ได้ว่า "มีนัยไหม" · 192 ชิ้นบนรหัสที่ขาย 20,000 กับ
        192 บนรหัสที่ขาย 300 คือคนละเรื่องกันคนละโลก
     ⚠️ ต้องกันช่วงวัน **เดียวกัน** กับที่นับของคืน ไม่งั้นตัวหารกับตัวตั้งคนละขอบเขต
        (ดู [[numbers-need-scope]] — โดนมาแล้ว 3 ครั้งในวันเดียว) */
  const CANCEL =
    `o.status NOT LIKE '%cancel%' AND o.status NOT LIKE '%void%' AND o.status NOT LIKE '%ยกเลิก%'`;
  const soldRows = await coreQuery(
    `SELECT oi.sku AS sku, SUM(oi.qty) AS qty
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.order_date >= ? AND ${CANCEL}
     GROUP BY oi.sku`,
    [since]
  ).catch(() => null);

  /* 🔴 สามสถานะ: ดึงไม่ได้ ≠ ขายศูนย์ — [[three-states-not-two]]
     ดึงยอดขายไม่ได้แล้วเขียน sold:0 ⇒ อัตราคืนกลายเป็น "อนันต์" ทุกรหัส
     ⇒ ดูเหมือนพังทั้งร้าน ทั้งที่แค่ query ล้ม */
  const soldOk = Array.isArray(soldRows);
  const soldBy = new Map(
    (soldOk ? soldRows : []).map((r) => [String(r.sku ?? ""), num(r.qty)])
  );

  const skus = [...bySku.values()]
    .map((r) => {
      const sold = soldOk ? (soldBy.get(r.sku) ?? 0) : null;
      return {
        ...r,
        sold,
        /* อัตราคืน = คืน ÷ ขาย · null เมื่อยังไม่รู้ยอดขาย หรือรหัสนั้นไม่มียอดขายในกระจก
           ⚠️ ขาย 0 แต่คืนมี = **ไม่ใช่ 100%** แต่คือ "ของที่ขายก่อนช่วงนี้" หรือกระจกขาด
              ⇒ ติดธง `noSales` ให้เห็น ห้ามคิดเป็นอัตรา */
        pct: soldOk && sold > 0 ? Math.round((r.qty / sold) * 1000) / 10 : null,
        noSales: soldOk && !(sold > 0),
      };
    })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.qty - a.qty);

  /* ⚠️ **เกณฑ์ 10% อย่างเดียวใช้ไม่ได้ — ต้องมีฐานยอดขายพอด้วย** (วัดจริง 7 ก.ย. 2569)
     รอบแรกที่ยิงจริง เกณฑ์ 10% ติด 16 รหัส แล้ว verdict เขียนว่า "แผนสั่งเกิน"
     **ซึ่งผิด** — ทั้ง 16 รหัสขายแค่ 1–11 ชิ้นใน 90 วัน · "คืน 2 จากขาย 2 = 100%"
     ไม่ใช่อัตรา มันคือกลุ่มตัวอย่างขนาด 2 · รวมกันทั้ง 16 รหัสคืนแค่ 21 ชิ้นจาก 702
     ส่วนรหัสที่ขายจริงเป็นพัน อัตราอยู่ที่ 1.1–4.5% ทุกตัว
     ⇒ ต้องมี `MIN_BASE` ไม่งั้นได้คำตอบที่มั่นใจและผิด ([[sampling-is-not-proof]]) */
  const MIN_BASE = 20;
  const bad = skus.filter((r) => (r.pct ?? 0) >= 10 && r.sold >= MIN_BASE);
  /* แยกกองไว้ให้เห็น ไม่ใช่ซ่อน — คนอ่านต้องรู้ว่ามีของถูกกันออกด้วยเหตุผลอะไร */
  const tooFewToTell = skus.filter((r) => (r.pct ?? 0) >= 10 && r.sold < MIN_BASE);

  return {
    days,
    since,
    docsInRange: inRange.length,
    docsRead: inRange.length - unreadable,
    /* 🔴 ห้ามกลืน — ใบที่อ่านไม่ได้แปลว่า "ยังไม่รู้" ไม่ใช่ "ไม่มีของคืน" */
    unreadable,
    lines,
    /* 🔴 ดึงยอดขายไม่ได้ ⇒ ทุก pct เป็น null ⇒ **ห้ามสรุปว่าไม่มีรหัสไหนเกิน 10%** */
    soldReadable: soldOk,
    skus,
    minBase: MIN_BASE,
    overThreshold: bad.map((r) => r.sku),
    /* 🔴 รหัสที่อัตราเกิน 10% แต่ฐานน้อยเกินจะสรุป — **ต้องโชว์ ห้ามซ่อน**
       ซ่อน = คนอ่านนึกว่าตรวจครบ · โชว์พร้อมเหตุผล = คนอ่านตัดสินเองได้ */
    tooFewToTell: tooFewToTell.map((r) => `${r.sku} (คืน ${r.qty}/ขาย ${r.sold})`),
    verdict: !soldOk
      ? "ยังตอบไม่ได้ — ดึงยอดขายรายรหัสจากกระจกไม่สำเร็จ"
      : bad.length
        ? `มี ${bad.length} รหัสที่ของคืนเกิน 10% ของยอดขายตัวเอง (และขาย ≥${MIN_BASE} ชิ้น พอให้เชื่ออัตราได้) ⇒ แผนสั่งซื้อสั่งเกินสำหรับรหัสพวกนี้`
        : `ไม่มีรหัสไหนที่ของคืนเกิน 10% ของยอดขายตัวเอง **ในกลุ่มที่ขาย ≥${MIN_BASE} ชิ้น** ⇒ แผนสั่งซื้อไม่ได้สั่งเกินอย่างมีนัย` +
          (tooFewToTell.length
            ? ` · มีอีก ${tooFewToTell.length} รหัสที่อัตราสูงแต่ขายน้อยเกินจะสรุป (ดู tooFewToTell)`
            : ""),
    note:
      "ตัวตั้ง (ของคืน) มาจาก ZORT · ตัวหาร (ยอดขาย) มาจากกระจกของเรา — **คนละแหล่ง** " +
      "ช่วงวันบังคับให้ตรงกันแล้ว แต่ถ้ากระจกขาดใบ อัตราจะสูงเกินจริง ไม่ใช่ต่ำเกินจริง",
  };
}

/** ตารางใบคืนสินค้าในกระจก — สร้างครั้งเดียวแล้วจำไว้ (แบบเดียวกับ purchase_orders)
 *
 * ⚠️ **ทำไมกระจกต้องมีใบคืน** (7 ก.ย. 2569 · เจ้าของร้านสั่งทำงานต่อกลางคืน)
 *  1. ปิดเอกสาร 6 ใบใน `?doccoverage=1` ที่อ้างใบคืนแล้วเทียบไม่ติดเพราะเราไม่มีตาราง
 *  2. **จอรับคืน (returns) ต้องใช้เป็น "ขานอกระบบ"** — ผลเวทีถก #4: ตัววัดที่เก็บแต่ในจอ
 *     ตาบอดต่อ "คนเลิกใช้จอ" ⇒ ต้องมีขาที่นับจาก ZORT ซึ่งเกิดจากงานที่ร้านทำอยู่แล้ว
 *  3. เทียบยอดคืนรายวันสองฝั่งได้ (สูตรเดียวกับกระจกออเดอร์)
 *
 * ⚠️ `number` เป็น PRIMARY KEY — เลขใบคืนของ ZORT ไม่ซ้ำ
 *    แต่ **ห้ามใช้ `reference` เป็นคีย์** เพราะเป็นเลขออเดอร์แพลตฟอร์ม ซ้ำได้ข้ามใบ
 */
let returnTableReady = false;
async function ensureReturnTable() {
  if (returnTableReady) return;
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS return_orders (
       number TEXT PRIMARY KEY, reference TEXT, customer TEXT,
       amount REAL NOT NULL DEFAULT 0, status TEXT, warehouse TEXT,
       return_date TEXT, paid TEXT, updated_at TEXT)`
  );
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_ret_date ON return_orders(return_date)`);
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_ret_ref ON return_orders(reference)`);
  returnTableReady = true;
}

/**
 * ดึงใบคืนจาก ZORT ลงกระจก — เขียนเฉพาะใบที่เปลี่ยนจริง (โควตา D1)
 *
 * ⚠️ ZORT `GetReturnOrders` ให้ทีละ 200 ใบและ**เรียงใหม่ไปเก่า** ⇒ ต้องไล่หน้า
 *    ไม่ใช่ขอ limit ใหญ่ ๆ ครั้งเดียว · เพดานหน้าไว้กันวนไม่รู้จบ ชนแล้ว**ต้องบอก**
 *    ห้ามเงียบแล้วรายงานเหมือนดึงครบ (บทเรียนเดิมของ zortDocumentsRead)
 * ⚠️ ยิงหน้า 2 เป็นต้นไปพร้อมกัน — ไล่เรียงกันจะชนเพดานเวลาฟังก์ชัน 26 วิ
 */
export async function syncReturnOrders(opt = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const h = headers();
  if (!h) return { skip: "ยังไม่ได้ตั้งรหัส ZORT" };
  await ensureReturnTable();

  const per = 200;
  const MAX_PAGES = Math.max(1, Math.min(30, num(opt.pages) || 12));
  const page = async (n) =>
    fetch(`${BASE}/ReturnOrder/GetReturnOrders?limit=${per}&page=${n}`, {
      headers: h,
      signal: AbortSignal.timeout(15000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

  const first = await page(1);
  const total = num(first?.count);
  const rows = Array.isArray(first?.list) ? [...first.list] : null;
  /* 🔴 ดึงหน้าแรกไม่ได้ = "ยังไม่รู้" ห้ามเขียนทับกระจกด้วยความว่าง
     (บทเรียน syncPurchases 7 ก.ย.: อ่านล้มแล้วตีเป็น "ไม่มีบรรทัด" จนเขียนทับทั้งกอง) */
  if (!rows) return { error: "ดึงใบคืนหน้าแรกจาก ZORT ไม่ได้ — ไม่แตะกระจก" };

  const lastPage = Math.min(MAX_PAGES, Math.ceil(total / per) || 1);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, lastPage - 1) }, (_, i) => page(i + 2))
  );
  let pagesFailed = 0;
  for (const d of rest) {
    if (Array.isArray(d?.list)) rows.push(...d.list);
    else pagesFailed += 1;
  }
  const hitPageCap = Math.ceil(total / per) > MAX_PAGES;

  /* กันซ้ำข้ามหน้า — ข้อมูลขยับระหว่างไล่หน้าได้ */
  const seen = new Set();
  const uniq = [];
  for (const r of rows) {
    const numTxt = String(r?.number ?? "").trim();
    if (!numTxt || seen.has(numTxt)) continue;
    seen.add(numTxt);
    uniq.push(r);
  }

  /* อ่านของเดิมมาเทียบก่อนเขียน — การอ่านถูกกว่าการเขียนมากบน D1 */
  const prevRows = (await coreQuery(
    `SELECT number, reference, customer, amount, status, warehouse, return_date, paid FROM return_orders`
  ).catch(() => null)) ?? [];
  const prev = new Map(prevRows.map((r) => [String(r.number), r]));

  let written = 0, skipped = 0;
  for (const r of uniq) {
    const row = {
      number: String(r?.number ?? ""),
      reference: String(r?.reference ?? ""),
      customer: String(r?.customername ?? ""),
      amount: num(r?.amount),
      status: String(r?.status ?? ""),
      warehouse: String(r?.warehousename ?? ""),
      return_date: String(r?.returnorderdateString ?? r?.returnorderdate ?? "").slice(0, 10),
      paid: String(r?.paymentstatus ?? r?.paymentStatus ?? ""),
    };
    const old = prev.get(row.number);
    const same =
      old &&
      String(old.reference ?? "") === row.reference &&
      String(old.customer ?? "") === row.customer &&
      num(old.amount) === row.amount &&
      String(old.status ?? "") === row.status &&
      String(old.warehouse ?? "") === row.warehouse &&
      String(old.return_date ?? "") === row.return_date &&
      String(old.paid ?? "") === row.paid;
    if (same) { skipped += 1; continue; }
    await coreQuery(
      `INSERT INTO return_orders (number, reference, customer, amount, status, warehouse, return_date, paid, updated_at)
       VALUES (?,?,?,?,?,?,?,?,datetime('now'))
       ON CONFLICT(number) DO UPDATE SET
         reference=excluded.reference, customer=excluded.customer, amount=excluded.amount,
         status=excluded.status, warehouse=excluded.warehouse, return_date=excluded.return_date,
         paid=excluded.paid, updated_at=datetime('now')`,
      [row.number, row.reference, row.customer, row.amount, row.status, row.warehouse, row.return_date, row.paid]
    );
    written += 1;
  }

  return {
    ok: true,
    zortTotal: total,
    fetched: uniq.length,
    written,
    skipped,
    /* 🔴 ทั้งสองธงนี้ห้ามกลืน — ชนเพดาน/หน้าล้ม = "ยังไม่ครบ" ไม่ใช่ "ครบแล้ว" */
    hitPageCap,
    pagesFailed,
    complete: !hitPageCap && pagesFailed === 0 && uniq.length >= total,
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

/** ใบสั่งซื้อรายใบ — ตาม /Buy/Details ของ ZORT
 *  (งานเทียบ "ZORT กดได้เราไม่" 8 ก.ย. 2569 · ฝั่งจอชี้ว่า list=purchaseitems เป็น
 *   การรวมยอดรายสินค้า ไม่ใช่รายใบ ⇒ ต้องมีเส้นนี้แยก)
 *  ⚠️ อ่านจาก **กระจก** ไม่ใช่ยิง ZORT สด — ใบเก่าที่ ZORT ลบไปแล้วจะยังเห็นที่นี่
 *     ซึ่งเป็นเรื่องดี (กระจกคือหลักฐานของเรา) แต่จอต้องเขียนว่าเป็นข้อมูลกระจก
 *     ไม่ใช่ปล่อยให้เข้าใจว่ายิงสด (ดู updatedAt เทียบกับรอบซิงก์ล่าสุด) */
export async function getPurchaseDetail(number) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await ensureTables();
  const no = String(number ?? "").trim().slice(0, 60);
  if (!no) return { error: "ต้องระบุเลขที่ใบสั่งซื้อ" };

  const head = (
    await coreQuery(`SELECT * FROM purchase_orders WHERE number = ${esc(no)}`)
  )[0];
  if (!head) return { error: `ไม่พบใบสั่งซื้อ ${no} ในกระจก` };

  const lines = await coreQuery(
    `SELECT line, sku, name, qty, price FROM purchase_order_items
      WHERE number = ${esc(no)} ORDER BY line`
  );
  /* ⚠️ **ยอดรวมของบรรทัด ≠ ยอดหัวใบเสมอไป** — หัวใบมีส่วนลด/ค่าส่ง/ภาษีที่กระจกไม่ได้เก็บ
     ⇒ ส่งทั้งสองค่าไปให้จอ **ห้ามเลือกให้ค่าเดียว** และห้ามคิดว่าต่างกัน = ข้อมูลผิด
     (คลาสเดียวกับใบเสนอราคาที่ท่อจงใจส่งช่องเงินทุกช่อง ไม่ตีความแทน) */
  const lineTotal = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  return {
    number: head.number,
    vendor: head.vendor || null,
    poDate: head.po_date || null,
    status: head.status || null,
    paymentStatus: head.payment_status || null,
    warehouse: head.warehouse || null,
    note: head.note || null,
    amount: Number(head.amount) || 0,     // ยอดหัวใบตามที่ ZORT ให้มา
    lineTotal,                            // ผลรวมบรรทัด (คิดเอง)
    lines,
    updatedAt: head.updated_at || null,
    source: "กระจกคลังเงา (ไม่ได้ยิง ZORT สด)",
  };
}

/** อ่านใบคืนสินค้ารายใบ — **อ่านอย่างเดียว** (ฝั่งจอขอ 9 ก.ย. 2569)
 *
 * ใช้ `pickDocHeader` ตัวเดียวกับใบเสนอราคา/ใบโอน — **โดยตั้งใจ**
 * 🔴 เส้นนี้เพิ่งเปิดใหม่ ถ้าเขียนตัวแยกหัวใบของตัวเองอีกอัน มันจะพลาดซ้ำแบบเดิมได้
 *    (บั๊กอ่านผิดชั้น 9 ก.ย. 2569 เกิดเพราะแต่ละเส้นเดาโครงเอง) ⇒ ใช้ของกลางเสมอ
 * ⚠️ ยังไม่เคยเห็นโครงจริงของเส้นนี้ ⇒ **คืน `fields` กลับไปด้วยเสมอ ห้ามลบ**
 *    จอจะได้รู้ว่ามีช่องอะไรให้ใช้จริง แทนที่จะเดาจากชื่อฟังก์ชัน
 *    และส่งช่องเงินทุกชื่อที่เป็นไปได้ไปด้วย **โดยไม่เลือกให้** จนกว่าจะเห็นของจริง
 */
export async function getReturnOrderDetail(id) {
  const h = headers();
  if (!h) return { error: "ยังไม่ได้ตั้งรหัส ZORT" };
  const key = String(id ?? "").trim();
  if (!key) return { error: "ต้องระบุเลขที่ใบคืน" };
  const res = await fetch(
    `${BASE}/ReturnOrder/GetReturnOrderDetail?id=${encodeURIComponent(key)}`,
    { headers: h, signal: AbortSignal.timeout(15000) }
  ).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  if (!data) return { error: "ดึงรายละเอียดใบคืนจาก ZORT ไม่ได้" };

  const r = pickDocHeader(data);
  if (!r) return { error: "ZORT ตอบมาแต่หาหัวใบไม่เจอ", fields: Object.keys(data ?? {}) };
  const lines = docLines(r);

  return {
    live: true,
    number: String(r.number ?? ""),
    status: String(r.status ?? ""),
    date: String(r.returndateString ?? r.returndate ?? r.createdatetimeString ?? "").slice(0, 10),
    customer: String(r.customername ?? ""),
    reference: String(r.reference ?? ""),
    /* ⚠️ ยังไม่ยืนยันว่าช่องไหนคือยอดใบของเส้นนี้ ⇒ **ส่งทุกช่องเงินไปให้ดูเอง ห้ามเดา**
        (เดาผิดคือยอดคืนผิดทั้งร้าน) · เห็นของจริงเมื่อไหร่ค่อยตั้งชื่อช่องให้ */
    "เงินที่ ZORT เก็บไว้": Object.fromEntries(
      Object.entries(r).filter(([k, v]) => /price|amount|total|net|grand/i.test(k) && v !== null)
    ),
    /* สามสถานะ: null = ไม่มีช่องบรรทัด · [] = ใบนี้ไม่มีของ · มีของ = ได้บรรทัดจริง */
    lines: lines
      ? lines.map((i) => ({
          sku: String(i?.sku ?? ""),
          name: String(i?.name ?? ""),
          qty: num(i?.number ?? i?.amount),   // ⚠️ ZORT ใช้ `number` แทนจำนวน (ตัวที่เคยถูกอ่านผิดเป็นเลขที่ใบ)
          unit: String(i?.unittext ?? ""),
          "ทุกช่องในบรรทัด": Object.fromEntries(
            Object.entries(i ?? {}).filter(([, v]) => v !== null && v !== "")
          ),
        }))
      : null,
    fields: Object.keys(r).sort(),
  };
}
