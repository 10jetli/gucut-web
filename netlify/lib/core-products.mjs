// ทะเบียนสินค้าในคลังเงา — ชื่อ · ราคา · หน่วย ดึงจาก ZORT มาเก็บไว้เอง
//
// ⚠️ **ช่องโหว่ที่เจอ 2 ก.ย. 2569:** คลังเงาไม่เคยมี "ชื่อสินค้า" ของตัวเอง
//    ทุกจอไปหยิบชื่อจาก `order_items` (ชื่อที่ติดมากับใบขาย) ⇒ สินค้าที่ยังไม่เคยขายเลย
//    **ไม่มีชื่อ** โผล่เป็นช่องว่างทั้งในจอสต็อกและในตัวค้นหาของเครื่องคิดเงิน
//    (ตรวจจริง: 4 ใน 5 SKU แรกชื่อว่าง) และทำให้จัดหมวดหมู่จากชื่อไม่ได้ 96% ของคลัง
// ⇒ ต้องมีทะเบียนสินค้าของเราเอง ไม่ใช่ยืมชื่อจากใบขาย
//
// ⚠️ ตัด ZORT เมื่อไหร่ ตารางนี้กลายเป็นทะเบียนสินค้าตัวจริงของร้าน ⇒ ห้ามลบทิ้ง
//    และวันนั้นต้องมีหน้าจอแก้ชื่อ/ราคาเอง (ยังไม่มี — จดไว้ในแผน)
import { coreQuery, coreReady } from "./coredb.mjs";

const esc = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const BASE = "https://open-api.zortout.com/v4";
const PAGE = 200;
const MAX_PAGES = 20; // 2,672 SKU ≈ 14 หน้า เผื่อไว้

function headers() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME) return null;
  return { storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET };
}

