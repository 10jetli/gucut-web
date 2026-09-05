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

  /* ⚠️ **สินค้าที่ไม่มีรหัสเก็บเข้ากระจกไม่ได้เลยโดยโครงสร้าง** (SKU เป็นกุญแจหลัก)
      ตรวจจริง 3 ก.ย. 2569: ZORT มี 2,898 · **ไม่มีรหัส 226 ตัว (7.8%)** · คลังเงาจึงได้ 2,672
      โชคดีที่ทั้ง 226 ตัว **สต็อกเป็นศูนย์หมด มูลค่ารวม ฿0** ⇒ ไม่มีตัวเลขไหนของเราผิดเพราะเรื่องนี้
      ⇒ **ไม่แก้โครง แต่ต้องเลิกเงียบ** — ส่งตัวเลขออกไปให้จอเขียนบอกว่าขาดอะไรไปเท่าไหร่
      (เปลี่ยนไปใช้ id ของ ZORT เป็นกุญแจ = ต้องรื้อทุกตารางที่จับคู่ด้วย SKU
       ทั้ง Shopee · สินค้าชุด · ใบซื้อ · ออเดอร์ — แลกความเสี่ยงทั้งระบบเพื่อของที่มูลค่าศูนย์) */
  const zortTotal = all.length;
  const noSku = all.filter((p) => !String(p?.sku ?? "").trim());
  const noSkuStock = noSku.filter((p) => num(p?.stock) !== 0).length;
  try {
    const { getStore } = await import("@netlify/blobs");
    await getStore("gucut-coupon").setJSON("zort-product-counts", {
      at: new Date().toISOString(),
      zortTotal,
      noSku: noSku.length,
      noSkuWithStock: noSkuStock,
    });
  } catch {
    // เก็บตัวนับไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย — อย่าให้ sync ล้มเพราะเรื่องนี้
  }

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
      // ⚠️ น้ำหนัก (กรัม) — มีค่าจริงแค่ 669 จาก 2,898 ตัว ⇒ **0 หรือว่าง = ยังไม่กรอก ไม่ใช่ไร้น้ำหนัก**
      //    เก็บเป็น null ไม่ใช่ 0 เพื่อให้จอแสดงขีด (กติกาเดียวกับราคาซื้อ)
      weight: num(p?.weight) > 0 ? num(p?.weight) : null,
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
                category, category_id, sub_category, weight
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
      String(p.sub_category ?? "") !== r.subCat ||
      (p.weight === null ? null : num(p.weight)) !== r.weight
    );
  });

  for (let i = 0; i < changed.length; i += 80) {
    const values = changed
      .slice(i, i + 80)
      .map(
        (r) =>
          `(${esc(r.sku)},${esc(r.name)},${r.price},${r.buy},${r.type},${r.active},` +
          `${esc(r.unit)},${r.onhand},${r.available},${esc(r.cat)},${esc(r.catId)},` +
          `${esc(r.subCat)},${r.weight === null ? "NULL" : r.weight},datetime('now'))`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO products
         (sku,name,sellprice,purchase_price,product_type,active,unit,onhand,available,
          category,category_id,sub_category,weight,updated_at)
       VALUES ${values}
       ON CONFLICT(sku) DO UPDATE SET name=excluded.name, sellprice=excluded.sellprice,
         purchase_price=excluded.purchase_price, product_type=excluded.product_type,
         active=excluded.active, unit=excluded.unit, onhand=excluded.onhand,
         available=excluded.available, category=excluded.category,
         category_id=excluded.category_id, sub_category=excluded.sub_category,
         weight=excluded.weight, updated_at=excluded.updated_at`
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

  /* คอลัมน์ "ราคาสินค้ารวม" แบบ ZORT = ผลรวม (ราคาขายของชิ้นส่วน × จำนวน)
     ✅ **ตรวจกับของจริงแล้วก่อนเปิดใช้** (3 ก.ย. 2569) — ชุด 00073-30-KK
        00073 ฿5,200 + 02289 ฿60 + 01763 ฿1,700 + 03794 ฿14 ×48 = **฿7,632**
        ZORT โชว์ ฿7,632 พอดี ⇒ ยืนยันว่าใช้ **ราคาขาย** ไม่ใช่ราคาซื้อ
        (ราคาซื้อรวมได้ ฿4,365.80 ซึ่งไม่ตรง — ถ้าเดาผิดข้างจะได้เลขที่เกือบถูก)
     ⚠️ ชิ้นส่วนตัวไหนไม่มีราคาในคลัง = **คืนค่าว่าง ห้ามคิดเป็นศูนย์**
        คิดเป็นศูนย์ = ได้ราคาที่ต่ำกว่าจริงแบบดูสมเหตุสมผล ซึ่งจับไม่ได้ด้วยตา
     ⚠️ สูตรชุดเป็นภาพนิ่งเก็บครั้งเดียว — ส่ง recipeAt ไปให้จอโชว์เสมอ */
  let recipeAt = null;
  if (rows.length) {
    const keys = rows.map((r) => esc(String(r.sku))).join(",");
    const items = await coreQuery(
      `SELECT bundle_sku, sku, qty, at FROM bundle_items WHERE bundle_sku IN (${keys})`
    ).catch(() => []);
    if (items.length) {
      const need = [...new Set(items.map((i) => String(i.sku)))];
      const price = new Map();
      for (let i = 0; i < need.length; i += 200) {
        const part = need.slice(i, i + 200).map((x) => esc(x)).join(",");
        for (const r of await coreQuery(
          `SELECT sku, sellprice FROM products WHERE sku IN (${part})`
        ).catch(() => [])) {
          price.set(String(r.sku), r.sellprice === null ? null : num(r.sellprice));
        }
      }
      const byBundle = new Map();
      for (const it of items) {
        const k = String(it.bundle_sku);
        if (!byBundle.has(k)) byBundle.set(k, []);
        byBundle.get(k).push(it);
        if (it.at && (!recipeAt || String(it.at) > recipeAt)) recipeAt = String(it.at);
      }
      for (const r of rows) {
        const parts = byBundle.get(String(r.sku));
        if (!parts?.length) {
          r.itemsValue = null;
          r.itemCount = 0;
          continue;
        }
        r.itemCount = parts.length;
        let total = 0;
        let complete = true;
        for (const p of parts) {
          const v = price.get(String(p.sku));
          if (v === undefined || v === null) { complete = false; break; }
          total += v * num(p.qty);
        }
        r.itemsValue = complete ? Math.round(total * 100) / 100 : null;
      }
    }
  }

  /* คอลัมน์ Marketplace ในจอสินค้าชุด — เจ้าของร้านวงมาให้เอง 3 ก.ย. 2569
     พร้อมสั่งกำกับว่า **ห้ามใส่มั่ว ต้องเชื่อมจริง ๆ**
     ⇒ ถามแพลตฟอร์มเองทุกครั้ง ไม่เดาจากชื่อ ไม่เดาจากประวัติการขาย
     ⚠️ ในจอ ZORT รหัสชุด (00073-11.8-KK) ขึ้นโลโก้ตรง ๆ ไม่ต้องตัดท้าย
        แต่ยังตัดเผื่อไว้ เพราะบางชุดบนแพลตฟอร์มมีหางต่อท้ายอีกชั้น */
  let mk = { checkedMarketplaces: [] };
  if (o.marketplaces && rows.length) {
    try {
      const { marketplaceListings } = await import("./marketplace-listings.mjs");
      const ml = await marketplaceListings({ fresh: Boolean(o.fresh) });
      // ⚠️ ตรรกะจับคู่อยู่ที่ sku-match.mjs ที่เดียว — ห้ามก๊อปมาวางซ้ำ (เคยมี 3 ชุดที่ไม่ตรงกัน)
      const { buildSkuIndex } = await import("./sku-match.mjs");
      const idx = buildSkuIndex(ml.listings);
      for (const r of rows) {
        const sku = String(r.sku);
        r.marketplaces = idx.tagsOf(sku);
        r.marketplacesBy = idx.methodOf(sku); // บอกด้วยว่าโลโก้ไหนมาจากการเดา
        const from = idx.fromOf(sku);
        if (Object.keys(from).length) r.marketplacesFrom = from;
      }
      mk = {
        checkedMarketplaces: ml.checked,
        marketplacesAt: new Date(ml.at).toISOString(),
        marketplacesNotConnected: ml.notConnected,
        // ⚠️ ช่องทางที่ตอบมาแล้วแต่เลขยังผิด — จอต้องขึ้นเตือนคร่อมโลโก้ ห้ามปล่อยให้ดูปกติ
        marketplacesUnreliable: ml.unreliable,
        marketplacesFailed: ml.failed,
      };
    } catch (e) {
      mk.marketplacesError = String(e?.message || e).slice(0, 160);
    }
  }

  return {
    total: num(sum?.c),
    active: num(sum?.act),
    inactive: num(sum?.inact),
    negative: num(sum?.negative),
    limit,
    offset,
    recipeAt,
    ...mk, // ⚠️ วันที่เก็บสูตรชุด — จอต้องโชว์ สูตรไม่ได้ซิงก์เอง
    note:
      "รายการในชุดเก็บจากหน้าเว็บ ZORT ครั้งเดียว ไม่ได้ซิงก์เอง — " +
      "ราคาสินค้ารวมคิดจากราคาขายของชิ้นส่วน (ตรวจกับ ZORT แล้ว) · " +
      "ชิ้นส่วนที่ไม่มีราคาในคลังจะคืนค่าว่าง ไม่คิดเป็นศูนย์",
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
export async function listBundleItems(bundleSku = "", memberSku = "") {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS bundle_items (
       bundle_sku TEXT NOT NULL, line INTEGER NOT NULL, sku TEXT, name TEXT,
       qty REAL NOT NULL DEFAULT 0, at TEXT,
       PRIMARY KEY (bundle_sku, line))`
  );
  const one = String(bundleSku ?? "").trim().slice(0, 60);
  /* ⚠️ **member= ถามกลับทาง: "รหัสนี้อยู่ในชุดไหนบ้าง"**
      ต่างจาก sku= ที่ถามว่า "ชุดนี้มีอะไรบ้าง" — คนละคำถาม ใช้คนละหน้าจอ
      ก่อนมีตัวนี้ ท่อเมิน member= เงียบ ๆ แล้วคืน rows ว่าง
      ⇒ จอจะเขียนว่า "ไม่อยู่ในชุดไหนเลย" ทั้งที่ความจริงคือ **ยังไม่รองรับ**
         (ฝั่งจอจับได้ 3 ก.ย. 2569 — คำตอบว่างที่ดูเหมือนคำตอบจริง) */
  const member = String(memberSku ?? "").trim().slice(0, 60);
  const [sum] = await coreQuery(
    `SELECT COUNT(DISTINCT bundle_sku) AS bundles, COUNT(*) AS lines, MAX(at) AS last FROM bundle_items`
  );
  let rows = [];
  if (one) {
    rows = await coreQuery(
      `SELECT line, sku, name, qty FROM bundle_items WHERE bundle_sku = ${esc(one)} ORDER BY line`
    );
  } else if (member) {
    // อยู่ในชุดไหนบ้าง + ชื่อชุด (เอาจากตาราง bundles ถ้ามี)
    rows = await coreQuery(
      `SELECT i.bundle_sku AS bundleSku,
              COALESCE((SELECT name FROM bundles b WHERE b.sku = i.bundle_sku), '') AS bundleName,
              i.qty AS qty
       FROM bundle_items i WHERE i.sku = ${esc(member)}
       ORDER BY i.bundle_sku`
    );
  }
  const [total] = await coreQuery(`SELECT COUNT(*) AS c FROM bundles`);
  return {
    // ⚠️ สะท้อนพารามิเตอร์ที่รับไปจริง — จอตรวจเองได้ว่าเซิร์ฟเวอร์อ่านที่ส่งไปไหม
    applied: { sku: one || null, member: member || null },
    mode: one ? "ชุดนี้มีอะไรบ้าง" : member ? "รหัสนี้อยู่ในชุดไหนบ้าง" : "สรุปรวม",
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

/* ══ มูลค่าสินค้ารายหมวดที่คัดมาจากจอ ZORT ══════════════════════════════
   ⚠️ **ทำฝั่งเซิร์ฟเวอร์ไม่ได้ — ZORT ไม่มี Category API เลย** (ยิงจริงแล้ว 404)
      ค่านี้อยู่แต่ในจอ ZORT ซึ่งต้องล็อกอิน ⇒ ต้องคัดจากเบราว์เซอร์แล้วอัปเข้ามา
      แพตเทิร์นเดียวกับส่วนประกอบสินค้าชุด 360 ชุด
   ⚠️ **เป็นค่าที่ "คัดมา" ไม่ใช่ "คิดเอง"** — ส่ง collectedAt ออกไปทุกครั้ง
      จอต้องโชว์ว่าคัดมาเมื่อไหร่ ไม่งั้นกลายเป็นตาข่ายที่เคยถูกแล้วหยุดอัปเดตเงียบ ๆ
   ⚠️ ต้นทุนเฉลี่ยขยับเฉพาะตอน "ซื้อเข้า" — ร้านนี้มีใบซื้อ 32 ใบ ปี 2026 ใบเดียว
      ⇒ เก็บใหม่เมื่อมีใบซื้อใหม่ก็พอ ไม่ต้องเก็บทุกวัน */
export async function saveCategoryValues(rows = []) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS category_values (
       name TEXT PRIMARY KEY, skus INTEGER, value_remain REAL, value_available REAL, at TEXT)`
  );
  const clean = (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      name: String(r?.name ?? "").trim().slice(0, 120),
      skus: num(r?.skus),
      remain: num(r?.remain),
      avail: num(r?.avail),
    }))
    .filter((r) => r.name);
  if (!clean.length) return { error: "ไม่มีข้อมูลที่ใช้ได้" };
  for (let i = 0; i < clean.length; i += 40) {
    const values = clean
      .slice(i, i + 40)
      .map((r) => `(${esc(r.name)},${r.skus},${r.remain},${r.avail},datetime('now'))`)
      .join(",");
    await coreQuery(
      `INSERT INTO category_values (name,skus,value_remain,value_available,at)
       VALUES ${values}
       ON CONFLICT(name) DO UPDATE SET skus=excluded.skus, value_remain=excluded.value_remain,
         value_available=excluded.value_available, at=excluded.at`
    );
  }
  const [sum] = await coreQuery(
    `SELECT COUNT(*) AS c, ROUND(SUM(value_remain),2) AS remain, ROUND(SUM(value_available),2) AS avail
     FROM category_values`
  );
  return {
    saved: clean.length,
    categories: num(sum?.c),
    totalRemain: num(sum?.remain),
    totalAvailable: num(sum?.avail),
  };
}

/** อ่านมูลค่าที่คัดมา — คืน map ชื่อหมวด → ค่า พร้อมวันที่คัด */
export async function categoryValues() {
  if (!coreReady()) return { map: new Map(), at: null };
  try {
    const rows = await coreQuery(
      `SELECT name, skus, value_remain, value_available, at FROM category_values`
    );
    let at = null;
    const map = new Map();
    for (const r of rows) {
      map.set(String(r.name), {
        zortSkus: num(r.skus),
        zortValue: num(r.value_remain),
        zortAvailable: num(r.value_available),
      });
      if (!at || String(r.at) > at) at = String(r.at);
    }
    return { map, at };
  } catch {
    return { map: new Map(), at: null };
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   สินค้าที่ "ขายไม่ได้เพราะสต็อกติดลบ" — ไล่กลับไปหาต้นเหตุ ไม่ใช่ไล่อาการ

   ⚠️ **ทำไมต้องมีตัวนี้** (5 ก.ย. 2569) — เจอพร้อมกันจากสองทางโดยบังเอิญ:
      ฝั่งท่อเห็นว่า Shopee ต่างจากคลัง 42 รหัส · ฝั่งจอเห็นว่าสินค้าหายจากฟีด gucut.com
      **เป็นเรื่องเดียวกัน** และถ้าไม่มีใครบังเอิญไปดู จะไม่มีอะไรฟ้องเลยสักอย่าง
      ของไม่ได้ขึ้นว่า "หมด" ด้วยซ้ำ — มัน **หายไปทั้งสินค้า** ลูกค้าค้นก็ไม่เจอ

   ⚠️ **หัวใจคือการยุบอาการให้เหลือต้นเหตุ** — ม้วนโซ่ติดลบหนึ่งม้วน
      ทำให้รหัสความยาว 23 รหัสขายไม่ได้พร้อมกัน (ของจริง: `01209` = −134.5)
      รายงานที่ลิสต์ 23 บรรทัดทำให้คนคิดว่ามี 23 ปัญหา แล้วท้อ
      ความจริงคือ **นับของครั้งเดียวจบ** ⇒ เรียงตาม "นับตัวนี้แล้วปลดล็อกได้กี่รหัส"

   ⚠️ **ค่าบริการติดลบเป็นเรื่องปกติ ห้ามนับเป็นปัญหา** (ค่าซ่อม · ค่าน้ำมัน · ค่าตัดต่อโซ่)
      แยกด้วย `product_type = 1` เท่านั้น **ห้ามดูจากชื่อว่ามีคำว่า "ค่าบริการ" ไหม**
      (no-substring-classification — ชื่อที่คนตั้งเองมีคำของประเภทอื่นปนเสมอ)
      ของจริง 5 ก.ย.: ติดลบ 19 รหัส เป็นบริการ 4 ⇒ สินค้าจริง 15
      **เลข 15 นี้ตรงกับที่ฝั่งจอนับได้เองจากคนละทาง** จึงเชื่อได้

   ⚠️ อ่านอย่างเดียว ไม่แก้สต็อกให้เอง — ตัวเลขติดลบแปลว่า "ของจริงกับในระบบไม่ตรง"
      ซึ่งแก้ได้ด้วยการนับของเท่านั้น เดาแล้วเขียนทับ = ทำลายหลักฐาน (fixes-can-destroy-truth)
   ───────────────────────────────────────────────────────────────────────────── */
export async function blockedByNegative() {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };

  const neg = await coreQuery(
    `SELECT sku, name, available, onhand, COALESCE(product_type,0) AS ptype
     FROM products
     WHERE available IS NOT NULL AND available < 0
     ORDER BY available ASC`
  );

  // บริการ (ptype = 1) ติดลบได้ตามปกติ — แยกออกไป แต่ยังรายงานจำนวนให้เห็นว่าไม่ได้ซ่อน
  const services = neg.filter((r) => num(r.ptype) === 1);
  const goods = neg.filter((r) => num(r.ptype) !== 1);

  /* หา "รหัสลูก" ของแต่ละตัวที่ติดลบ — ชุดไหนใช้รหัสนี้เป็นส่วนประกอบบ้าง
     ⚠️ ดึงทีเดียวทั้งตาราง แล้วจับคู่ใน JS **ห้ามวน query ทีละตัว**
        D1 มีเพดานตัวแปรผูก ~100 และการยิงทีละตัวกินโควตาโดยไม่จำเป็น
        (บทเรียน bycustomer 5 ก.ย. — ทดสอบด้วยค่าน้อยแล้วผ่าน พอของจริงมาก็ล้ม) */
  const links = await coreQuery(`SELECT bundle_sku, sku, qty FROM bundle_items`);
  const childOf = new Map(); // รหัสส่วนประกอบ → [ชุดที่ใช้มัน]
  for (const l of links) {
    const k = String(l.sku ?? "");
    if (!k) continue;
    if (!childOf.has(k)) childOf.set(k, []);
    childOf.get(k).push({ sku: String(l.bundle_sku), per: num(l.qty) });
  }

  /* ── สูตรของตัวเอง ── รหัสที่ติดลบบางตัว **เป็นชุดที่ประกอบตอนมีออเดอร์**
      เจ้าของร้านยืนยัน 5 ก.ย. 2569: *"ตะไบแพ็ค 3 แพ็คตอนมีออเดอร์"*
      ⇒ ของแบบนี้ **ตัวเลขจริงคือสูตร ไม่ใช่ช่องสต็อกของตัวเอง**
        `03409-3` ช่องสต็อกบอก −4 แต่สูตร 03409×3 กับตะไบ 1,511 ตัว ⇒ แพ็คได้ 503

      ⚠️ **ตัวเลขติดลบของรหัสแบบนี้ไม่ใช่ "ปัญหา" แต่เป็น "ตัวเลขที่เชื่อไม่ได้"**
         ถ้านับรวมเป็นปัญหา รายงานจะบอกให้ไปนับของที่ไม่ต้องนับ
         และที่แย่กว่าคือ **จะไม่มีใครรู้ว่ามันขายได้ 503** ⇒ ปิดขายต่อไปเรื่อย ๆ
      ⚠️ แยกเป็นกองของตัวเอง **ห้ามซ่อนทิ้ง** — ช่องสต็อกที่ผิดยังเป็นเรื่องที่ต้องล้างอยู่ดี
      ⚠️ ถ้าสูตรคำนวณแล้วยัง ≤ 0 (ส่วนประกอบก็ติดลบ) ⇒ กลับไปเป็นปัญหาตามเดิม */
  const recipeOf = new Map(); // รหัสชุด → [ส่วนประกอบ]
  for (const l of links) {
    const b = String(l.bundle_sku ?? "");
    if (!b) continue;
    if (!recipeOf.has(b)) recipeOf.set(b, []);
    recipeOf.get(b).push({ sku: String(l.sku ?? ""), per: num(l.qty) });
  }
  const stockOf = new Map(
    (await coreQuery(`SELECT sku, available FROM products WHERE available IS NOT NULL`))
      .map((r) => [String(r.sku), num(r.available)])
  );
  /** ทำได้กี่ชิ้นตามสูตร — ส่วนประกอบที่ทำได้น้อยที่สุดเป็นตัวกำหนด
   *  คืน null เมื่อไม่มีสูตร หรือสูตรใช้ไม่ได้ (per ≤ 0 · ไม่รู้จักส่วนประกอบ)
   *  ⚠️ ไม่รู้ ต้องคืน null **ห้ามคืน 0** — 0 แปลว่า "ทำไม่ได้" ซึ่งเป็นคำตอบคนละอย่าง */
  const canMakeOf = (sku) => {
    const parts = recipeOf.get(String(sku));
    if (!parts?.length) return null;
    let best = Infinity;
    for (const p of parts) {
      if (!(p.per > 0) || !stockOf.has(p.sku)) return null;
      best = Math.min(best, Math.floor(stockOf.get(p.sku) / p.per));
    }
    return Number.isFinite(best) ? best : null;
  };

  const mk = (r) => {
    const kids = childOf.get(String(r.sku)) ?? [];
    return {
      sku: String(r.sku),
      name: String(r.name ?? ""),
      available: num(r.available),
      // ตัวที่มีลูกหลายตัว = "ม้วนแม่" · นับตัวนี้ครั้งเดียวปลดล็อกได้ทั้งกอง
      kind: kids.length > 1 ? "parent" : "item",
      /* ⚠️ **ตัวเลขนี้คือ "จำนวนรหัสที่ขายไม่ได้เพราะตัวนี้"** ไม่ใช่จำนวนชิ้น
          รวมตัวมันเองด้วยเมื่อมันขายตรง ๆ ได้ (ไม่มีลูก = ขายเป็นตัวมันเอง) */
      unlocks: kids.length > 0 ? kids.length : 1,
      children: kids.map((k) => k.sku).sort(),
    };
  };

  const roots = [];
  const sellable = []; // ติดลบในช่องสต็อก แต่สูตรบอกว่ายังขายได้
  for (const r of goods) {
    const can = canMakeOf(r.sku);
    if (can !== null && can > 0) {
      sellable.push({
        ...mk(r),
        canMake: can,
        recipe: recipeOf.get(String(r.sku)).map((p) => ({ sku: p.sku, per: p.per })),
        why: "ประกอบตอนมีออเดอร์ — ตัวเลขจริงมาจากสูตร ไม่ใช่ช่องสต็อกของตัวเอง",
      });
    } else {
      roots.push(mk(r));
    }
  }
  // เรียงตาม "นับแล้วคุ้มที่สุดก่อน" — ปลดล็อกได้เยอะสุดขึ้นก่อน
  roots.sort((a, b) => b.unlocks - a.unlocks || a.available - b.available);
  sellable.sort((a, b) => b.canMake - a.canMake);

  const blockedSkus = roots.reduce((s, r) => s + r.unlocks, 0);
  return {
    negativeRows: neg.length,
    services: services.length,
    servicesNote:
      "ค่าบริการติดลบเป็นเรื่องปกติ (ตัดจากใบขายแต่ไม่มีสต็อกจริง) — ไม่นับเป็นปัญหา " +
      "แยกด้วยชนิดสินค้า ไม่ได้ดูจากชื่อ",
    roots: roots.length,
    blockedSkus,
    /* ⚠️ ต้องบวกกลับได้เสมอ: บริการ + ติดลบจริง + ติดลบแต่ยังขายได้ = แถวที่ติดลบทั้งหมด
        บวกไม่ได้เมื่อไหร่ = มีของหายระหว่างทาง (partial-coverage-reported-as-full)
        ⚠️ เพิ่มกองใหม่ต้องมาบวกในบรรทัดนี้ด้วยทุกครั้ง ไม่งั้นตาข่ายจะเงียบ */
    addsUp: services.length + roots.length + sellable.length === neg.length,
    scope:
      "นับจากทะเบียนสินค้าในคลังเงาทั้งหมด ไม่ใช่เฉพาะที่ลงขายในช่องทางใดช่องทางหนึ่ง · " +
      "blockedSkus = จำนวนรหัสที่ลูกค้าซื้อไม่ได้ ไม่ใช่จำนวนชิ้น",
    rows: roots,
    /* ── ติดลบแต่ยังขายได้ ── ประกอบตอนมีออเดอร์ ⇒ สูตรเป็นตัวจริง
        ⚠️ **จอต้องโชว์กองนี้เป็น "โอกาสขาย" ไม่ใช่ "ปัญหา"** — สองคำสั่งคนละอย่าง
           ปัญหา = ไปนับของ · โอกาส = ไปเปิดขายในช่องทางที่ปิดไว้
        ⚠️ ช่องสต็อกที่ผิดยังต้องล้างอยู่ดี แต่เป็นงานล้างข้อมูล ไม่ใช่งานนับของ */
    sellableDespiteNegative: sellable.length,
    sellableNote:
      "ติดลบในช่องสต็อกของตัวเอง แต่เป็นของที่ประกอบตอนมีออเดอร์ ⇒ ตัวเลขจริงมาจากสูตร · " +
      "ไม่ต้องไปนับของ แต่ควรไปเปิดขายในช่องทางที่ปิดไว้ และล้างช่องสต็อกที่ผิดทีหลัง",
    sellableRows: sellable,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   วางแผนสั่งม้วนใหม่ — "ของนี้พอขายอีกกี่วัน"

   ⚠️ **ที่มา** (5 ก.ย. 2569) — ผมเกือบแนะนำเจ้าของร้านผิด
      เห็นม้วนเหลือ 34.5 ฟัน แล้วสรุปว่า "อย่าเปิดขาย เดี๋ยวสัญญาเกินของ"
      เจ้าของร้านบอกว่า **"เศษต่อได้ ถ้าม้วนใหม่เข้ามา"**
      ⇒ เศษปลายม้วนไม่ใช่ของตาย · ฟันใช้แทนกันได้ทั้งข้ามความยาวและข้ามม้วน
      ⇒ ม้วนที่เหลือน้อยไม่ใช่ปัญหา "ห้ามขาย" แต่เป็นสัญญาณ **"ต้องสั่งของ"**
      **คนละคำสั่งกันคนละทิศ** — ห้ามขาย = ปิดรายได้ · สั่งของ = รักษารายได้
      บทเรียน: เห็นตัวเลขน้อยแล้วรีบสรุปว่าเป็นความเสี่ยง ทั้งที่ยังไม่รู้ว่าของเติมได้ยังไง

   ⚠️ หน่วยในคลังคือ **"ฟัน" ไม่ใช่ "ม้วน"** (ยืนยัน 5 ก.ย. 2569 จากกล่องจริง + สูตรในระบบ)
      3/8 (3636 · 3623 · 3652) = 820 ฟัน/ม้วน · 404 (3860) = 740 · 325 = 920
      `03386` ที่คลังบอก 19,917 คือ **24.3 ม้วน** ไม่ใช่ 19,917 ม้วน
      ⇒ เอาจำนวนฟันต่อม้วนจากสูตร `<รหัส>-roll` **ห้ามฝังเลข 820 ไว้ในโค้ด**
        มีสามค่าแล้วตอนนี้ และวันหน้าอาจมีอีก

   ⚠️ **ยอดใช้ต้องนับผ่านสูตร** — ขายโซ่ 22 ฟันหนึ่งเส้น = ใช้ฟันไป 22 ไม่ใช่ 1
      นับหัวรายการตรง ๆ จะได้ยอดใช้ต่ำกว่าจริงหลายสิบเท่า แล้วบอกว่าของพอขายอีกเป็นปี
   ⚠️ ไม่เคยขายเลยในช่วงที่ดู ⇒ `daysLeft` เป็น **null ห้ามเป็น 0 หรือ Infinity**
      0 แปลว่า "หมดพรุ่งนี้" · Infinity แปลว่า "ไม่มีวันหมด" — ทั้งคู่ผิดคนละทิศ
      ความจริงคือ "ยังตอบไม่ได้"
   ───────────────────────────────────────────────────────────────────────────── */
export async function reorderPlan(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const days = Math.max(7, Math.min(365, num(o.days) || 90));

  // วันแบบไทย — order_date เก็บเป็นวันไทยอยู่แล้ว จึงเทียบสตริงตรง ๆ ได้
  const thai = (offset = 0) =>
    new Date(Date.now() + 7 * 3600e3 - offset * 86400e3).toISOString().slice(0, 10);
  const to = thai(0);
  const from = thai(days);

  const links = await coreQuery(`SELECT bundle_sku, sku, qty FROM bundle_items`);
  const parentOf = new Map(); // รหัสชุด → { parent, per }
  const kidsOf = new Map();   // ม้วนแม่ → [รหัสชุด]
  const perRoll = new Map();  // ม้วนแม่ → ฟันต่อม้วน (จากสูตร -roll)
  for (const l of links) {
    const b = String(l.bundle_sku ?? "");
    const p = String(l.sku ?? "");
    const per = num(l.qty);
    if (!b || !p || !(per > 0)) continue;
    parentOf.set(b, { parent: p, per });
    if (!kidsOf.has(p)) kidsOf.set(p, []);
    kidsOf.get(p).push(b);
    if (b === `${p}-roll`) perRoll.set(p, per);
  }

  const CANCEL =
    `o.status NOT LIKE '%cancel%' AND o.status NOT LIKE '%void%' AND o.status NOT LIKE '%ยกเลิก%'`;
  const sold = await coreQuery(
    `SELECT oi.sku AS sku, SUM(oi.qty) AS qty
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.order_date >= ? AND o.order_date <= ? AND ${CANCEL}
     GROUP BY oi.sku`,
    [from, to]
  );
  // ฟันที่ใช้ไปต่อม้วนแม่ — ขายชุดไหนก็แปลงกลับเป็นฟันด้วยสูตรของชุดนั้น
  const usedTeeth = new Map();
  const add = (p, n) => usedTeeth.set(p, (usedTeeth.get(p) ?? 0) + n);
  for (const s of sold) {
    const sku = String(s.sku ?? "");
    const q = num(s.qty);
    if (!sku || !(q > 0)) continue;
    const link = parentOf.get(sku);
    if (link) add(link.parent, q * link.per);          // ขายเป็นชุด/ม้วน ⇒ คูณสูตร
    else if (kidsOf.has(sku)) add(sku, q);             // ขายฟันตรง ๆ (หายาก แต่กันไว้)
  }

  const stock = new Map(
    (await coreQuery(`SELECT sku, name, available FROM products WHERE available IS NOT NULL`))
      .map((r) => [String(r.sku), { name: String(r.name ?? ""), have: num(r.available) }])
  );

  const rows = [];
  for (const [parent, kids] of kidsOf) {
    const st = stock.get(parent);
    if (!st) continue;
    const used = usedTeeth.get(parent) ?? 0;
    const perDay = used / days;
    const tpr = perRoll.get(parent) ?? null;
    rows.push({
      sku: parent,
      name: st.name,
      teeth: st.have,
      teethPerRoll: tpr,
      // ⚠️ ไม่รู้ฟันต่อม้วน ⇒ null ห้ามเดา 820 · มีสามค่าแล้ว และวันหน้าอาจมีอีก
      rolls: tpr ? Math.round((st.have / tpr) * 100) / 100 : null,
      listings: kids.filter((k) => !k.endsWith("-roll")).length,
      teethUsed: Math.round(used * 10) / 10,
      teethPerDay: Math.round(perDay * 100) / 100,
      /* พอขายอีกกี่วัน — ไม่เคยขายในช่วงที่ดู ⇒ null (ยังตอบไม่ได้)
         ของติดลบอยู่แล้ว ⇒ 0 (หมดไปแล้วจริง ๆ ไม่ใช่ "ยังตอบไม่ได้") */
      daysLeft: perDay > 0 ? Math.max(0, Math.round((st.have / perDay) * 10) / 10) : null,
    });
  }
  /* เรียง: ของที่จะหมดก่อนขึ้นก่อน · ตัวที่ยังตอบไม่ได้ไปท้าย
     ⚠️ **ห้ามเอา null ไปเรียงปนกับตัวเลข** — JS เทียบ null กับเลขได้เงียบ ๆ แล้วลำดับมั่ว */
  rows.sort((a, b) => {
    if (a.daysLeft === null && b.daysLeft === null) return a.teeth - b.teeth;
    if (a.daysLeft === null) return 1;
    if (b.daysLeft === null) return -1;
    return a.daysLeft - b.daysLeft;
  });

  return {
    from,
    to,
    days,
    parents: rows.length,
    neverSold: rows.filter((r) => r.daysLeft === null).length,
    scope:
      `ยอดใช้คิดจากใบขายจริงช่วง ${from} ถึง ${to} (${days} วัน) ไม่รวมใบยกเลิก · ` +
      "หน่วยเป็น 'ฟัน' ไม่ใช่ม้วน — ขายโซ่ 22 ฟันหนึ่งเส้นคือใช้ฟันไป 22 · " +
      "daysLeft = null แปลว่าช่วงนี้ไม่มีการขายเลย ยังตอบไม่ได้ ไม่ใช่ 'ไม่มีวันหมด'",
    note:
      "เศษปลายม้วนต่อกับม้วนใหม่ได้ ⇒ ม้วนที่เหลือน้อยไม่ใช่เหตุให้ปิดขาย แต่เป็นสัญญาณให้สั่งของ",
    rows,
  };
}
