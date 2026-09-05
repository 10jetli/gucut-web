// สต็อกที่ลงขายบน TikTok Shop เทียบกับคลังเงา — อ่านอย่างเดียว ไม่เขียนกลับ TikTok
//
// ฝาแฝดของ `shopee-stock.mjs` (ส่วน shopeeStock + shopeeStockCompare)
// ⚠️ **สองไฟล์นี้ต้องแก้ตามกันเสมอ** — ตรรกะ "สูตรชุด" กับ "ภาพถ่ายสต็อก" เขียนซ้ำกันอยู่
//    ยังไม่ดึงออกมาเป็นตัวกลางเพราะฝั่ง Shopee เป็นเส้นที่ร้านใช้จริงทุกวัน แตะแล้วเสี่ยง
//    ⇒ วันไหนต้องแก้ตรรกะร่วม ให้ดึงออกมาเป็นไฟล์กลางทีเดียว **ห้ามแก้ข้างเดียว**
//
// ⚠️ ตัวเลขจาก TikTok คือ "ของที่ลงขายอยู่" เท่านั้น (status ACTIVATE)
//    ของที่ปิดขายไว้ไม่อยู่ในนี้ ⇒ "ไม่เจอใน TikTok" ≠ "ไม่มีขายบน TikTok"
import { coreQuery, coreReady } from "./coredb.mjs";
import { validToken, shopCall, ensureShop, VERSION } from "./tiktok.mjs";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ชื่อฟิลด์จำนวนคงเหลือใน sku ของ TikTok — ยังไม่ได้เห็นกับตา จึงประกาศเป็นรายการ
   ⚠️ กติกาเดียวกับ tiktok-orders.mjs: หาไม่เจอ = **รายงานออกมา** ห้ามคืน 0 เงียบ ๆ
      (0 ที่แปลว่า "ของหมด" กับ 0 ที่แปลว่า "หาชื่อฟิลด์ไม่เจอ" หน้าตาเหมือนกันเป๊ะ
       และตัวหลังจะทำให้แผนดันสต็อกสั่ง "ปิดการขาย" ทั้งร้าน) */
const QTY_PATHS = [
  (s) => (Array.isArray(s?.inventory) ? s.inventory.reduce((n, i) => n + num(i?.quantity), 0) : undefined),
  (s) => s?.stock_infos?.reduce?.((n, i) => n + num(i?.available_stock), 0),
  (s) => s?.quantity,
  (s) => s?.available_stock,
];

const readQty = (s) => {
  for (const f of QTY_PATHS) {
    let v;
    try {
      v = f(s);
    } catch {
      v = undefined;
    }
    if (v !== undefined && v !== null) return num(v);
  }
  return undefined;
};

/**
 * รายการที่ลงขายอยู่บน TikTok พร้อมจำนวนคงเหลือ
 * คืน { rows, unmapped } — `unmapped` ไม่ว่าง = อ่านจำนวนไม่ได้ **ห้ามเอาไปคิดแผนดัน**
 */
export async function tiktokStock() {
  const t = await validToken();
  if (!t) return { skip: "ยังไม่ได้เชื่อมร้าน TikTok" };
  await ensureShop();

  const rows = [];
  const unmapped = new Set();
  let pageToken = "";
  for (let p = 0; p < 25; p++) {
    const d = await shopCall(`/product/${VERSION}/products/search`, {
      method: "POST",
      query: { page_size: "100", ...(pageToken ? { page_token: pageToken } : {}) },
      body: { status: "ACTIVATE" },
    });
    for (const it of d?.data?.products ?? []) {
      for (const s of it?.skus ?? []) {
        const sku = String(s?.seller_sku ?? "").trim();
        if (!sku) continue;
        const qty = readQty(s);
        if (qty === undefined) unmapped.add("sku.quantity");
        rows.push({ sku, name: String(it?.title ?? "").slice(0, 120), qty: num(qty) });
      }
    }
    pageToken = d?.data?.next_page_token || "";
    if (!pageToken) break;
  }
  return { rows, unmapped: [...unmapped] };
}

/** ส่องชื่อฟิลด์จริงของสินค้า — **คืนเฉพาะชื่อ ไม่คืนค่า** (คู่กับ tiktokOrderShape) */
export async function tiktokProductShape() {
  const t = await validToken();
  if (!t) return { skip: "ยังไม่ได้เชื่อมร้าน TikTok" };
  await ensureShop();
  const d = await shopCall(`/product/${VERSION}/products/search`, {
    method: "POST",
    query: { page_size: "1" },
    body: { status: "ACTIVATE" },
  });
  const p = (d?.data?.products || [])[0];
  if (!p) return { note: "ไม่มีสินค้าที่ลงขายอยู่เลย" };
  const s = (p.skus || [])[0];
  return {
    productKeys: Object.keys(p).sort(),
    skuKeys: s ? Object.keys(s).sort() : [],
    // ชั้นในของ sku ที่น่าจะเก็บจำนวน — บอกแค่ว่ามีคีย์อะไร
    inventoryKeys: Array.isArray(s?.inventory) && s.inventory[0] ? Object.keys(s.inventory[0]).sort() : [],
  };
}