/** ดึงทะเบียนสินค้าทั้งคลังจาก ZORT มาเก็บ — เขียนเฉพาะตัวที่เปลี่ยนจริง (โควตา D1) */
export async function syncProducts() {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const h = headers();
  if (!h) return { skip: "ยังไม่ได้ตั้งรหัส ZORT" };

  const all = [];
  // ดึงหลายหน้าพร้อมกันทีละก้อน — Netlify ให้ฟังก์ชันรอผลได้ 26 วินาที
  for (let start = 1; start <= MAX_PAGES; start += 5) {
    const batch = [start, start + 1, start + 2, start + 3, start + 4].filter((n) => n <= MAX_PAGES);
    const pages = await Promise.all(
      batch.map((n) =>
        fetch(`${BASE}/Product/GetProducts?limit=${PAGE}&page=${n}`, {
          headers: h,
          signal: AbortSignal.timeout(12000),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );
    let got = 0;
    for (const p of pages) {
      const list = Array.isArray(p?.list) ? p.list : [];
      got += list.length;
      all.push(...list);
    }
    if (got < batch.length * PAGE) break; // หน้าสุดท้ายแล้ว
  }
  if (!all.length) return { error: "ดึงสินค้าจาก ZORT ไม่ได้" };

  const rows = [];
  const seen = new Set();
  for (const p of all) {
    const sku = String(p?.sku ?? "").trim().slice(0, 60);
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);
    rows.push({
      sku,
      name: String(p?.name ?? "").slice(0, 200),
      price: num(p?.sellprice),
      buy: num(p?.purchaseprice),
      // ⚠️ producttype 1 = "บริการ" (ค่าส่ง · ค่าบริการซ่อม · ค่าขนส่ง) — ของพวกนี้ไม่มีสต็อกจริง
      //    ตรวจทั้งคลังแล้วมี 6 ตัว · เป็นตัวที่ทำให้จอสต็อกมีของติดลบหนัก ๆ ยึดแถวบน
      type: Number(p?.producttype) || 0,
      active: p?.active === false ? 0 : 1,
      unit: String(p?.unittext ?? "").slice(0, 40),
      // ⚠️ คงเหลือในมือ vs พร้อมขาย ต่างกันจริง 155 ตัว (ของที่ถูกจองไว้ในออเดอร์ที่ยังไม่ส่ง)
      onhand: num(p?.stock),
      available: num(p?.availablestock),
      // ⚠️ หมวดหมู่จริงจาก ZORT — **อย่าเดาจากชื่อสินค้าถ้าช่องนี้มีค่า**
      //    ตรวจทั้งคลัง 3 ก.ย. 2569: 2,533 จาก 2,898 ตัวมีหมวด (87%) · 42 หมวด
      //    ตัวเดาจากชื่อที่เราเขียนเองครอบคลุมแค่ 52% และตั้งชื่อหมวดไม่ตรงกับที่ร้านใช้จริง
      cat: String(p?.category ?? "").trim().slice(0, 120),
      catId: String(p?.categoryid ?? "").trim().slice(0, 40),
      subCat: String(p?.subCategory ?? "").trim().slice(0, 120),
    });
  }

  // เทียบก่อนเขียน — ชื่อสินค้าแทบไม่เปลี่ยน เขียนทับทุกรอบคือเผาโควตาเปล่า ๆ
  const prev = new Map(
    (
      await coreQuery(
        `SELECT sku, name, sellprice, purchase_price, product_type, active, unit, onhand, available,
                category, category_id, sub_category
         FROM products`
      )
    ).map((r) => [r.sku, r])
  );
  const changed = rows.filter((r) => {
    const p = prev.get(r.sku);
    return (
      !p ||
      String(p.name ?? "") !== r.name ||
      num(p.sellprice) !== r.price ||
      num(p.purchase_price) !== r.buy ||
      num(p.product_type) !== r.type ||
      num(p.active) !== r.active ||
      String(p.unit ?? "") !== r.unit ||
      num(p.onhand) !== r.onhand ||
      num(p.available) !== r.available ||
      String(p.category ?? "") !== r.cat ||
      String(p.category_id ?? "") !== r.catId ||
      String(p.sub_category ?? "") !== r.subCat
    );
  });

  for (let i = 0; i < changed.length; i += 80) {
    const values = changed
      .slice(i, i + 80)
      .map(
        (r) =>
          `(${esc(r.sku)},${esc(r.name)},${r.price},${r.buy},${r.type},${r.active},` +
          `${esc(r.unit)},${r.onhand},${r.available},${esc(r.cat)},${esc(r.catId)},` +
          `${esc(r.subCat)},datetime('now'))`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO products
         (sku,name,sellprice,purchase_price,product_type,active,unit,onhand,available,
          category,category_id,sub_category,updated_at)
       VALUES ${values}
       ON CONFLICT(sku) DO UPDATE SET name=excluded.name, sellprice=excluded.sellprice,
         purchase_price=excluded.purchase_price, product_type=excluded.product_type,
         active=excluded.active, unit=excluded.unit, onhand=excluded.onhand,
         available=excluded.available, category=excluded.category,
         category_id=excluded.category_id, sub_category=excluded.sub_category,
         updated_at=excluded.updated_at`
    );
  }
  return { fetched: rows.length, written: changed.length, skipped: rows.length - changed.length };
}

/* ══ สินค้าเป็นชุด (Bundle) ══════════════════════════════════════════
   ⚠️ **ของจริงที่ร้านใช้อยู่ 360 ชุด และระบบเราไม่เคยรู้จักเลย** (เจอ 3 ก.ย. 2569
      ตอนเจ้าของร้านสั่งให้เข้าไปดูเมนู "สินค้า" ของ ZORT ทีละหัวข้อ)
      เช่น "NEWWAVE 7800 SUPER-S 30\" (SET KINGKONG)" = เลื่อย + บาร์ + โซ่ ขายเป็นชุดเดียว
   ⚠️ **สำคัญกับสต็อกมาก** — ขายชุดหนึ่งชุดต้องตัดของหลายตัว
      ตราบใดที่คลังเงายังไม่รู้จักชุด การตัดสต็อกของเราจะไม่ตรงกับความจริงทุกครั้งที่ขายชุด
   ⚠️ **รายการสินค้าในชุด ZORT ไม่เปิด API ให้ดึง** — ช่อง `list` คืน null ทุกตัว
      (ลองแล้ว: Bundle/GetBundle 404 · GetBundles?id= และ GetBundleDetail คืน list ว่าง)
      ⇒ เรารู้ว่า "มีชุดอะไรบ้าง ราคาเท่าไหร่ เหลือกี่ชุด" แต่ **ไม่รู้ว่าในชุดมีอะไร**
      ห้ามเดาส่วนประกอบจากชื่อชุดเด็ดขาด — เดาผิดคือตัดสต็อกผิดตัว */
export async function syncBundles() {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const h = headers();
  if (!h) return { skip: "ยังไม่ได้ตั้งรหัส ZORT" };
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS bundles (
       sku TEXT PRIMARY KEY, name TEXT, sellprice REAL, onhand REAL, available REAL,
       active INTEGER, unit TEXT, updated_at TEXT)`
  );

  const all = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${BASE}/Bundle/GetBundles?limit=200&page=${page}`, {
      headers: h,
      signal: AbortSignal.timeout(12000),
    }).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    const list = Array.isArray(data?.list) ? data.list : [];
    all.push(...list);
    if (list.length < 200) break;
  }
  if (!all.length) return { error: "ดึงสินค้าเป็นชุดจาก ZORT ไม่ได้" };

  const rows = [];
  const seen = new Set();
  for (const b of all) {
    const sku = String(b?.sku ?? "").trim().slice(0, 60);
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);
    rows.push({
      sku,
      name: String(b?.name ?? "").slice(0, 200),
      price: num(b?.sellprice),
      onhand: num(b?.stock),
      available: num(b?.availablestock),
      active: b?.active === false ? 0 : 1,
      unit: String(b?.unittext ?? "").slice(0, 40),
    });
  }

  const prev = new Map(
    (await coreQuery(`SELECT sku, name, sellprice, onhand, available, active, unit FROM bundles`))
      .map((r) => [r.sku, r])
  );
  const changed = rows.filter((r) => {
    const p = prev.get(r.sku);
    return (
      !p || String(p.name ?? "") !== r.name || num(p.sellprice) !== r.price ||
      num(p.onhand) !== r.onhand || num(p.available) !== r.available ||
      num(p.active) !== r.active || String(p.unit ?? "") !== r.unit
    );
  });

  for (let i = 0; i < changed.length; i += 80) {
    const values = changed
      .slice(i, i + 80)
      .map(
        (r) =>
          `(${esc(r.sku)},${esc(r.name)},${r.price},${r.onhand},${r.available},` +
          `${r.active},${esc(r.unit)},datetime('now'))`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO bundles (sku,name,sellprice,onhand,available,active,unit,updated_at)
       VALUES ${values}
       ON CONFLICT(sku) DO UPDATE SET name=excluded.name, sellprice=excluded.sellprice,
         onhand=excluded.onhand, available=excluded.available, active=excluded.active,
         unit=excluded.unit, updated_at=excluded.updated_at`
    );
  }
  return { fetched: rows.length, written: changed.length, skipped: rows.length - changed.length };
}

/** จอ "สินค้าเป็นชุด" แบบ ZORT */
export async function listBundles(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));
  const q = String(o.q ?? "").trim().slice(0, 60);
  const filter = q ? `AND (sku LIKE ${esc(`%${q}%`)} OR name LIKE ${esc(`%${q}%`)})` : "";
  const only = { active: "AND active = 1", inactive: "AND active = 0" }[o.only] || "";

  const [sum] = await coreQuery(
    `SELECT COUNT(*) AS c,
            SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS act,
            SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) AS inact,
            SUM(CASE WHEN COALESCE(onhand,0) < 0 THEN 1 ELSE 0 END) AS negative
     FROM bundles WHERE 1=1 ${filter}`
  );
  const rows = await coreQuery(
    `SELECT sku, name, sellprice, onhand, available, active, unit
     FROM bundles WHERE 1=1 ${filter} ${only}
     ORDER BY sku LIMIT ${limit} OFFSET ${offset}`
  );
  return {
    total: num(sum?.c),
    active: num(sum?.act),
    inactive: num(sum?.inact),
    negative: num(sum?.negative),
    limit,
    offset,
    // ⚠️ จอต้องเขียนบอกด้วย ไม่งั้นคนจะนึกว่าเราเก็บส่วนประกอบไว้แล้วแค่ยังไม่แสดง
    note: "ZORT ไม่เปิด API ให้ดึงรายการสินค้าในชุด — เรารู้แค่ตัวชุด ไม่รู้ว่าในชุดมีอะไร",
    rows,
  };
}

