import { isRealDay } from "./param-guard.mjs";
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
import { contains, containsLit } from "./sql-contains.mjs";
import { storeCreds } from "./zort-store-doc-counts.mjs";
import { thaiDayFromUtc } from "./thaiday.mjs";
import { markSync, freshnessOf } from "./core-freshness.mjs";

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
  /* 🏷️ ตารางใบซื้อรุ่นแยกร้าน (15 ก.ย. 2569 · ใบ t_mu2pfve9) — ตัวอ่าน/ตัวเขียนย้ายมาใช้ _v2 ทั้งหมด
     ทำไมต้องตารางใหม่ ไม่ ALTER: ตารางเดิมกุญแจ = number · เลขที่ใบซ้ำได้ **แม้ร้านเดียว** (zortFindPurchaseOrder เจอจริง)
     และร้าน z2 (64 ใบ) จะเขียนทับ z1 · SQLite เปลี่ยนกุญแจตารางเดิมไม่ได้
     ⇒ กุญแจ = id ของ ZORT (พิสูจน์แล้วว่าไม่ชนข้ามร้าน: ใบโอน 27,517 · ใบคืน 928 ชน 0) + คอลัมน์ source
     ⚠️ ตารางเดิมไม่มี id ⇒ ย้ายแถวข้ามไม่ได้ ต้องซิงก์ใหม่จาก ZORT · ตัวอ่านเช็คชีพจร ถ้ายังไม่เคยซิงก์ตอบ error ไม่ตอบ 0
     ⚠️ ตารางเดิม (purchase_orders · purchase_order_items) ไม่มีใครเขียนแล้ว เก็บไว้เป็นหลักฐาน ห้ามอ่าน */
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS purchase_orders_v2 (
       id TEXT PRIMARY KEY, source TEXT NOT NULL, number TEXT, vendor TEXT, po_date TEXT, status TEXT,
       amount REAL NOT NULL DEFAULT 0, payment_status TEXT, warehouse TEXT, note TEXT, updated_at TEXT)`
  );
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_po2_src_date ON purchase_orders_v2(source, po_date)`);
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_po2_number ON purchase_orders_v2(number)`);
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS purchase_order_items_v2 (
       po_id TEXT NOT NULL, line INTEGER NOT NULL, source TEXT NOT NULL, number TEXT, sku TEXT, name TEXT,
       qty REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0, PRIMARY KEY (po_id, line))`
  );
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_poi2_sku ON purchase_order_items_v2(sku)`);
  tablesReady = true;
}

/** ร้านนี้เคยซิงก์ใบซื้อเข้าตาราง _v2 หรือยัง — ยังไม่เคย ⇒ ตัวอ่านตอบ error (ห้ามตอบ 0 ใบ)
 *  อ่านชีพจรไม่ได้ ⇒ error คนละข้อความ (ไม่รู้ ≠ ยังไม่ซิงก์) */
async function purchasesSyncedError(store) {
  let row;
  try {
    [row] = await coreQuery(`SELECT v, at FROM core_meta WHERE k = ?`, [`sync_purchases_${store}`]);
  } catch {
    return `อ่านชีพจรซิงก์ใบซื้อของร้าน ${store} ไม่ได้ — ยังไม่รู้ว่ามีใบซื้อหรือไม่`;
  }
  return row ? null : `ยังไม่ได้ซิงก์ใบซื้อของร้าน ${store} เข้าตารางใหม่ — สั่ง ?syncpurchases=1&store=${store} ก่อน (ไม่ได้แปลว่าไม่มีใบซื้อ)`;
}

/** ดึงใบสั่งซื้อทั้งหมดจาก ZORT มาเก็บ — เขียนเฉพาะใบที่เปลี่ยนจริง (โควตา D1) */
export async function syncPurchases(opt = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const store = opt.store ?? "z1";
  if (store !== "z1" && store !== "z2") return { error: `store ต้องเป็น z1 หรือ z2 (ได้มา "${String(store).slice(0, 20)}")` };
  const h = store === "z1" ? headers() : storeCreds("z2");
  if (!h) return { skip: `ยังไม่ได้ตั้งรหัส ZORT ของร้าน ${store}` };
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
  if (!all.length) return { store, error: "ดึงใบสั่งซื้อจาก ZORT ไม่ได้" };

  const rows = all
    .map((p) => ({
      id: String(p?.id ?? "").trim().slice(0, 60),
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
  // ไม่มี id = ไม่มีกุญแจ ⇒ ไม่เขียน และนับบอก (ท่าเดียวกับใบคืน)
  const missingId = rows.filter((r) => !r.id).length;
  const withId = rows.filter((r) => r.id);

  const prev = new Map(
    (
      await coreQuery(
        `SELECT id, number, vendor, po_date, status, amount, payment_status, warehouse, note FROM purchase_orders_v2 WHERE source = ${esc(store)}`
      )
    ).map((r) => [String(r.id), r])
  );
  const changed = withId.filter((r) => {
    const p = prev.get(r.id);
    return (
      !p ||
      String(p.number ?? "") !== r.number ||
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

  /* 🔒 กันเขียนทับข้ามร้าน — ท่าเดียวกับใบโอน/ใบคืน · อ่านล้ม = โยน */
  const clash = new Set();
  for (let i = 0; i < changed.length; i += 100) {
    const ids = changed.slice(i, i + 100).map((r) => esc(r.id)).join(",");
    const hit = await coreQuery(`SELECT id FROM purchase_orders_v2 WHERE id IN (${ids}) AND source <> ${esc(store)}`);
    for (const x of hit) if (x?.id !== undefined && x?.id !== null) clash.add(String(x.id));
  }
  const toWrite = changed.filter((r) => !clash.has(r.id));
  for (let i = 0; i < toWrite.length; i += 40) {
    const values = toWrite
      .slice(i, i + 40)
      .map(
        (r) =>
          `(${esc(r.id)},${esc(store)},${esc(r.number)},${esc(r.vendor)},${esc(r.date)},${esc(r.status)},${r.amount},` +
          `${esc(r.pay)},${esc(r.wh)},${esc(r.note)},datetime('now'))`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO purchase_orders_v2 (id,source,number,vendor,po_date,status,amount,payment_status,warehouse,note,updated_at)
       VALUES ${values}
       ON CONFLICT(id) DO UPDATE SET number=excluded.number, vendor=excluded.vendor, po_date=excluded.po_date,
         status=excluded.status, amount=excluded.amount, payment_status=excluded.payment_status,
         warehouse=excluded.warehouse, note=excluded.note, updated_at=excluded.updated_at
       WHERE purchase_orders_v2.source = excluded.source`
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
    const got = await coreQuery(`SELECT DISTINCT po_id FROM purchase_order_items_v2 WHERE source = ${esc(store)}`);
    if (Array.isArray(got)) haveLines = new Set(got.map((r) => String(r.po_id)));
  } catch {
    haveLines = null; // อ่านไม่ได้จริง ๆ
  }

  // repairItems=1 ⇒ เขียนบรรทัดใหม่ทุกใบ (ใช้ตอนแก้การจับคู่ฟิลด์ที่ผิด)
  const linesUnknown = haveLines === null && !opt.repairItems;
  const needLines = (opt.repairItems
    ? withId.filter((r) => r.items.length)
    : linesUnknown
      ? [] // ไม่รู้ว่าใบไหนมีบรรทัดแล้ว ⇒ ไม่เดา ไม่เขียนทับทั้งระบบ
      : withId.filter((r) => r.items.length && !haveLines.has(r.id))
  ).filter((r) => !clash.has(r.id)); // ใบที่ชนข้ามร้านห้ามแตะบรรทัดของอีกร้าน
  const todo = [...new Map([...toWrite, ...needLines].map((r) => [r.id, r])).values()];
  let lines = 0;
  for (const r of todo) {
    if (!r.items.length) continue;
    await coreQuery(`DELETE FROM purchase_order_items_v2 WHERE po_id = ${esc(r.id)} AND source = ${esc(store)}`);
    const values = r.items
      .slice(0, 200)
      .map(
        (it, i) =>
          `(${esc(r.id)},${i + 1},${esc(store)},${esc(r.number)},${esc(String(it?.sku ?? "").slice(0, 60))},` +
          `${esc(String(it?.name ?? "").slice(0, 160))},${num(it?.number ?? it?.quantity ?? it?.qty)},${num(it?.pricepernumber ?? it?.price)})`
      )
      .join(",");
    if (values) {
      await coreQuery(
        `INSERT INTO purchase_order_items_v2 (po_id,line,source,number,sku,name,qty,price) VALUES ${values}`
      );
      lines += r.items.length;
    }
  }

  /* ชีพจรแยกร้าน — ตัวอ่านใช้ตัดสินว่า "ยังไม่เคยซิงก์" (ตอบ error) กับ "ซิงก์แล้วมีจริง" ⇒ จดเมื่อดึงสำเร็จเท่านั้น
     ⚠️ จดไม่สำเร็จ = กลืน (ซิงก์ห้ามล้มเพราะชีพจร) — ผลคือตัวอ่านยังตอบ "ยังไม่ซิงก์" ซึ่งเป็นทางปลอดภัย */
  const purchasesComplete = missingId === 0 && clash.size === 0;
  try {
    await coreQuery(
      `INSERT INTO core_meta (k,v,at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at`,
      [`sync_purchases_${store}`, purchasesComplete ? "complete" : "incomplete"]
    );
  } catch {
    // ดูคำอธิบายข้างบน
  }
  return {
    store,
    fetched: rows.length,
    written: toWrite.length,
    skipped: withId.length - changed.length,
    missingId, // ใบที่ ZORT ไม่ส่ง id — ไม่ถูกเก็บ
    collisions: clash.size,
    collisionIds: [...clash].slice(0, 20),
    complete: purchasesComplete,
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
  // ร้าน: ผู้เรียกตรวจค่าแล้ว (parseSingleStore) · ไม่ส่งมา = z1
  const store = o.store === "z2" ? "z2" : "z1";
  const notSynced = await purchasesSyncedError(store);
  if (notSynced) return { store, error: notSynced };
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));
  const q = String(o.q ?? "").trim().slice(0, 60);
  /* 📅 from/to = วันที่ใบซื้อ (16 ก.ย. 2569) — จอเมนู 3 เคยกรองช่วงวันเองจาก limit=200 ⇒ เกิน 200 ใบเมื่อไหร่ช่วงจะขาดเงียบ
     ⚠️ สรุป · แท็บสถานะ · แถว ใช้ filter ชุดเดียวกัน · ตรวจวันจริงที่ param-guard (DATE_LISTS) */
  const from = isRealDay(o.from) ? o.from : null;
  const to = isRealDay(o.to) ? o.to : null;
  const filter = `AND source = ${esc(store)}` + (q ? ` AND (${containsLit("number", esc(q))} OR ${containsLit("vendor", esc(q))})` : "") +
    (from ? ` AND po_date >= ${esc(from)}` : "") + (to ? ` AND po_date <= ${esc(to)}` : "");

  const [sum] = await coreQuery(
    `SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS total FROM purchase_orders_v2 WHERE 1=1 ${filter}`
  );
  // แท็บสถานะแบบ ZORT — **นับข้ามตัวกรองสถานะเสมอ** (กติกาเดียวกับจอรายการขาย)
  const byStatus = await coreQuery(
    `SELECT status, COUNT(*) AS c FROM purchase_orders_v2 WHERE 1=1 ${filter} GROUP BY status ORDER BY c DESC`
  );
  const rows = await coreQuery(
    `SELECT id, number, vendor, po_date, status, amount, payment_status, warehouse
     FROM purchase_orders_v2 WHERE 1=1 ${filter}
     ORDER BY po_date DESC, number DESC LIMIT ${limit} OFFSET ${offset}`
  );
  /* 🕘 ฝั่งจอขอ 19 ก.ย. 2569 เพื่อ **แคชตัวนับแท็บได้โดยไม่ต้องเดาเวลาหมดอายุ**
     เทียบ changedAtUtc กับค่าที่ถืออยู่: เท่าเดิม = ใช้ของในมือต่อ · ต่าง = ยิงใหม่
     ⚠️ ห้ามใช้ syncedAtUtc ตัดสินว่าต้องยิงใหม่ — มันขยับทุกรอบแม้ข้อมูลไม่เปลี่ยน
        มันมีไว้แยก "ข้อมูลไม่ขยับ" ออกจาก "ซิงก์ตาย" เท่านั้น (ดู core-freshness.mjs) */
  const freshness = await freshnessOf(coreQuery, {
    table: "purchase_orders_v2",
    metaKey: `sync_purchases_${store}`,
  });
  return {
    store, total: num(sum?.c), amount: num(sum?.total), limit, offset, byStatus, rows,
    truncated: num(sum?.c) > rows.length + offset,
    dateScope: from || to ? `วันที่ใบซื้อ ${from ?? "…"} ถึง ${to ?? "…"}` : "ทุกวันที่ (ไม่ได้กรองช่วงวัน)",
    applied: { q: q || null, limit, offset, from, to },
    freshness,
  };
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
  /* มูลค่าคงเหลือ + เคลื่อนไหวล่าสุดต่อคลัง — คัดจากจอ ZORT (API ไม่มี · ดู warehouse-values.mjs)
     🔴 สามสถานะ: ยังไม่เคยคัด = null ต่อแถว · อ่าน D1 พลาด = valuesError + null ทุกแถว · ห้ามเป็น 0 */
  let values = null, valuesError = null;
  try {
    values = await (await import("./warehouse-values.mjs")).warehouseValues();
  } catch (e) {
    valuesError = `อ่านมูลค่าที่คัดจาก ZORT ไม่ได้: ${String(e?.message ?? e).slice(0, 120)}`;
  }
  return {
    count: list.length,
    // ชื่อช่องที่ ZORT ส่งมาจริง (ไม่ส่งค่า — มีที่อยู่คลัง) · เอกสารเขียนแค่ id/name/code/address แต่โค้ดเราอ่าน province ด้วย
    zortFields: [...new Set(list.flatMap((w) => (w && typeof w === "object" ? Object.keys(w) : [])))].sort(),
    valuesError,
    warehouses: list.map((w) => ({
      code: String(w?.code ?? ""),
      name: String(w?.name ?? ""),
      province: String(w?.province ?? ""),
      // ⚠️ ชื่อช่องตามที่จอสาขา (gucut-next app/core/branches) รอไว้แล้ว: stockValue · movedAt
      stockValue: values?.get(String(w?.code ?? ""))?.value ?? null,
      movedAt: values?.get(String(w?.code ?? ""))?.lastMovementAt ?? null,
      valueCollectedAt: values?.get(String(w?.code ?? ""))?.collectedAtUtc ?? null,
      /* 📅 วันไทยของเวลาที่เก็บมูลค่าสต็อก — จอสาขารอช่องนี้อยู่ (ฝั่งจอเตรียมชื่อ `collectedDayTH` ไว้ล่วงหน้า)
         🔑 ท่อรู้ว่าค่าตัวเองเป็น UTC ⇒ ท่อแปลงให้ · จอไม่ต้องเดาเขตเวลา (กติกาเดียวกับ stockDayTH/recipeDayTH)
         ⚠️ อ่านไม่ออก = null ห้ามคืนวันนี้แทน (จอจะคิดว่าข้อมูลสดทั้งที่ไม่รู้) */
      collectedDayTH: thaiDayFromUtc(values?.get(String(w?.code ?? ""))?.collectedAtUtc),
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
/* 🏷️ คอลัมน์ร้าน (source) ของกระจกใบโอน — เพิ่ม 15 ก.ย. 2569 · ใบ t_mu2pfve9
   ที่มา: ?zortdoccounts ยิงจริงพบร้าน z2 มีใบโอน 15,514 ใบ ที่กระจกไม่เคยดึง (ตารางเดิมไม่มีคอลัมน์ร้านเลย)
   · แถวเดิมทั้งหมดได้ 'z1' จาก DEFAULT ทันที ไม่ต้องกวาดย้อนหลัง (ตัวซิงก์เดิมใช้รหัสร้าน z1 ชุดเดียว)
   ⚠️ กลืนได้เฉพาะ "duplicate column" (มีคอลัมน์แล้ว) — error อื่นต้องโยน ห้ามเดินต่อไปเขียนแถวที่ไม่มีช่องร้าน
   ⚠️ resetTransfers ต้องล้างธงนี้ ไม่งั้นตารางที่สร้างใหม่หลัง DROP จะไม่มีคอลัมน์ */
let transfersSourceReady = false;
async function ensureTransfersSource() {
  if (transfersSourceReady) return;
  try {
    await coreQuery(`ALTER TABLE transfers ADD COLUMN source TEXT NOT NULL DEFAULT 'z1'`);
  } catch (e) {
    if (!/duplicate column/i.test(String(e?.message ?? e))) throw e;
  }
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_tf_source ON transfers(source)`);
  transfersSourceReady = true;
}

export async function syncTransfers(days = 90, opt = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const store = opt.store ?? "z1";
  if (store !== "z1" && store !== "z2") return { error: `store ต้องเป็น z1 หรือ z2 (ได้มา "${String(store).slice(0, 20)}")` };
  const h = store === "z1" ? headers() : storeCreds("z2");
  if (!h) return { skip: `ยังไม่ได้ตั้งรหัส ZORT ของร้าน ${store}` };
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
  await ensureTransfersSource();

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
  if (!rows.length) {
    /* 🔑 **นี่คือรอบที่ชีพจรสำคัญที่สุด** — ไปดู ZORT สำเร็จ แต่ไม่มีของใหม่
       ไม่เขียนชีพจรที่นี่ = คืนที่ไม่มีใบโอนเลย จอจะเห็นเวลาเก่าค้างแล้วเตือนว่าซิงก์ตาย (แดงลวง)
       ⚠️ ต่างจากทางที่ `skip`/`error` ด้านบน: ทางนั้น **ห้าม**เขียน เพราะยังไม่ได้ไปดู
          หรือไปดูแล้วล้มเหลว — เขียนเมื่อนั้น = เวลาสดทั้งที่ข้อมูลไม่ได้ถูกอัปเดต (เขียวลวง) */
    await markSync(coreQuery, `sync_transfers_${store}`, "ok");
    return { store, fetched: 0, written: 0, collisions: 0, since, startPage, nextPage: null };
  }

  const prev = new Map(
    (
      await coreQuery(
        `SELECT id, number, kind, from_wh, to_wh, status, transfer_date, reference, note
         FROM transfers WHERE transfer_date >= ${esc(since)} AND source = ${esc(store)}`
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

  /* 🔒 **กันเขียนทับข้ามร้าน** — กุญแจยังเป็น id ของ ZORT ตัวเดียว
      📏 วัด 18 ก.ย. 2569: id เป็นลำดับ **รวมทั้งระบบ** (ไม่ใช่รายร้าน) — สุ่มจากกระจกเราเอง
      transfers 1,000 id/ร้าน: z1 36,784,012–40,522,718 · z2 38,413,717–40,522,471 (ช่วงคาบกันเกือบทั้งช่วง) · ซ้ำข้ามร้าน 0
      purchases ทั้งประชากร (z1 33 · z2 64 ใบ): ช่วงคาบกัน · ซ้ำข้ามร้าน 0
      ⇒ หลักฐานหนุนว่า id ไม่ชนข้ามร้าน แต่ **เป็นตัวอย่าง ไม่ใช่คำรับประกันจาก ZORT** ⇒ ด่านด้านล่างยังต้องอยู่
      ⇒ ถ้า id นี้มีอยู่แล้วเป็นของอีกร้าน **ไม่เขียน** และนับรายงาน (collisions) — ชนจริงเมื่อไหร่ต้องเปลี่ยนกุญแจเป็น (source,id)
      ⚠️ อ่านไม่สำเร็จ = โยน (ไม่ถือว่าไม่ชน) */
  const clash = new Set();
  for (let i = 0; i < changed.length; i += 100) {
    const ids = changed.slice(i, i + 100).map((r) => esc(r.id)).join(",");
    const hit = await coreQuery(`SELECT id FROM transfers WHERE id IN (${ids}) AND source <> ${esc(store)}`);
    for (const x of hit) clash.add(String(x.id));
  }
  const toWrite = changed.filter((r) => !clash.has(r.id));

  for (let i = 0; i < toWrite.length; i += 60) {
    const values = toWrite
      .slice(i, i + 60)
      .map(
        (r) =>
          `(${esc(r.id)},${esc(r.number)},${esc(r.kind)},${esc(r.from)},${esc(r.to)},${esc(r.status)},` +
          `${esc(r.date)},${esc(r.ref)},${esc(r.note)},datetime('now'),${esc(store)})`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO transfers (id,number,kind,from_wh,to_wh,status,transfer_date,reference,note,updated_at,source)
       VALUES ${values}
       ON CONFLICT(id) DO UPDATE SET number=excluded.number, kind=excluded.kind, from_wh=excluded.from_wh,
         to_wh=excluded.to_wh, status=excluded.status, transfer_date=excluded.transfer_date,
         reference=excluded.reference, note=excluded.note, updated_at=excluded.updated_at
       WHERE transfers.source = excluded.source`
    );
  }
  /* ชีพจรรายร้าน — ห้ามใช้คีย์เดียวร่วมสองร้าน ไม่งั้นร้านที่ซิงก์ทีหลังกลบเวลาของร้านแรก
     แล้วจอของร้านที่ค้างจะดูสดตลอดกาล · `nextPage` ไม่ null = **ยังกวาดไม่หมด** จดตามจริง
     ⚠️ ต้อง await · ล้มเหลวไม่ทำให้รอบซิงก์ล้ม */
  await markSync(coreQuery, `sync_transfers_${store}`, nextPage ? "partial" : "ok");
  return {
    store,
    fetched: rows.length,
    written: toWrite.length,
    skipped: rows.length - changed.length,
    collisions: clash.size, // > 0 = id ชนกับอีกร้าน ไม่ได้เขียน ⇒ ต้องเปลี่ยนกุญแจก่อน
    collisionIds: [...clash].slice(0, 20),
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
  transfersSourceReady = false;
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
 *  ✅ **ยิงของจริงแล้ว 18 ก.ย. 2569** — `?transfer=40522718` ⇒ TF-202609004 · status Success
 *     · from NEW · to "" (ใบปรับยอด ไม่ได้โอนออกไปคลังอื่น) · 1 บรรทัด {sku 03505 · qty 57}
 *     ช่องที่ ZORT คืนจริง 22 ช่อง: createdatetime(String) · description · fromWarehouse ·
 *     fromwarehousecode/id · id · list · number · properties · reference · status · tag ·
 *     toWarehouse · towarehousecode/id · transferType · transferdate(String) · uniquenumber · updatedatetime(String)
 *  🔴 **ไม่มีช่องเลขพัสดุเลย** ⇒ คำถามเดิม "มีเลขพัสดุให้จอใช้ไหม" ตอบแล้วว่า **ไม่มี**
 *     `tracking` ที่ท่อส่งออกไปจึงว่างเสมอสำหรับใบโอน — จอห้ามรอค่านี้
 *  ⚠️ ยังคืน `fields` (ชื่อช่องที่เจอจริง) กลับไปด้วยเสมอ **ห้ามลบทิ้ง** — ZORT เพิ่มช่องได้ตลอด
 *     และนี่คือทางเดียวที่จะรู้ว่าวันหนึ่งเขาเพิ่มเลขพัสดุมาให้
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
/** คำตอบตอนหาหัวใบไม่เจอ — **ต้องพารหัสผลของ ZORT ออกมาด้วย**
 * 🔴 บทเรียน 18 ก.ย. 2569 (ฝั่งจอจับได้): เดิมคืนแค่ `error` กับรายชื่อชื่อช่อง
 *    ⇒ ตอนไล่เรื่องคลัง KLD เราแยกไม่ออกว่า "ถูกปฏิเสธสิทธิ์ (resCode 100)"
 *      หรือ "เส้นนี้ครอบแค่คลังหลัก" ทั้งที่ ZORT ส่ง resCode/resDesc มาให้แล้ว
 *    🔑 คลาสเดียวกับ error ที่ถูกตัดจนไม่เหลือสาเหตุ — **ตัวที่ตัดสินใจได้ ห้ามถูกกลืน**
 * ⚠️ `resCode`/`resDesc` เป็น null ได้ = ZORT ไม่ได้ส่งมา ต่างจาก "ส่งมาแต่เป็น 200"
 */
export function noDocHeader(data, label = "ใบ") {
  const d = data ?? {};
  return {
    error: `ZORT ตอบมาแต่หาหัวใบไม่เจอ (${label})`,
    fields: Object.keys(d),
    resCode: d.resCode ?? d.rescode ?? null,
    resDesc: d.resDesc ?? d.resdesc ?? null,
    /* 🔴 **ห้ามตัดสินจาก resCode** — ยิงของจริง 18 ก.ย. 2569 พบว่า ZORT ใช้ `100`
       เป็นรหัสรวมของความผิดพลาดหลายอย่าง: ใบที่มองไม่เห็น · id ไม่มีจริง · id เป็น 0
       **ทั้งสามเคสได้ `100` + "Invalid ID." เหมือนกันเป๊ะ**
       เดิมผมเขียน denied = (resCode === 100) ⇒ id ปลอมก็ขึ้นว่า "ถูกปฏิเสธสิทธิ์"
       = แดงลวง ซึ่งแพงกว่าเขียวลวง เพราะคนลงมือแก้ตาม [[probe-fails-toward-alarm]]
       ⇒ denied จริงต้องมาจากข้อความที่ ZORT บอกว่าปฏิเสธสิทธิ์เท่านั้น */
    denied: /access\s*denied/i.test(String(d.resDesc ?? d.resdesc ?? "")),
    /* ⚠️ "Invalid ID." **แยกไม่ออก**ว่า "ใบไม่มีจริง" หรือ "มีแต่เรามองไม่เห็น"
       ⇒ จอต้องเขียนว่ายังไม่รู้สาเหตุ ห้ามเขียนว่าใบไม่มีอยู่ [[ข้อความปฏิเสธที่แยกสาเหตุไม่ออก]] */
    ambiguousMissing: /invalid\s*id/i.test(String(d.resDesc ?? d.resdesc ?? "")),
  };
}
/** บรรทัดสินค้าในใบ · null = ZORT ไม่ส่งช่องบรรทัดมาเลย (คนละความหมายกับ []) */
export function docLines(doc) {
  const l = Array.isArray(doc?.list) ? doc.list : Array.isArray(doc?.items) ? doc.items : null;
  return l;
}

/* 🔎 ดึงเอกสารรายใบจาก ZORT แยกสามสถานะ (15 ก.ย. 2569 · ใบ t_mu2pekwt ยิงลึกเส้นรายใบ)
   เดิมทั้งสามเส้น (ใบโอน · ใบคืน · ใบเสนอราคา) เขียน `res?.ok ? json : null` แล้วตอบข้อความเดียว "ดึง…จาก ZORT ไม่ได้"
   ⇒ id ที่ไม่มีจริง (999999999999) · ค่าขยะ (abc) · เน็ตล่ม **ได้ข้อความเดียวกัน** — คนหน้าคลังแยกไม่ออกว่าพิมพ์เลขผิดหรือระบบพัง
   ⇒ แยก: id ไม่ใช่ตัวเลข = ไม่ยิง ZORT · ติดต่อ ZORT ไม่ได้ = unknown · ZORT ตอบไม่ใช่ 200 = บอกสถานะ/resCode ของ ZORT ตรง ๆ
   ⚠️ **ไม่แปลงเป็น "ไม่พบใบ" เอง** — ยังไม่เคยเห็นว่า ZORT ตอบรูปไหนเมื่อไม่มีใบ ⇒ ส่งของ ZORT ออกไปให้เห็น ไม่เดา */
async function zortDetailFetch(path, key, label) {
  const h = headers();
  if (!h) return { error: "ยังไม่ได้ตั้งรหัส ZORT" };
  if (!/^\d{1,20}$/.test(key)) return { error: `id ของ${label}ต้องเป็นตัวเลขของ ZORT (ได้มา "${key.slice(0, 30)}")`, badId: true };
  let res;
  try {
    res = await fetch(`${BASE}/${path}?id=${key}`, { headers: h, signal: AbortSignal.timeout(15000) });
  } catch {
    return { error: `ติดต่อ ZORT ไม่ได้ (เครือข่าย/หมดเวลา) — ยังไม่รู้ว่ามี${label}นี้หรือไม่`, unknown: true };
  }
  if (!res?.ok) {
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    const code = body?.res?.resCode ?? body?.resCode ?? null;
    const desc = String(body?.res?.resDesc ?? body?.resDesc ?? "").slice(0, 120);
    return {
      error: `ZORT ไม่ส่ง${label}ให้ (HTTP ${res?.status}${code !== null ? ` · resCode ${code}` : ""}${desc ? ` · ${desc}` : ""}) — id ${key}`,
      zortStatus: res?.status ?? null,
      zortCode: code,
      zortDesc: desc || null,
    };
  }
  const data = await res.json().catch(() => null);
  if (!data) return { error: `ZORT ตอบ${label}มาในรูปที่อ่านไม่ได้`, unknown: true };
  return { data };
}

export async function getTransferDetail(id) {
  const h = headers();
  if (!h) return { error: "ยังไม่ได้ตั้งรหัส ZORT" };
  const key = String(id ?? "").trim();
  if (!key) return { error: "ต้องระบุเลขใบโอน" };
  const got = await zortDetailFetch("Transfer/GetTransferDetail", key, "ใบโอน");
  if (got.error) return got;
  const data = got.data;
  /* ⚠️ ZORT วางตัวใบไว้คนละที่แล้วแต่เส้น — ลองทุกรูปที่เคยเจอในโปรเจกต์นี้
      หาไม่เจอ = **บอกว่าหาไม่เจอ** ห้ามคืนใบว่างที่หน้าตาเหมือน "ใบนี้ไม่มีของ" */
  const t = pickDocHeader(data);
  if (!t) {
    return noDocHeader(data, "ใบโอน");
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
  await ensureTransfersSource();
  // ร้าน: ผู้เรียกตรวจค่าแล้ว (parseSingleStore) · ไม่ส่งมา = z1 เหมือนก่อนมีคอลัมน์ร้าน (จอเดิมได้เลขเท่าเดิม)
  const store = o.store === "z2" ? "z2" : "z1";
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));
  const q = String(o.q ?? "").trim().slice(0, 60);
  /* 🔎 ตัวกรองสถานะ + ช่วงวัน — ฝั่งจอขอ 18 ก.ย. 2569 พร้อมหลักฐานว่าของเดิม **เมินเงียบ**
     (ยิง from/to/days/page/status แล้ว total เท่าเดิม 12,005 ทุกครั้ง · applied เป็น null)
     🔴 เหตุผลที่ status มาก่อน from/to: `byStatus` บอกว่ามีใบยกเลิก 28 ใบ
        แต่จอไม่มีทางหาเจอ เพราะกระจายอยู่ใน 241 หน้า ⇒ ตัวเลขที่เห็นแต่แตะไม่ได้
     ⚠️ **ค่าที่รับคือค่าที่อยู่ในตารางจริง** (Success · Voided · Pending) ไม่ใช่คำไทยบนจอ ZORT
        ⇒ ประกาศไว้ใน `supportedFilters.status` ให้จอไม่ต้องเดา
        ค่าที่ไม่รู้จัก **ตีกลับ 400 ห้ามเมินเงียบ** — เมินแล้วจอจะโชว์ทั้ง 12,005 ใบ
        ทั้งที่คนกดหวังผลกรอง ซึ่งอ่านได้ว่า "ไม่มีใบไหนถูกกรองออก" (ปุ่มหลอก)
     ⚠️ เทียบวันด้วย `transfer_date` ซึ่งเป็น **วันที่เอกสาร** ไม่ใช่วันเคลื่อนสต็อก
        (จอ ZORT มี fromstockdate/tostockdate แยกอีกคู่ — กระจกเราไม่มีช่องนั้น ห้ามอ้างว่ารองรับ) */
  const สถานะที่มีจริง = ["Success", "Voided", "Pending"];
  const status = String(o.status ?? "").trim();
  if (status && !สถานะที่มีจริง.includes(status)) {
    return { error: `ไม่รู้จักสถานะ "${status}"`, supportedStatus: สถานะที่มีจริง };
  }
  const วัน = (v) => { const t = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; };
  const from = วัน(o.from), to = วัน(o.to);
  if ((o.from && !from) || (o.to && !to)) {
    return { error: "from/to ต้องเป็นรูปแบบ yyyy-MM-dd", got: { from: o.from ?? null, to: o.to ?? null } };
  }
  const filter = `AND source = ${esc(store)}`
    + (q ? ` AND (${containsLit("number", esc(q))} OR ${containsLit("reference", esc(q))})` : "")
    + (from ? ` AND date(transfer_date) >= date(${esc(from)})` : "")
    + (to ? ` AND date(transfer_date) <= date(${esc(to)})` : "");
  /* ⚠️ `filter` ใช้กับ **ทั้งตัวนับแท็บและแถว** ⇒ ตัวกรองสถานะต้องแยกออกมา
      ไม่งั้นแท็บจะนับแต่สถานะที่เลือกอยู่ แล้วแท็บอื่นขึ้น 0 ทั้งที่มีของ
      (กติกาเดียวกับทุกจอ: ตัวนับแท็บต้องนับข้ามตัวกรองสถานะเสมอ) */
  const filterแถว = filter + (status ? ` AND status = ${esc(status)}` : "");
  /* ⚠️ **ยิงพร้อมกัน ห้ามเรียงกัน** (แก้ 5 ก.ย. 2569) — สามตัวนี้ไม่มีตัวไหนต้องรอกัน
      ⚠️ CREATE TABLE ข้างบนยังต้องอยู่ก่อนและ await จริง ๆ — ห้ามย้ายลงมาในนี้
         สามตัวนี้อ่านตารางนั้น ถ้ายังไม่ถูกสร้างจะล้มทั้งชุด */
  const [sumRows, byStatus, byKind, rows] = await Promise.all([
    coreQuery(
      `SELECT COUNT(*) AS c, MIN(transfer_date) AS oldest FROM transfers WHERE 1=1 ${filterแถว}`
    ),
    // แท็บสถานะ — นับข้ามตัวกรองสถานะเสมอ (กติกาเดียวกับทุกจอ)
    coreQuery(
      `SELECT status, COUNT(*) AS c FROM transfers WHERE 1=1 ${filter} GROUP BY status ORDER BY c DESC`
    ),
    // ยอดแยกชนิดใบ — ใช้เทียบกับ ?zortlist=transfers&type= ทีละชนิด (ใบ t_mu1bh5cl · 14 ก.ย. 2569)
    coreQuery(
      `SELECT kind, COUNT(*) AS c FROM transfers WHERE 1=1 ${filter} GROUP BY kind ORDER BY c DESC`
    ),
    coreQuery(
      `SELECT id, number, kind, from_wh, to_wh, status, transfer_date, reference, note
       FROM transfers WHERE 1=1 ${filterแถว}
       ORDER BY transfer_date DESC, number DESC LIMIT ${limit} OFFSET ${offset}`
    ),
  ]);
  const sum = sumRows[0];
  /* 🕘 ให้จอแคชตัวนับแท็บได้ — เทียบ changedAtUtc ไม่ใช่นับนาที (ดู core-freshness.mjs) */
  const freshness = await freshnessOf(coreQuery, {
    table: "transfers",
    metaKey: `sync_transfers_${store}`,
  });
  return {
    store,
    total: num(sum?.c),
    oldest: sum?.oldest || null,
    freshness,
    limit,
    offset,
    /* 🤝 สัญญากับจอ: บอกว่า **ใช้ค่าอะไรไปจริง** ไม่ใช่แค่รับมา
        ⚠️ ของเดิมไม่มีคีย์นี้เลย ⇒ จอส่งตัวกรองไปแล้วท่อเมิน โดยไม่มีอะไรฟ้อง
           ฝั่งจอเป็นคนจับได้ด้วยการยิงเทียบ total (เท่าเดิมทุกครั้ง) */
    applied: { q: q || null, store, status: status || null, from, to },
    ignored: { days: o.days ?? null, page: o.page ?? null },
    supportedFilters: ["q", "store", "status", "from", "to", "limit", "offset"],
    supportedStatus: สถานะที่มีจริง,
    "⚠️ ขอบเขตตัวกรอง":
      "status/from/to กรองที่กระจก ไม่ได้ยิง ZORT ใหม่ · from/to เทียบกับ transfer_date (วันที่เอกสาร) " +
      "ไม่ใช่วันเคลื่อนสต็อก — จอ ZORT มี fromstockdate/tostockdate แยกอีกคู่ ซึ่งกระจกนี้ไม่มีข้อมูลนั้น · " +
      "byStatus/byKind นับข้ามตัวกรองสถานะเสมอ (แท็บต้องเห็นของทุกกอง) แต่นับตาม q/from/to ที่ใช้อยู่",
    byStatus,
    byKind,
    /* ⚠️ จอต้องบอกว่ากระจก = สิ่งที่ API ส่งออกมา ไม่ใช่ทั้งหมดที่จอ ZORT นับ
       📏 **วัดครบแล้ว 14 ก.ย. 2569 22:22–22:27 (ใบ t_mu1bh5cl) — แทนสมมติฐานเดิมทั้งหมด**
          · กวาด GetTransfers ไม่ระบุชนิดครบ 61 หน้า = 12,003 = กระจก 12,003 (written 0)
          · ยอดต่อชนิดจาก API (?zortlist=transfers&type=) = กระจกทุกชนิด:
            Initial 6,851 · Adjust 5,124 · Transfer 28 · Assembly/Disassembly/Reserve 0
          · GetTransferDetail?id= ได้บรรทัดสินค้าทุกชนิด (รวม Adjust)
       ❌ สมมติฐานเดิมที่ตกไป: "ใบปรับดึงด้วย API ไม่ได้" · "ส่วนต่างมาจากขอบช่วงวัน" · "ส่วนต่างเป็นชนิดที่กระจกไม่เห็น"
       ✅ **18 ก.ย. 2569 รู้แล้วว่าใบไหนหาย — แต่ "ทำไม" ยังไม่ยืนยัน (แก้ถ้อยคำเย็นวันเดียวกัน)**
          เดิมบรรทัดนี้เขียนว่า "เราไม่มีสิทธิ์เห็น" ซึ่ง **แข็งเกินหลักฐาน** และข้อความนั้นไปโผล่บนจอ
          ยิงของจริงแล้วพบว่า: ใบ KLD ที่รู้ว่ามีจริง → resCode 100 + **"Invalid ID."**
          ส่วน `GetProducts&warehousecode=KLD` → resCode 100 + "Access Denied." (คนละข้อความ)
          และ **id ที่ไม่มีอยู่จริงเลยก็ได้ "Invalid ID." เหมือนกันเป๊ะ** ⇒ ข้อความแยกสาเหตุไม่ออก
          ตรวจฝั่งตั้งค่า ZORT แล้ว: บทบาท Admin ตั้งคลังเป็น "ทั้งหมด" · คีย์ API อยู่ระดับร้าน
          ⇒ ฝั่งหน้าเว็บเปิดให้มากกว่านี้ไม่ได้ ⇒ เหลือทางเดียวคือถาม ZORT ว่าเส้น API ครอบคลังสาขาไหม
          🔑 บทเรียน: **เขียนได้แค่ "เข้าถึงไม่ได้" ห้ามเขียน "ไม่มีสิทธิ์"** — อย่างแรกวัดได้ อย่างหลังเป็นการเดาสาเหตุ
          อ่านจอ `/Warehouse/Transferlist` วันเดียวกับที่ยิง API แล้วกรองทีละแกน (อ่านอย่างเดียว):
            · ทั้งหมด 12,199 · กระจก 12,005 ⇒ ต่าง 194
            · แยกสถานะ: รอโอน 2 = 2 · ยกเลิก 28 = 28 · **สำเร็จ 12,169 vs 11,975** ⇒ ส่วนต่างอยู่ในกองสำเร็จล้วน
            · ชนิด ประกอบสินค้า/แยกส่วนสินค้า = **0 ใบ** (ตกไป) · ใบเก่ากว่าวันแรกของกระจก = **0 ใบ** (ตกไป)
            · 🔑 **กรองด้วยชื่อคลัง: "โกดัง" = 12,005 ตรงกับกระจกเป๊ะทุกหลัก** · KLD 155 · ANJ 67
              (155+67 ซ้อนกัน 28 ใบ เพราะใบโอนมีทั้งคลังต้นทาง/ปลายทาง)
          ⇒ **กระจก = ใบโอนของคลัง "โกดัง" ล้วน ๆ** · 194 ใบที่หาย = ใบที่แตะ **KLD/ANJ**
             ซึ่งเป็นสองคลังที่ผู้ใช้ API ของเราถูกกั้นสิทธิ์อยู่ (resCode 100 "Access Denied" — เรื่องเดียวกับจำนวนสินค้ารายคลัง)
          🚫 **ห้ามเขียนว่า "แก้ได้ด้วยการให้สิทธิ์"** — ท่านประธานเปิดสิทธิ์คลังให้แล้ว 18 ก.ย. 2569
             แล้ว **ยิงยืนยันว่าไม่มีผล** (12,005 เท่าเดิมทุกหลัก) ⇒ คำแนะนำนั้นถูกพิสูจน์แล้วว่าไม่ใช่ทางแก้
             และไม่ใช่เรื่องที่แก้ที่ตัวซิงก์ได้ด้วย */
    note: "กระจก = ใบโอนของคลัง 'โกดัง' เท่านั้น — วัด 18 ก.ย. 2569: จอ ZORT กรองคลังโกดังได้ 12,005 ตรงกับกระจกเป๊ะ · " +
      "ส่วนที่จอนับมากกว่า (194 ใบ) คือใบที่แตะคลัง KLD/ANJ ซึ่ง **API ของเราเข้าถึงไม่ได้** ⇒ ไม่ใช่ 'API ไม่ส่ง' และไม่ใช่ข้อมูลหายจากฝั่งเรา · " +
      "⚠️ **สาเหตุยังไม่ยืนยัน** — ยิงใบ KLD ที่รู้ว่ามีจริง (TF-202608070) ได้ resCode 100 แต่ข้อความคือ 'Invalid ID.' ไม่ใช่ 'Access Denied.' " +
      "และ id ที่ไม่มีอยู่จริงก็ได้ข้อความเดียวกันเป๊ะ ⇒ แยกไม่ออกว่าเป็นเรื่องสิทธิ์หรือเส้น API ครอบแค่คลังหลัก",
    rows,
  };
}

/** ใบเสนอราคา — จอ "รายการขาย → ใบเสนอราคา" ของ ZORT
 *  ⚠️ ร้านมีแค่ 3 ใบ (ไม่ค่อยได้ใช้) — ดึงสดทุกครั้ง ไม่ต้องทำกระจก
 *     ทำกระจกให้ของที่มี 3 แถวคือเพิ่มที่ให้ข้อมูลไม่ตรงกันได้เปล่า ๆ */
/** @param opts.type ตัวกรองที่ **เส้นนี้ไม่รองรับ** — รับไว้เพื่อ "สะท้อนกลับว่าเมิน" ไม่ใช่เพื่อกรอง
 *  🔴 ฝั่งจอจับได้ 18 ก.ย. 2569 ด้วยการยิงค่ามั่ว: ส่ง `type` ไปแล้วได้แถวชุดเดิมทั้งชุด
 *     และเส้นนี้ **ไม่เคยอ่าน `type` เลยตั้งแต่ต้น** ⇒ ตัวกรองหลอกแบบเงียบสนิท
 *  ⚠️ ไม่ตีกลับเป็น error เพราะจอส่งมาอยู่แล้ว (ตีกลับ = จอพังทันที)
 *     ⇒ ใช้ท่า `ignored` แบบเดียวกับเส้นขนส่ง: ทำงานต่อได้ แต่ **ประกาศตัวว่าเมินค่านั้น**
 *  ⚠️ ZORT ส่งมาแค่ status (Voided/Approved/...) ไม่มีช่อง "ชนิดใบ" ⇒ จอควรกรองด้วย status แทน
 *     จะทำตัวกรองจริงต้องรู้ก่อนว่า "ชนิด" ที่จอต้องการหมายถึงอะไรในข้อมูลของ ZORT */
export async function listQuotations(limit = 50, page = 1, store = "z1", opts = {}) {
  // ใบเสนอราคาไม่มีกระจก — แยกร้านด้วยรหัส ZORT ของร้านนั้น (15 ก.ย. 2569 · ใบ t_mu2pfve9)
  const h = store === "z2" ? storeCreds("z2") : headers();
  if (!h) return { error: `ยังไม่ได้ตั้งรหัส ZORT ของร้าน ${store}` };
  const n = Math.max(1, Math.min(200, num(limit) || 50));
  /* 🔴 **ต้องส่ง page ต่อให้ ZORT** (แก้ 15 ก.ย. 2569 · คลาสเดียวกับ returnorders t_mtzx0wp4)
      เดิมส่งแค่ limit ⇒ ได้แค่ limit ใบล่าสุดเสมอ · จอไล่ offset= แล้วได้ก้อนเดิมซ้ำ
      (ฝั่งจอเจอตอนทำด่าน "หน้าไม่ขยับ" ใบ t_mu2mc4jj) · วันนี้มี 6 ใบยังไม่ออกอาการ แต่โตข้าม limit เมื่อไหร่ Export ขาดเงียบ */
  const p = Math.max(1, Math.min(50, num(page) || 1));
  const res = await fetch(`${BASE}/Quotation/GetQuotations?limit=${n}&page=${p}`, {
    headers: h,
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const list = Array.isArray(data?.list) ? data.list : null;
  if (!list) return { error: "ดึงใบเสนอราคาจาก ZORT ไม่ได้" };
  const typeRaw = String(opts.type ?? "").trim().slice(0, 20);
  /* 🔍 `q` ก็ไม่รองรับเหมือน type — พิสูจน์ด้วยการยิงของจริง 18 ก.ย. 2569:
      ยิงเปล่าได้ 6 ใบ · ยิงพร้อมคำค้นที่ไม่มีอยู่จริงก็ยังได้ 6 ใบ ⇒ ถูกเมินเงียบ ๆ
      วันนี้ยังไม่มีใครเจ็บ เพราะจอใบเสนอราคาดึงทั้งชุด 6 ใบมากรองในเบราว์เซอร์เอง (ฝั่งจอยืนยัน)
      ⚠️ แต่ต้องประกาศไว้ตั้งแต่ตอนนี้ เพราะวันที่ใบเสนอราคาเกิน 200 ใบ จอจะต้องย้ายมากรองที่ท่อ
        ถ้าตอนนั้นท่อยังเมินเงียบ ๆ จะกลายเป็นช่องค้นหาที่คืนทั้งชุดโดยไม่มีอะไรฟ้อง
      🔑 ประกาศว่าเมิน ≠ รองรับ — จอต้องเช็ค ignored ก่อนเขียนว่า "กรองแล้ว" */
  const qRaw = String(opts.q ?? "").trim().slice(0, 60);
  return {
    store,
    total: num(data?.count),
    live: true, // ดึงสดจาก ZORT ไม่ใช่กระจก — จอเขียนบอกได้ว่าเป็นข้อมูลสด
    /* 🔎 ตัวกรองที่เส้นนี้อ่านจริงมีแค่นี้ — ส่งไปให้จอตรวจเองได้ว่าที่ส่งไปถูกใช้ไหม */
    supportedFilters: ["limit", "page", "store"],
    ...(typeRaw || qRaw ? {
      ignored: { ...(typeRaw ? { type: typeRaw } : {}), ...(qRaw ? { q: qRaw } : {}) },
      ignoredNote:
        (typeRaw
          ? `ไม่รองรับตัวกรอง type (ได้ "${typeRaw}") — ZORT ส่งมาแค่ status ⇒ ถ้าจอต้องการแยกชนิด ให้กรองด้วย status ที่จอ หรือบอกก่อนว่า "ชนิด" หมายถึงอะไร · `
          : "") +
        (qRaw
          ? `ไม่รองรับคำค้น q (ได้ "${qRaw}") — พิสูจน์ด้วยการยิงจริง 18 ก.ย. 2569: ยิงเปล่าได้เท่ากับยิงพร้อมคำที่ไม่มีอยู่จริง · `
          : "") +
        "⚠️ **แถวที่ได้คือทั้งชุด ไม่ได้ถูกกรอง** — จอต้องกรองเองและห้ามเขียนว่า 'กรองแล้ว'",
    } : {}),
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
/* 🔴 รายงานยอดซื้อไม่นับใบซื้อที่ยกเลิก — ตาม ZORT (15 ก.ย. 2569)
   หลักฐาน (คุณส้มอ่านจอ ZORT /Dashboard/BuyReport อ่านอย่างเดียว): ช่วงตั้งต้นย้อนหลัง 3 เดือน จอขึ้น "ไม่มียอดซื้อ"
   ขณะที่กระจกช่วงนั้นมีใบเดียวคือ PO-202609001 (Voided ฿1) ⇒ ZORT ไม่นับใบยกเลิก แต่ list=purchaseitems ของเรานับ
   ⚠️ ขอบเขตหลักฐาน: ยังไม่เคยเห็นช่วงที่มีใบยกเลิกปนใบสำเร็จบนจอ ZORT (เปลี่ยนช่วงต้องกด) — กติกาคำเดียวกับบัตรสต็อก
   ⚠️ ใช้กับ "รายงาน" เท่านั้น — จอรายการซื้อ (list=purchases) ยังโชว์ใบยกเลิก เพราะ ZORT มีแท็บสถานะที่รวมใบยกเลิก */
const PO_NOT_CANCELLED =
  "COALESCE(po.status,'') NOT LIKE '%cancel%' AND COALESCE(po.status,'') NOT LIKE '%void%' AND COALESCE(po.status,'') NOT LIKE '%ยกเลิก%'";

/* 🧾 BY_GROUPS — จัดกลุ่มรายงานยอดซื้อแบบ ZORT (tableoption: สินค้า · หมวดหมู่ · ผู้ติดต่อ · ผู้ใช้งาน · คลัง/สาขา)
   ⚠️ "ผู้ใช้งาน" (ผู้สร้างใบซื้อ) ไม่มีในกระจก purchase_orders_v2 ⇒ ตอบ 400 พร้อมเหตุผล ห้ามแกล้งจัดกลุ่มเป็นก้อนเดียว */
export const PURCHASE_BY = {
  sku: null,
  category: "COALESCE(NULLIF(p.category,''),'(ยังไม่ได้จัดหมวดใน ZORT)')",
  vendor: "COALESCE(NULLIF(po.vendor,''),'(ไม่ระบุผู้ติดต่อ)')",
  warehouse: "COALESCE(NULLIF(po.warehouse,''),'(ไม่ระบุคลัง)')",
};
export function purchaseByError(by) {
  const v = String(by ?? "").trim();
  if (!v || v in PURCHASE_BY) return null;
  if (v === "user") return "by=user ยังทำไม่ได้ — กระจกใบซื้อไม่ได้เก็บผู้สร้างใบ (ZORT มี แต่ท่อยังไม่ดึง)";
  return `by รับแค่ ${Object.keys(PURCHASE_BY).join(" · ")} (ได้มา "${v.slice(0, 20)}")`;
}

export async function listPurchaseItems(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await ensureTables();
  const store = o.store === "z2" ? "z2" : "z1";
  const notSynced = await purchasesSyncedError(store);
  if (notSynced) return { store, error: notSynced };
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));
  const q = String(o.q ?? "").trim().slice(0, 60);
  /* 📅 from/to = วันที่ใบซื้อ (po_date) — เพิ่ม 16 ก.ย. 2569
     🔴 เดิมไม่มีตัวกรองวันเลย ⇒ จอยอดซื้อ (เมนู 3) มีปุ่มช่วงเวลา 8 ค่า แต่ตารางรายสินค้าเป็น "ทั้งหมดตลอดกาล" เสมอ โดยไม่มีอะไรบอก
     ⚠️ ตรวจรูปวันจริงที่ param-guard แล้ว (DATE_LISTS) · ใบซื้อที่ไม่มีวันที่ ไม่เข้าเงื่อนไขช่วงวัน */
  const from = isRealDay(o.from) ? o.from : null;
  const to = isRealDay(o.to) ? o.to : null;
  const by = String(o.by ?? "").trim() || "sku";
  const byErr = purchaseByError(by);
  if (byErr) return { store, error: byErr };
  const dateSql = `${from ? ` AND po.po_date >= ${esc(from)}` : ""}${to ? ` AND po.po_date <= ${esc(to)}` : ""}`;
  const qSql = q ? ` AND (${containsLit("i.sku", esc(q))} OR ${containsLit("i.name", esc(q))})` : "";
  // ⚠️ บรรทัดสรุป กับ แถว ต้องใช้เงื่อนไขชุดเดียวกันเสมอ (บทเรียน 4 ก.ย. — สรุปถูก ตารางไม่ครบ)
  const where = `i.source = ${esc(store)} AND ${PO_NOT_CANCELLED}${dateSql}${qSql}`;
  const groupExpr = PURCHASE_BY[by];
  const joinProducts = by === "category" ? "LEFT JOIN products p ON p.sku = i.sku" : "";
  const [sum] = await coreQuery(
    `SELECT COUNT(DISTINCT i.sku) AS skus, COUNT(*) AS lines,
            ROUND(COALESCE(SUM(i.qty * i.price),0),2) AS amount
            ${groupExpr ? `, COUNT(DISTINCT ${groupExpr}) AS groups` : ""}
     FROM purchase_order_items_v2 i
     LEFT JOIN purchase_orders_v2 po ON po.id = i.po_id
     ${joinProducts}
     WHERE ${where}`
  );
  // รวมรายสินค้า — แบบเดียวกับที่ ZORT แสดงในรายงานยอดซื้อ · by อื่นรวมตามกลุ่ม
  const rows = groupExpr
    ? await coreQuery(
        `SELECT ${groupExpr} AS groupKey,
                SUM(i.qty) AS qty, ROUND(SUM(i.qty * i.price),2) AS amount,
                COUNT(DISTINCT i.po_id) AS orders, COUNT(DISTINCT i.sku) AS skus,
                MAX(po.po_date) AS lastDate
         FROM purchase_order_items_v2 i
         LEFT JOIN purchase_orders_v2 po ON po.id = i.po_id
         ${joinProducts}
         WHERE ${where}
         GROUP BY 1 ORDER BY SUM(i.qty * i.price) DESC LIMIT ${limit} OFFSET ${offset}`
      )
    : await coreQuery(
        `SELECT i.sku AS sku, MAX(i.name) AS name,
                SUM(i.qty) AS qty, ROUND(SUM(i.qty * i.price),2) AS amount,
                COUNT(DISTINCT i.po_id) AS orders,
                MAX(po.po_date) AS lastDate
         FROM purchase_order_items_v2 i
         LEFT JOIN purchase_orders_v2 po ON po.id = i.po_id
         WHERE ${where}
         GROUP BY i.sku ORDER BY SUM(i.qty * i.price) DESC LIMIT ${limit} OFFSET ${offset}`
      );
  /* ⚠️ **บรรทัดสรุปที่ถูก + ตารางที่ไม่ครบ = อันตรายกว่าตัวเลขผิดตรง ๆ**
      (ฝั่งจอเจอตอนยิงจริง 4 ก.ย. 2569) — จอเขียนสรุป '217 รหัส ฿6,225,166'
      ซึ่งถูก เพราะเป็นเลขรวมจากท่อ **แต่ตารางมีแค่ 200 แถว ขาด 17 รหัส**
      และคอลัมน์ % คิดจากผลรวมของ 200 แถวที่แสดง ไม่ใช่ยอดในบรรทัดสรุป
      ⇒ คนละฐานกันเงียบ ๆ · ไม่มีอะไรดูขัดตาเลย
      ⇒ ส่ง total · shown · truncated · applied ไปด้วยเสมอ **ห้ามตัดเงียบ** */
  const shown = rows.length;
  const total = groupExpr ? num(sum?.groups) : num(sum?.skus);
  return {
    skus: num(sum?.skus),
    lines: num(sum?.lines),
    amount: num(sum?.amount),
    total, // จำนวนแถวทั้งหมดของการจัดกลุ่มนี้ (รหัส หรือ กลุ่ม)
    shown,
    truncated: total > shown + offset,
    store,
    by,
    excludesCancelled: true, // รวมเฉพาะใบซื้อที่ไม่ได้ยกเลิก (ตาม ZORT)
    dateScope: from || to ? `วันที่ใบซื้อ ${from ?? "…"} ถึง ${to ?? "…"}` : "ทุกวันที่ (ไม่ได้กรองช่วงวัน)",
    applied: { q: q || null, limit, offset, from, to, by },
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
  const got = await zortDetailFetch("Quotation/GetQuotationDetail", key, "ใบเสนอราคา");
  if (got.error) return got;
  const data = got.data;
  /* ⚠️ **โหมดดูของดิบ — สำหรับไล่ปัญหาเท่านั้น ห้ามให้จอเรียกประจำ**
      ทำเพิ่ม 6 ก.ย. 2569 เพราะตัวย่อด้านล่างหยิบ `list[0]` มาแสดง
      แล้ว `list[0]` ของเส้นนี้คือ **บรรทัดสินค้า ไม่ใช่หัวใบ** ⇒ ที่เห็นว่าเป็น "ใบ" มาตลอด
      จริง ๆ คือบรรทัดเดียว และ `number: "1"` ที่นึกว่าเลขที่ใบ คือ **จำนวนชิ้น**
      ⇒ ตัวย่อที่ตีความให้เรียบร้อยแล้ว **ปิดบังโครงสร้างจริง** จนไล่ปัญหาต่อไม่ได้
      ⚠️ ห้าม log และห้ามส่งเข้า Telegram — มีชื่อ/เบอร์ลูกค้าในใบจริง */
  if (raw) return { live: true, raw: data };
  const q = pickDocHeader(data);
  if (!q) return noDocHeader(data, "ใบเสนอราคา");
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
/* 🔴 **`number` เป็นกุญแจไม่ได้ — เลขที่ใบคืนของ ZORT ซ้ำกันได้จริง** (พิสูจน์ 15 ก.ย. 2569 01:3x)
    ดึงสดครบ 4 หน้า: 689 แถว · id ไม่ซ้ำ 689 · **number ไม่ซ้ำแค่ 537**
    เช่น CN-583608391639402476 มี 2 ใบ (id 284950384 · 284947796 · 20 และ 25 เม.ย.) = ออเดอร์เดียวคืนหลายครั้ง
    ⇒ ตารางเดิม return_orders (PRIMARY KEY number) **เขียนทับกันหาย 152 ใบ** แบบเงียบ
       คอมเมนต์เดิมเขียนว่า "เลขใบคืนของ ZORT ไม่ซ้ำ" โดยไม่เคยพิสูจน์ (คลาสเดียวกับใบโอน 546 เลขซ้ำ)
    ⇒ ย้ายไป return_orders_v2 กุญแจ id · **ไม่ลบตารางเดิม** (เลิกใช้ ไม่มีจุดไหนอ่านแล้ว) */
let returnTableReady = false;
async function ensureReturnTable() {
  if (returnTableReady) return;
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS return_orders_v2 (
       id TEXT PRIMARY KEY, number TEXT, reference TEXT, customer TEXT,
       amount REAL NOT NULL DEFAULT 0, status TEXT, warehouse TEXT,
       return_date TEXT, paid TEXT, updated_at TEXT)`
  );
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_ret2_date ON return_orders_v2(return_date)`);
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_ret2_ref ON return_orders_v2(reference)`);
  /* 🏷️ คอลัมน์ร้าน (15 ก.ย. 2569 · ใบ t_mu2pfve9) — ท่าเดียวกับกระจกใบโอน (gucut-web 7351c3c ยิงจริงชน 0)
     แถวเดิมได้ 'z1' จาก DEFAULT · กลืนได้แค่ "duplicate column" */
  try {
    await coreQuery(`ALTER TABLE return_orders_v2 ADD COLUMN source TEXT NOT NULL DEFAULT 'z1'`);
  } catch (e) {
    if (!/duplicate column/i.test(String(e?.message ?? e))) throw e;
  }
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_ret2_source ON return_orders_v2(source)`);
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
  const store = opt.store ?? "z1";
  if (store !== "z1" && store !== "z2") return { error: `store ต้องเป็น z1 หรือ z2 (ได้มา "${String(store).slice(0, 20)}")` };
  const h = store === "z1" ? headers() : storeCreds("z2");
  if (!h) return { skip: `ยังไม่ได้ตั้งรหัส ZORT ของร้าน ${store}` };
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

  /* กันซ้ำข้ามหน้าด้วย **id** — ห้ามใช้ number (ซ้ำได้จริง ดูหัวตาราง) */
  const seen = new Set();
  const uniq = [];
  let missingId = 0;
  for (const r of rows) {
    const idTxt = String(r?.id ?? "").trim();
    if (!idTxt) { missingId += 1; continue; }
    if (seen.has(idTxt)) continue;
    seen.add(idTxt);
    uniq.push(r);
  }

  /* อ่านของเดิมมาเทียบก่อนเขียน — การอ่านถูกกว่าการเขียนมากบน D1 */
  /* 🔒 อ่านของเดิมไม่สำเร็จ ⇒ throw (ไม่ถือว่ากระจกว่าง) — เขียนซ้ำทั้งหมดไม่เสียข้อมูล แต่กินโควตาและชนเพดานเวลา */
  const prevRows = await coreQuery(
    `SELECT id, number, reference, customer, amount, status, warehouse, return_date, paid FROM return_orders_v2 WHERE source = ${esc(store)}`
  );
  const prev = new Map(prevRows.map((r) => [String(r.id), r]));

  let skipped = 0;
  const changedRows = [];
  for (const r of uniq) {
    const row = {
      id: String(r?.id ?? ""),
      number: String(r?.number ?? ""),
      reference: String(r?.reference ?? ""),
      customer: String(r?.customername ?? ""),
      amount: num(r?.amount),
      status: String(r?.status ?? ""),
      /* 🔴 **บั๊กเงียบ: `warehousename` ไม่มีอยู่จริงในคำตอบของ ZORT** (แก้ 9 ก.ย. 2569)
          ยิงของจริงแล้วช่องที่มีคือ `warehousecode` (เช่น "NEW") กับ `warehouseid`
          ⇒ ช่องคลังในจอ **ว่างเปล่ามาตลอด** และไม่มีอะไรฟ้อง เพราะ `?? ""` กลืนให้เรียบร้อย
          ⚠️ คลาสเดียวกับ id ที่ขาด: **เดาชื่อช่องแล้วมีค่าสำรอง = ผิดแบบเงียบสนิท**
             เจอเพราะยิงของจริงมาดูรายชื่อช่องเท่านั้น ไม่มีทางเห็นจากการอ่านโค้ด */
      warehouse: String(r?.warehousecode ?? ""),
      warehouseId: String(r?.warehouseid ?? ""),
      /* บรรทัดสินค้าติดมากับรายการอยู่แล้ว — จอไม่ต้องยิงรายใบถ้าแค่อยากรู้ว่าคืนอะไร
         ⚠️ ส่งเป็นจำนวนบรรทัด ไม่ใช่ตัวบรรทัด เพื่อไม่ให้คำตอบบวมตอนขอ 200 ใบ */
      lineCount: Array.isArray(r?.list) ? r.list.length : null,
      return_date: String(r?.returnorderdateString ?? r?.returnorderdate ?? "").slice(0, 10),
      paid: String(r?.paymentstatus ?? r?.paymentStatus ?? ""),
    };
    const old = prev.get(row.id);
    const same =
      old &&
      String(old.number ?? "") === row.number &&
      String(old.reference ?? "") === row.reference &&
      String(old.customer ?? "") === row.customer &&
      num(old.amount) === row.amount &&
      String(old.status ?? "") === row.status &&
      String(old.warehouse ?? "") === row.warehouse &&
      String(old.return_date ?? "") === row.return_date &&
      String(old.paid ?? "") === row.paid;
    if (same) { skipped += 1; continue; }
    changedRows.push(row);
  }
  /* ⚡ เขียนทีละ 50 แถวต่อคำสั่ง (15 ก.ย. 2569) — เดิมเขียนทีละแถว await เรียงกัน
      รอบแรกที่ต้องเขียนทั้งกอง (537 แถว) ⇒ **หมดเวลา 502** กลางทาง ชีพจรไม่เคยถูกจด */
  /* 🔒 กันเขียนทับข้ามร้าน — ท่าเดียวกับใบโอน: id ที่เป็นของอีกร้านไม่เขียน รายงาน collisions · อ่านล้ม = โยน */
  const clash = new Set();
  for (let i = 0; i < changedRows.length; i += 100) {
    const ids = changedRows.slice(i, i + 100).map((r) => esc(r.id)).join(",");
    const hit = await coreQuery(`SELECT id FROM return_orders_v2 WHERE id IN (${ids}) AND source <> ${esc(store)}`);
    for (const x of hit) if (x?.id !== undefined && x?.id !== null) clash.add(String(x.id));
  }
  const toWrite = changedRows.filter((r) => !clash.has(r.id));
  for (let i = 0; i < toWrite.length; i += 50) {
    const values = toWrite
      .slice(i, i + 50)
      .map(
        (row) =>
          `(${esc(row.id)},${esc(row.number)},${esc(row.reference)},${esc(row.customer)},${row.amount},` +
          `${esc(row.status)},${esc(row.warehouse)},${esc(row.return_date)},${esc(row.paid)},datetime('now'),${esc(store)})`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO return_orders_v2 (id, number, reference, customer, amount, status, warehouse, return_date, paid, updated_at, source)
       VALUES ${values}
       ON CONFLICT(id) DO UPDATE SET
         number=excluded.number, reference=excluded.reference, customer=excluded.customer, amount=excluded.amount,
         status=excluded.status, warehouse=excluded.warehouse, return_date=excluded.return_date,
         paid=excluded.paid, updated_at=excluded.updated_at
       WHERE return_orders_v2.source = excluded.source`
    );
  }
  const written = toWrite.length;

  const complete = !hitPageCap && pagesFailed === 0 && missingId === 0 && uniq.length >= total;
  /* ชีพจรซิงก์ใบคืน (15 ก.ย. 2569) — จอยอดขายหักคืนจากตารางนี้ ต้องรู้ว่าสดแค่ไหน
      ⚠️ เดิม syncReturnOrders **ไม่มีงานตามเวลาเรียกเลย** มีแต่ ?syncreturnorders สั่งมือ [[nothing-triggers-it]]
      v = "complete" | "incomplete" (ชนเพดานหน้า/หน้าล้ม) · ดึงหน้าแรกไม่ได้ = return ก่อนถึงนี่ ⇒ ไม่จด (ชีพจรเก่าลงให้เห็น)
      ⚠️ จดไม่สำเร็จ = กลืนแบบตั้งใจ (ท่าเดียวกับ sync_orders) ซิงก์ห้ามล้มเพราะชีพจร */
  try {
    await coreQuery(
      `INSERT INTO core_meta (k,v,at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at`,
      // ชีพจรแยกร้าน — z1 ใช้คีย์เดิม (จอยอดขายอ่านอยู่) · z2 คีย์ใหม่ ไม่ทับกัน
      [store === "z1" ? "sync_returns" : "sync_returns_z2", complete ? "complete" : "incomplete"]
    );
  } catch {
    // ไม่ทำอะไร — ดูคำอธิบายข้างบน
  }
  return {
    ok: true,
    store,
    zortTotal: total,
    fetched: uniq.length,
    written,
    skipped,
    collisions: clash.size, // > 0 = id ชนกับอีกร้าน ไม่ได้เขียน
    collisionIds: [...clash].slice(0, 20),
    /* 🔴 ทั้งสองธงนี้ห้ามกลืน — ชนเพดาน/หน้าล้ม = "ยังไม่ครบ" ไม่ใช่ "ครบแล้ว" */
    hitPageCap,
    pagesFailed,
    missingId, // แถวที่ ZORT ไม่ส่ง id มา — ไม่ถูกเก็บ (กุญแจคือ id) ⇒ มีเมื่อไหร่ complete เป็น false
    complete,
  };
}

/* 🔎 ค้นใบคืนด้วยคำค้น — อ่านจากกระจก return_orders_v2 (15 ก.ย. 2569)
    เดิม ?list=returnorders **เมิน q ทิ้ง** (ZORT GetReturnOrders ไม่มีช่องค้น · ส่งแค่ limit/page)
    ⇒ จอกรองในเบราว์เซอร์ได้แค่หน้าที่โหลดมา · ไฟล์ส่งออกได้ทุกแถวทั้งที่หัวไฟล์บอกว่ากรองแล้ว (gucut2 จับได้ 5d1ce6d)
    ⚠️ ผลค้นมาจากกระจก ไม่ใช่ ZORT สด ⇒ ส่ง source + ชีพจรซิงก์ (syncedAtUtc/syncComplete) ให้จอเขียนบอก
    🔒 อ่านกระจกไม่ได้ ⇒ error ห้ามคืน rows:[] (ไม่งั้นเหมือน "ค้นแล้วไม่เจอ")
    🔒 จอใช้ `applied.q` ตัดสินว่าไฟล์กรองแล้วจริงไหม — ห้ามเชื่อแค่ว่าตัวเองส่ง q ไป */
/* ช่วงวันของใบคืน — คิดเป็น **วันไทย** เพราะ `return_date` ในกระจกเก็บเป็น YYYY-MM-DD ตามที่ ZORT รายงาน
   (ZORT รายงานวันแบบไทยอยู่แล้ว ⇒ ห้ามแปลงเขตเวลาอีกชั้น จะเลื่อนไปหนึ่งวัน)
   ⚠️ `days` กับ `from/to` ใช้พร้อมกันไม่ได้ — ต้องตีกลับ ไม่ใช่เลือกอันหนึ่งเงียบ ๆ
      (ฟิลด์ที่ตอบคำถามเดียวกันสองทาง ถ้าเมินอันหนึ่ง ผู้เรียกจะเชื่อว่าใช้ค่าที่ตัวเองส่ง) */
export function returnDateRange({ from, to, days } = {}) {
  const ymd = (v) => {
    const t = String(v ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  };
  const f = ymd(from), t = ymd(to);
  if ((from && !f) || (to && !t)) return { error: "from/to ต้องเป็น YYYY-MM-DD" };
  const d = days === undefined || days === null || days === "" ? null : Number.parseInt(String(days), 10);
  if (days !== undefined && days !== null && days !== "" && (!Number.isFinite(d) || d < 1 || d > 400))
    return { error: "days ต้องเป็นจำนวนเต็ม 1-400" };
  if (d !== null && (f || t)) return { error: "ใช้ days หรือ from/to อย่างใดอย่างหนึ่ง ไม่ใช่ทั้งคู่" };
  if (d !== null) {
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const start = new Date(Date.now() + 7 * 3600e3 - (d - 1) * 864e5).toISOString().slice(0, 10);
    return { from: start, to: today, days: d };
  }
  return { from: f, to: t, days: null };
}

/* ยอดรวมของกระจกใบคืน — **ใช้ร่วมกันทั้งทางสดและทางค้นในกระจก**
 *
 * 🔴 ที่มา 19 ก.ย. 2569 (สารบัญ "ช่องที่แต่ละเส้นคืน" จับได้ในการรันครั้งแรก):
 *    `list=returnorders` มี **สองเส้นทางในเส้นเดียว** — ไม่ส่งตัวกรอง = ถาม ZORT สด ·
 *    ส่ง q/from/to/days = ค้นในกระจก (บรรทัด `if (needle || range.from || range.to)`)
 *    แล้วสองทางนั้น **ส่งคีย์ไม่เหมือนกัน**:
 *      ทางสด  → `mirrorTotals.{count, byStatus, freshness, …}`
 *      ทางกระจก → `syncedAtUtc` · `syncComplete` ที่ระดับบนสุด · **ไม่มี mirrorTotals เลย**
 *    ⇒ จอที่เขียน `d.mirrorTotals?.byStatus` ใช้ได้ตอนเปิดจอ แล้ว **หายทันทีที่คนกดตัวกรอง**
 *      โดยไม่มีอะไรฟ้อง — คีย์หายทั้งคีย์ อ่านได้ว่า "ยังไม่รู้" ทั้งที่กระจกมีข้อมูลครบ
 *    🔑 คลาส: เส้นเดียวที่แตกเป็นหลายเส้นทางต้องคืน **รูปคำตอบเดียวกัน** ทุกทาง
 *      ไม่งั้นปลายทางต้องเขียนโค้ดหลายชุดโดยไม่มีใครบอกว่าต้องเขียน
 * ⚠️ อ่านกระจกไม่ได้ = คืน null (ไม่ใช่ 0) ⇒ ปลายทางต้องเขียนว่า "ยังไม่รู้" */
/* @param กรอง  {where, args} ของชุดที่ผู้ใช้กรองอยู่ (ไม่ส่ง = ไม่คิดตัวเลขชุดกรอง)
 *
 * 🔴 **สองตัวเลขนี้ตอบคำถามคนละข้อ ห้ามยุบเป็นตัวเดียว** (ฝั่งจอตั้งเกณฑ์รับของไว้ 19 ก.ย. 2569
 *    ว่าจะเทียบ `q=CN` กับ `q=` เปล่า — เลขเท่ากันเป๊ะทั้งที่ total ต่างกัน = ยังไม่ได้กรอง)
 *    · `byStatus`         = **ทั้งร้าน** ⇒ ใช้ทำ **รายชื่อแท็บ** ⇒ แท็บไม่หายตอนคนกดกรอง
 *      (และจอใช้เขียน "ไม่นับใบยกเลิก 152 ใบ" อยู่แล้ว ⇒ **ห้ามเปลี่ยนความหมายเดิม**)
 *    · `byStatusFiltered` = **ของชุดที่กรองอยู่** ⇒ ใช้ทำ **ตัวนับบนแท็บ**
 *      ไม่มีตัวนี้ = แท็บบอก 5 แต่กดแล้วได้ 0 แถว ซึ่งหลอกตากว่าไม่มีตัวนับ
 *  ⚠️ ทางที่ถาม ZORT สด **กรองไม่ได้** ⇒ ส่ง `byStatusFiltered: null` + เหตุผล
 *     null = "ทางนี้กรองไม่ได้" ไม่ใช่ "กรองแล้วไม่มีของ" [[three-states-not-two]] */
async function ยอดกระจกใบคืน(store, กรอง = null) {
  try {
    const [t] = await coreQuery(
      `SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS s,
              SUM(CASE WHEN COALESCE(status,'') NOT LIKE '%void%' AND COALESCE(status,'') NOT LIKE '%cancel%' THEN 1 ELSE 0 END) AS c_live,
              ROUND(COALESCE(SUM(CASE WHEN COALESCE(status,'') NOT LIKE '%void%' AND COALESCE(status,'') NOT LIKE '%cancel%' THEN amount ELSE 0 END),0),2) AS s_live
       FROM return_orders_v2 WHERE source = ?`,
      [store]
    );
    const byStatusRows = await coreQuery(
      `SELECT COALESCE(NULLIF(status,''),'(ว่าง)') AS status, COUNT(*) AS c
       FROM return_orders_v2 WHERE source = ? GROUP BY 1 ORDER BY c DESC`,
      [store]
    ).catch(() => null);
    /* ตัวนับของ "ชุดที่กรองอยู่" — ใช้เงื่อนไขชุดเดียวกับที่ดึงแถว ห้ามสร้างเงื่อนไขใหม่
       (สร้างใหม่ = วันหนึ่งสองที่ไม่ตรงกัน แล้วตัวนับบนแท็บจะเพี้ยนแบบหาสาเหตุไม่ได้) */
    let byStatusFiltered = null;
    let byStatusFilteredNote = "ทางนี้ไม่ได้กรอง (ถาม ZORT สด) ⇒ ใช้ byStatus ทั้งร้านแทน";
    if (กรอง?.where) {
      const rows = await coreQuery(
        `SELECT COALESCE(NULLIF(status,''),'(ว่าง)') AS status, COUNT(*) AS c
         FROM return_orders_v2 WHERE ${กรอง.where} GROUP BY 1 ORDER BY c DESC`,
        กรอง.args ?? []
      ).catch(() => null);
      byStatusFiltered = Array.isArray(rows) ? rows : null;
      byStatusFilteredNote = Array.isArray(rows)
        ? "ตัวนับของ **ชุดที่กรองอยู่** (เงื่อนไขชุดเดียวกับที่ดึงแถว) ⇒ เอาไปใส่บนแท็บได้ตรง"
        : "อ่านไม่ได้รอบนี้ — ไม่ใช่ 'กรองแล้วไม่มีของ'";
    }
    const metaKey = store === "z2" ? "sync_returns_z2" : "sync_returns";
    const [meta] = await coreQuery(`SELECT v, at FROM core_meta WHERE k = ?`, [metaKey]).catch(() => []);
    return {
      count: num(t?.c), amount: Number(t?.s) || 0,
      countExcludingVoided: num(t?.c_live), amountExcludingVoided: Number(t?.s_live) || 0,
      syncedAtUtc: meta?.at ?? null, syncComplete: meta ? meta.v === "complete" : null,
      note: "รวมจากกระจกของร้านนี้ (ไม่ใช่ ZORT สด) · ใช้เป็นยอดทั้งหมดได้เมื่อ count เท่ากับ total ของ ZORT",
      /* null = อ่านกระจกไม่ได้รอบนี้ **ไม่ใช่ "ไม่มีใบยกเลิก"** ⇒ จอต้องเขียนว่ายังไม่รู้ */
      byStatus: Array.isArray(byStatusRows) ? byStatusRows : null,
      byStatusScope:
        "**ทั้งร้าน** (กระจก return_orders_v2 ของร้านนี้ทุกใบ) — ไม่ใช่ชุดที่กรองอยู่ และไม่ใช่จาก rows/total ในคำตอบนี้ · " +
        "ใช้ทำ **รายชื่อแท็บ** เพื่อให้แท็บไม่หายตอนกรอง · ตัวนับบนแท็บให้ใช้ byStatusFiltered · " +
        "null = อ่านกระจกไม่ได้ ไม่ใช่ไม่มีใบยกเลิก",
      byStatusFiltered,
      byStatusFilteredNote,
      /* 🕘 freshness อยู่ใต้ mirrorTotals โดยตั้งใจ — ทางสด rows/total มาจาก ZORT สด
         เวลานี้พูดถึงกระจกเท่านั้น (ป้ายขอบเขตต้องอยู่ติดกับตัวเลขที่มันกำกับ) */
      freshness: await freshnessOf(coreQuery, { table: "return_orders_v2", metaKey }),
    };
  } catch {
    return null;
  }
}

async function searchReturnOrdersMirror(limit, page, needle, store = "z1", range = {}) {
  /* 🔖 **สถานะ — เพิ่ม 19 ก.ย. 2569** ฝั่งจอถามว่าควรทำแท็บในจอใบคืนไหม
     ผมยิงตรวจก่อนตอบแล้วพบว่า `status=` **ไม่มีผลเลย** (693 ทุกค่า)
     ⇒ ถ้าตอบว่า "ทำแท็บเลย" จอจะได้ปุ่มที่กดแล้วไม่มีอะไรเกิด = ปุ่มหลอก
     ⇒ ต้องมีตัวกรองจริงก่อน แล้วค่อยให้จอทำแท็บ (ลำดับนี้กลับกันไม่ได้)
     ⚠️ กรองได้เฉพาะ**ทางกระจก** — ZORT `GetReturnOrders` รับ status ไหมยังไม่รู้ **ห้ามเดา**
        ⇒ ส่ง status มา = บังคับไปทางกระจก (ท่าเดียวกับ q/from/to ที่ทำอยู่แล้ว)
     ⚠️ เทียบแบบ **ตรงตัวไม่สนตัวพิมพ์** ไม่ใช่ LIKE — ค่าสถานะมาจาก ZORT เป็นคำจำกัด
        ใช้ LIKE จะทำให้ "Success" จับ "Unsuccess" ด้วย [[no-substring-classification]] */
  const status = String(range.status ?? "").trim().slice(0, 40) || null;
  const applied = { q: needle || null, from: range.from ?? null, to: range.to ?? null, days: range.days ?? null, status, source: "mirror" };
  if (!coreReady()) return { error: "ค้นใบคืนต้องใช้กระจก แต่ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN", applied };
  const n = Math.max(1, Math.min(200, num(limit) || 50));
  const p = Math.max(1, Math.min(50, num(page) || 1));
  /* 🔴 ห้าม LIKE '%คำค้น%' — D1 จำกัดรูปแบบ LIKE 50 ไบต์ ⇒ ชื่อไทย ≥17 ตัวทำคำขอล้ม
      (รุ่นแรก 8d4b031 ใช้ LIKE+ESCAPE · gucut2 ยิงจับได้ 15 ก.ย. 2569) ⇒ ดู sql-contains.mjs */
  // วงเล็บต้องครอบ OR ก่อนต่อ AND source ไม่งั้นร้านกรองแค่ช่องสุดท้าย
  /* ค้นคำ **ไม่บังคับแล้ว** — เรียกด้วยช่วงวันเปล่า ๆ ก็ได้ (จอใบคืนขอช่วงวัน 18 ก.ย. 2569)
     ไม่มีคำค้น ⇒ ข้ามท่อน OR ทั้งก้อน ไม่ใช่ค้นด้วยสตริงว่างซึ่งจับทุกแถวโดยบังเอิญ */
  const parts = ["source = ?"];
  const args = [store];
  if (needle) {
    parts.unshift(`(${contains("number")} OR ${contains("reference")} OR ${contains("customer")})`);
    args.unshift(needle, needle, needle);
  }
  if (range.from) { parts.push("return_date >= ?"); args.push(range.from); }
  if (range.to) { parts.push("return_date <= ?"); args.push(range.to); }
  if (status) { parts.push("lower(COALESCE(status,'')) = lower(?)"); args.push(status); }
  const where = parts.join(" AND ");
  let total;
  let rows;
  try {
    const [cnt] = await coreQuery(`SELECT COUNT(*) AS c FROM return_orders_v2 WHERE ${where}`, args);
    total = num(cnt?.c);
    rows = await coreQuery(
      `SELECT id, number, reference, customer, amount, status, warehouse, return_date, paid FROM return_orders_v2
       WHERE ${where} ORDER BY return_date DESC, id DESC LIMIT ${n} OFFSET ${(p - 1) * n}`,
      args
    );
  } catch {
    return { error: "ค้นใบคืนในกระจกไม่ได้", applied };
  }
  // ชีพจรอ่านไม่ได้ = ไม่รู้ (null) ไม่ใช่ "ครบ"
  let meta = null;
  try {
    [meta] = await coreQuery(`SELECT v, at FROM core_meta WHERE k = '${store === "z2" ? "sync_returns_z2" : "sync_returns"}'`);
  } catch {
    meta = null;
  }
  /* 🔴 ต้องส่ง mirrorTotals เหมือนทางสด — ดูเหตุผลเต็มที่หัวฟังก์ชัน ยอดกระจกใบคืน()
     ⚠️ `syncedAtUtc`/`syncComplete` ระดับบนสุด **คงไว้** ห้ามถอด — จออาจอ่านอยู่
        (ถอดคีย์ที่ปลายทางใช้ = จอพังเงียบ ๆ · เพิ่มอย่างเดียวปลอดภัยเสมอ) */
  /* ส่ง **เงื่อนไขชุดเดียวกับที่ดึงแถว** เข้าไป ⇒ byStatusFiltered ตรงกับสิ่งที่คนเห็นบนจอ
     (ไม่ส่ง = จอได้ตัวเลขของทั้งร้าน แล้วแท็บจะบอก 5 ทั้งที่กดแล้วได้ 0 แถว) */
  const mirrorTotals = await ยอดกระจกใบคืน(store, { where, args });
  return {
    total,
    page: p,
    pages: Math.max(1, Math.ceil(total / n)),
    live: false,
    source: "mirror",
    store,
    applied,
    /* 🤝 สัญญากับจอ: บอกตัวกรองที่ **ใช้ได้จริง** และค่าที่เลือกได้
       ค่าสถานะที่มีให้เลือกอยู่ใน `mirrorTotals.byStatus` (มาจากกระจกทั้งชุด ไม่ใช่พิมพ์มือ)
       ⇒ จอทำแท็บจากตัวนั้นได้เลย และจำนวนจะตรงกับที่กรองได้จริง */
    supportedFilters: ["q", "from", "to", "days", "status", "limit", "page", "store"],
    /* `statusValuesFrom` ย้ายไปอยู่ที่ระดับเส้นใน core.mjs แล้ว — ที่นี่ไม่ต้องส่ง
       (ส่งสองที่ = สองแหล่งความจริง วันหนึ่งข้อความสองอันจะไม่ตรงกัน) */
    mirrorTotals,
    syncedAtUtc: meta?.at ?? null,
    syncComplete: meta ? meta.v === "complete" : null,
    rows: (Array.isArray(rows) ? rows : []).map((r) => ({
      id: String(r?.id ?? ""),
      number: String(r?.number ?? ""),
      reference: String(r?.reference ?? ""),
      customer: String(r?.customer ?? ""),
      amount: num(r?.amount),
      status: String(r?.status ?? ""),
      warehouse: String(r?.warehouse ?? ""),
      date: String(r?.return_date ?? ""),
      paid: String(r?.paid ?? ""),
    })),
  };
}

export async function listReturnOrders(limit = 50, page = 1, q = "", store = "z1", opts = {}) {
  const needle = String(q ?? "").trim().slice(0, 60);
  /* 🔴 **เดิมเมินช่วงวันเงียบ ๆ** (ฝั่งจอจับได้ 18 ก.ย. 2569): ส่ง from/to/days ไปแล้ว total ไม่ขยับ
      และ applied มีแค่ q กับ source ⇒ ใครทำช่องวันที่บนจอจะได้ปุ่มหลอกที่ไม่มีอะไรฟ้อง
      ⇒ ตอนนี้กรองจริงจากกระจก (คอลัมน์ return_date + ดัชนี idx_ret2_date มีอยู่แล้ว)
      ⚠️ ZORT GetReturnOrders **ไม่รับช่วงวัน** ⇒ ขอช่วงวันเมื่อไหร่ต้องสลับมาอ่านกระจก
         และต้องบอกผู้เรียกว่าเลขชุดนี้มาจากกระจก (source: "mirror") ไม่ใช่ ZORT สด
         กระจกอาจซิงก์ไม่ทัน ⇒ ส่ง syncedAtUtc/syncComplete ไปให้ตัดสินเองด้วย */
  const range = returnDateRange(opts);
  if (range.error) return { error: range.error, supportedFilters: ["q", "store", "from", "to", "days", "status", "limit", "page"] };
  /* 🔴 **`returnDateRange()` สร้าง object ใหม่ที่มีแต่เรื่องวัน** — status ที่ผู้เรียกส่งมาจะหายที่นี่
     เจอกับตัวเองทันทีที่เขียนตัวทดสอบ (19 ก.ย. 2569): `range.status` เป็น undefined เสมอ
     ⇒ เงื่อนไขแยกทางไม่เคยเป็นจริงเพราะ status ⇒ **ตัวกรองที่เพิ่งเพิ่มไม่มีผลอะไรเลย**
       และจากข้างนอกดูเหมือนสำเร็จทุกประการ (200 + ตัวเลขสมเหตุสมผล) = ที่เพิ่งจะแก้เป๊ะ
     ⚠️ **ไม่แก้ที่ `returnDateRange`** — ฟังก์ชันนั้นมีหน้าที่เรื่องวันอย่างเดียว
        ยัด status เข้าไปจะทำให้ชื่อกับหน้าที่ไม่ตรงกัน และผู้เรียกอื่นได้ของที่ไม่ได้ขอ */
  if (opts.status !== undefined) range.status = opts.status;
  /* ⚠️ **ส่ง status มาต้องนับเข้าเงื่อนไขนี้ด้วย** (เพิ่ม 19 ก.ย. 2569)
     ลืมตรงนี้ = จอส่ง status ไปแล้วท่อเดินทางสด ⇒ ZORT ไม่รู้จักค่านั้น ⇒ คืนทั้ง 693 ใบ
     **แบบดูเหมือนสำเร็จ** (200 + ตัวเลขสมเหตุสมผล) = ปุ่มกรองหลอกพอดี
     ซึ่งเป็นอาการเดียวกับที่ยิงวัดเจอก่อนแก้ [[filter-looks-applied-but-is-not]] */
  if (needle || range.from || range.to || range.status) return searchReturnOrdersMirror(limit, page, needle, store, range);
  const h = store === "z2" ? storeCreds("z2") : headers();
  if (!h) return { error: `ยังไม่ได้ตั้งรหัส ZORT ของร้าน ${store}` };
  const n = Math.max(1, Math.min(200, num(limit) || 50));
  /* 🔴 **ต้องส่ง page ต่อให้ ZORT** (แก้ 14 ก.ย. 2569 · งานกระดาน t_mtzx0wp4)
      เดิมส่งแค่ limit ⇒ ได้ 200 ใบล่าสุดจาก 688 เสมอ · ใครไล่ offset=200,400… ได้ชุดเดิมซ้ำทุกหน้า
      แล้วเชื่อว่าครบ (วัดจริง: 8 หน้า 1,600 แถว ไม่ซ้ำแค่ 200) · ท่า page= เดียวกับ syncReturnOrders ที่ใช้งานจริงอยู่ */
  const p = Math.max(1, Math.min(50, num(page) || 1));
  const res = await fetch(`${BASE}/ReturnOrder/GetReturnOrders?limit=${n}&page=${p}`, {
    headers: h,
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const list = Array.isArray(data?.list) ? data.list : null;
  /* ⚠️ แยก "ดึงไม่สำเร็จ" ออกจาก "ไม่มีใบสักใบ" — จอต้องเขียนคนละคำ
      (สอง 0 ที่หน้าตาเหมือนกันแต่คนละความหมาย) */
  if (!list) return { error: "ดึงใบคืนของจาก ZORT ไม่ได้", applied: { q: null, from: null, to: null, days: null, source: "zort" } };
  /* 💰 ยอดรวมทั้งหมดจาก**กระจก** (17 ก.ย. 2569 · B3 ในใบสำรวจ t_mu5bhh84)
     หัวจอ ZORT เขียน "มูลค่าทั้งหมด X บาท" แต่ API ส่งแค่จำนวนใบ ⇒ ไล่ทุกหน้าจาก ZORT สด = ช้า/เปลืองโควตา
     ⇒ รวมจากกระจก return_orders_v2 ของร้านนั้น แล้ว **ส่งจำนวนใบของกระจกคู่ไปด้วย**
     ⚠️ คนละแหล่งกับ `total` (ZORT สด) — จอต้องใช้ยอดนี้เป็น "ทั้งหมด" ได้ก็ต่อเมื่อ mirrorTotals.count === total
     ⚠️ ยังไม่รู้ว่า "มูลค่าทั้งหมด" ของ ZORT รวมใบยกเลิกไหม ⇒ ส่งทั้งสองแบบ ห้ามเดา · อ่านไม่ได้ = null ไม่ใช่ 0 */
  /* 🔑 ใช้ฟังก์ชันร่วมกับทางค้นในกระจก — **ห้ามลอกโค้ดกลับมาวางซ้ำที่นี่**
     เดิมทางนี้คิดเอง ทางกระจกไม่คิดเลย ⇒ เส้นเดียวส่งคีย์ไม่เหมือนกันสองทาง
     (สารบัญช่องที่แต่ละเส้นคืนจับได้ 19 ก.ย. 2569 · เหตุผลเต็มที่หัว ยอดกระจกใบคืน) */
  const mirrorTotals = await ยอดกระจกใบคืน(store);
  return {
    total: num(data?.count),
    mirrorTotals,
    page: p,
    pages: Math.max(1, Math.ceil(num(data?.count) / n)),
    live: true,
    /* 🔴 ทางค้นในกระจกส่ง `source: "mirror"` มาตั้งแต่แรก แต่ทางนี้ไม่ส่งอะไรเลย
       ⇒ จอต้องเช็คสองแบบ (live กับ source) โดยไม่มีอะไรบอกว่าต้องเช็คสองแบบ
       เพิ่มให้รูปคำตอบตรงกันทั้งสองทาง (เพิ่มอย่างเดียว `live` คงไว้ จออาจใช้อยู่) */
    source: "zort",
    store,
    applied: { q: null, source: "zort" },
    rows: list.map((r) => ({
      /* 🔴 **ต้องส่ง `id` ออกไปด้วยเสมอ** (เพิ่ม 9 ก.ย. 2569 · ฝั่งจอจับได้ก่อน push)
          เส้นรายใบ `?returnorder=` ค้นด้วย `id` แต่รายการนี้ส่งแต่ `number` ⇒ จอกดเข้าใบไม่ได้
          เพราะ **ไม่มีกุญแจจะส่งไป** — ไม่ใช่เพราะจอเขียนผิด
          ⚠️ **คลาสเดียวกับ pending=1 เป๊ะ** (แก้ไปวันเดียวกัน) ⇒ กติกาถาวร:
             **รายการใดที่มีเส้นรายใบ ต้องส่งกุญแจของเส้นนั้นออกไปด้วยเสมอ**
             ส่งแต่ "เลขที่ใบ" ไม่พอ — เลขที่ใบใน ZORT ซ้ำกันได้ และไม่ใช่กุญแจค้น */
      id: String(r?.id ?? ""),
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
      /* 🔴 เดิมอ่าน warehousename ซึ่ง **ไม่มีในคำตอบของ ZORT** (ตัวซิงก์พิสูจน์แล้ว 9 ก.ย. 2569) ⇒ ช่องคลังว่างมาตลอด
          แก้ตามตัวซิงก์ 15 ก.ย. 2569 · คลาสเดียวกัน: เดาชื่อช่อง + ค่าสำรอง "" = ผิดแบบเงียบ */
      warehouse: String(r?.warehousecode ?? ""),
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
export async function getPurchaseDetail(number, store = "z1") {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await ensureTables();
  const no = String(number ?? "").trim().slice(0, 60);
  if (!no) return { error: "ต้องระบุเลขที่ใบสั่งซื้อ" };

  const st = store === "z2" ? "z2" : "z1";
  const notSynced = await purchasesSyncedError(st);
  if (notSynced) return { store: st, error: notSynced };
  const heads = await coreQuery(`SELECT * FROM purchase_orders_v2 WHERE source = ${esc(st)} AND number = ${esc(no)}`);
  const head = heads[0];
  if (!head) return { store: st, error: `ไม่พบใบสั่งซื้อ ${no} ของร้าน ${st} ในกระจก` };
  /* 🔴 เลขที่ใบซ้ำได้แม้ร้านเดียว ⇒ เจอหลายใบ **ห้ามเลือกให้** — คืนรายการ id ให้จอพาไปเลือก */
  if (heads.length > 1)
    return { store: st, error: `เลขที่ใบ ${no} ซ้ำกัน ${heads.length} ใบในร้าน ${st} — ไม่เดาว่าใบไหน`, duplicate: true, ids: heads.map((x) => String(x.id)) };

  const lines = await coreQuery(
    `SELECT line, sku, name, qty, price FROM purchase_order_items_v2
      WHERE po_id = ${esc(head.id)} ORDER BY line`
  );
  /* ⚠️ **ยอดรวมของบรรทัด ≠ ยอดหัวใบเสมอไป** — หัวใบมีส่วนลด/ค่าส่ง/ภาษีที่กระจกไม่ได้เก็บ
     ⇒ ส่งทั้งสองค่าไปให้จอ **ห้ามเลือกให้ค่าเดียว** และห้ามคิดว่าต่างกัน = ข้อมูลผิด
     (คลาสเดียวกับใบเสนอราคาที่ท่อจงใจส่งช่องเงินทุกช่อง ไม่ตีความแทน) */
  const lineTotal = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  return {
    store: st,
    id: String(head.id),
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
  const got = await zortDetailFetch("ReturnOrder/GetReturnOrderDetail", key, "ใบคืน");
  if (got.error) return got;
  const data = got.data;

  const r = pickDocHeader(data);
  if (!r) return noDocHeader(data, "ใบคืน");
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