/**
 * เทียบสต็อก TikTok กับภาพถ่ายคลังของเรา
 * โครงผลลัพธ์ตั้งใจให้เหมือน shopeeStockCompare เพื่อให้ stock-push ใช้ตัววางแผนตัวเดียวกันได้
 */
export async function tiktokStockCompare() {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const got = await tiktokStock();
  if (got.skip) return { skip: got.skip };
  /* ⚠️ อ่านจำนวนไม่ได้ = **หยุดทั้งการเทียบ** ห้ามเทียบต่อด้วยเลข 0
      ปล่อยผ่าน = ทุกรหัสจะดูเหมือน "ของหมดบน TikTok" แล้วแผนดันจะสั่งเปิดขายทั้งร้าน */
  if (got.unmapped.length) {
    return { skip: `อ่านจำนวนคงเหลือของ TikTok ไม่ได้ (${got.unmapped.join(", ")})` };
  }
  const rows = got.rows;

  const dayRows = await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`);
  const day = dayRows[0]?.d;
  if (!day) return { note: "ยังไม่มีภาพถ่ายสต็อกในคลังเรา", tiktokSkus: rows.length };

  const [snapRows, rec] = await Promise.all([
    coreQuery(`SELECT sku, qty FROM stock_snapshots WHERE day = ?`, [day]),
    coreQuery(
      `SELECT b.sku AS sku, i.sku AS base, i.qty AS per
       FROM bundles b JOIN bundle_items i ON i.bundle_sku = b.sku
       WHERE b.active = 1`
    ).catch(() => []), // ไม่มีตารางสูตร = ถอยไปวิธีเดิม ห้ามล้ม
  ]);
  const snap = new Map(snapRows.map((r) => [String(r.sku).trim(), num(r.qty)]));

  /* สูตรชุด — เหมือนฝั่ง Shopee เป๊ะ (ชุดหลายชิ้นคิดแบบนี้ไม่ได้ จึงข้าม) */
  const recipe = new Map();
  {
    const count = new Map();
    for (const r of rec) count.set(String(r.sku), (count.get(String(r.sku)) || 0) + 1);
    for (const r of rec) {
      const k = String(r.sku).trim();
      if (count.get(k) !== 1) continue;
      const per = num(r.per);
      if (per > 0 && r.base) recipe.set(k, { base: String(r.base).trim(), per });
    }
  }

  const diff = [];
  const missingSample = [];
  let same = 0;
  let missing = 0;
  let viaRecipe = 0;
  for (const r of rows) {
    const rc = recipe.get(r.sku);
    let core;
    if (rc && snap.has(rc.base)) {
      core = Math.floor(num(snap.get(rc.base)) / rc.per);
      viaRecipe++;
    } else if (snap.has(r.sku)) {
      core = num(snap.get(r.sku));
    } else {
      missing++;
      if (missingSample.length < 20) missingSample.push({ sku: r.sku, name: r.name });
      continue;
    }
    if (core === num(r.qty)) same++;
    else diff.push({ sku: r.sku, name: r.name, tiktok: num(r.qty), core });
  }

  return {
    day,
    tiktokSkus: rows.length,
    same,
    missing,
    viaRecipe,
    diffCount: diff.length,
    diff,
    missingSample,
    /* ⚠️ ตัวตรวจตัวเอง — ทุกรหัสต้องตกกองใดกองหนึ่งพอดี (partial-coverage-reported-as-full) */
    bucketsAddUp: same + diff.length + missing === rows.length,
  };
}

/** บรรทัดเดียวสำหรับ Telegram รายวัน (คืน null ถ้ายังเทียบไม่ได้) */
export async function tiktokStockLine() {
  const c = await tiktokStockCompare().catch(() => null);
  if (!c || c.skip || c.note) return null;
  return (
    `🎵 สต็อก TikTok vs คลัง (${c.day}): ตรง ${c.same} · ต่าง ${c.diffCount} · ` +
    `คลังไม่รู้จัก ${c.missing} จาก ${c.tiktokSkus} รหัสที่ลงขายอยู่`
  );
}