/** รับ "รายการสินค้าในชุด" ที่เก็บมาจากหน้าเว็บ ZORT
 *
 * ⚠️ **ทำไมต้องรับจากข้างนอก ไม่ดึงเอง** — ZORT ไม่เปิด API ให้ดึงรายการในชุด
 *    (ลองครบ: Bundle/GetBundle 404 · GetBundles?id= คืนทั้ง 360 ไม่กรอง · detail/showdetail ไม่มีผล)
 *    ข้อมูลนี้อยู่เฉพาะในหน้าเว็บที่ต้องล็อกอิน ⇒ เก็บจากเบราว์เซอร์ที่ล็อกอินอยู่แล้วส่งเข้ามา
 *
 * ⚠️ **เป็นการเก็บครั้งเดียว ไม่ใช่ของที่ซิงก์เองทุกคืน** — ส่วนประกอบของชุดแทบไม่เปลี่ยน
 *    แต่ถ้าร้านแก้สูตรชุดเมื่อไหร่ ต้องเก็บใหม่ **ไม่มีอะไรเตือนให้** ⇒ จอต้องโชว์วันที่เก็บล่าสุด
 *
 * ⚠️ **ห้ามเดาส่วนประกอบเด็ดขาด** — รับเฉพาะที่ส่งมาจริง ชุดไหนไม่มีข้อมูลก็ปล่อยว่างไว้
 *    เดาผิด = ตัดสต็อกผิดตัว ซึ่งแก้ยากกว่าไม่มีข้อมูล
 */
