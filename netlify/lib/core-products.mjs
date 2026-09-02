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
    });
  }

  // เทียบก่อนเขียน — ชื่อสินค้าแทบไม่เปลี่ยน เขียนทับทุกรอบคือเผาโควตาเปล่า ๆ
  const prev = new Map(
    (
      await coreQuery(
        `SELECT sku, name, sellprice, purchase_price, product_type, active, unit, onhand, available
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
      num(p.available) !== r.available
    );
  });

  for (let i = 0; i < changed.length; i += 80) {
    const values = changed
      .slice(i, i + 80)
      .map(
        (r) =>
          `(${esc(r.sku)},${esc(r.name)},${r.price},${r.buy},${r.type},${r.active},` +
          `${esc(r.unit)},${r.onhand},${r.available},datetime('now'))`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO products
         (sku,name,sellprice,purchase_price,product_type,active,unit,onhand,available,updated_at)
       VALUES ${values}
       ON CONFLICT(sku) DO UPDATE SET name=excluded.name, sellprice=excluded.sellprice,
         purchase_price=excluded.purchase_price, product_type=excluded.product_type,
         active=excluded.active, unit=excluded.unit, onhand=excluded.onhand,
         available=excluded.available, updated_at=excluded.updated_at`
    );
  }
  return { fetched: rows.length, written: changed.length, skipped: rows.length - changed.length };
}