export async function saveBundleItems(input = {}) {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) return { error: "ไม่มีรายการส่งมา" };

  await coreQuery(
    `CREATE TABLE IF NOT EXISTS bundle_items (
       bundle_sku TEXT NOT NULL, line INTEGER NOT NULL, sku TEXT, name TEXT,
       qty REAL NOT NULL DEFAULT 0, at TEXT,
       PRIMARY KEY (bundle_sku, line))`
  );

  const clean = [];
  const bad = [];
  for (const [i, it] of items.entries()) {
    const bundle = String(it?.bundleSku ?? "").trim().slice(0, 60);
    const sku = String(it?.sku ?? "").trim().slice(0, 60);
    const qty = Number(it?.qty);
    if (!bundle) bad.push({ i, why: "ไม่มี bundleSku" });
    else if (!sku) bad.push({ i, bundle, why: "ไม่มี sku ของสินค้าในชุด" });
    else if (!Number.isFinite(qty) || qty <= 0) bad.push({ i, bundle, sku, why: "qty ต้องมากกว่า 0" });
    else clean.push({ bundle, sku, qty, name: String(it?.name ?? "").slice(0, 200), line: Number(it?.line) || clean.length + 1 });
  }
  if (!clean.length) return { error: "ไม่มีรายการที่ใช้ได้", bad };

  // เขียนใหม่ทั้งชุดสำหรับชุดที่ส่งมา — ลบก่อนใส่ ทำให้ยิงซ้ำได้ผลเหมือนเดิม
  const bundles = [...new Set(clean.map((c) => c.bundle))];
  for (let i = 0; i < bundles.length; i += 60) {
    const chunk = bundles.slice(i, i + 60).map(esc).join(",");
    await coreQuery(`DELETE FROM bundle_items WHERE bundle_sku IN (${chunk})`);
  }
  for (let i = 0; i < clean.length; i += 80) {
    const values = clean
      .slice(i, i + 80)
      .map((c) => `(${esc(c.bundle)},${c.line},${esc(c.sku)},${esc(c.name)},${c.qty},datetime('now'))`)
      .join(",");
    await coreQuery(
      `INSERT INTO bundle_items (bundle_sku,line,sku,name,qty,at) VALUES ${values}`
    );
  }
  return { bundles: bundles.length, lines: clean.length, bad: bad.length ? bad.slice(0, 5) : undefined };
}

/** รายการสินค้าในชุด — ใช้ทั้งบนจอและตอนคิดสต็อก */
export async function listBundleItems(bundleSku = "") {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS bundle_items (
       bundle_sku TEXT NOT NULL, line INTEGER NOT NULL, sku TEXT, name TEXT,
       qty REAL NOT NULL DEFAULT 0, at TEXT,
       PRIMARY KEY (bundle_sku, line))`
  );
  const one = String(bundleSku ?? "").trim().slice(0, 60);
  const [sum] = await coreQuery(
    `SELECT COUNT(DISTINCT bundle_sku) AS bundles, COUNT(*) AS lines, MAX(at) AS last FROM bundle_items`
  );
  const rows = one
    ? await coreQuery(
        `SELECT line, sku, name, qty FROM bundle_items WHERE bundle_sku = ${esc(one)} ORDER BY line`
      )
    : [];
  const [total] = await coreQuery(`SELECT COUNT(*) AS c FROM bundles`);
  return {
    bundlesWithItems: num(sum?.bundles),
    lines: num(sum?.lines),
    collectedAt: sum?.last || null,
    bundlesTotal: num(total?.c),
    // จอต้องบอกว่าเก็บมาแล้วกี่ชุดจากทั้งหมด — ไม่งั้นคนนึกว่าครบ
    note: "รายการในชุดเก็บจากหน้าเว็บ ZORT ครั้งเดียว ไม่ได้ซิงก์เอง — ร้านแก้สูตรชุดเมื่อไหร่ต้องเก็บใหม่",
    sku: one || undefined,
    rows,
  };
}
