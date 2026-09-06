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
/* ⚠️ **บทเรียน 6 ก.ย. 2569 (ผู้ตรวจจับได้ก่อน deploy)** — ของเดิมเขียนว่า
      `Array.isArray(s?.inventory) ? s.inventory.reduce(...) : undefined`
   `Array.isArray([])` เป็น **true** ⇒ อาเรย์ว่างคืน **0 ไม่ใช่ undefined**
   และถ้าทุกสมาชิกไม่มีคีย์ `quantity` `num(undefined)` ก็ให้ 0 อีกเหมือนกัน
   ⇒ `unmapped` ว่าง ⇒ ตัวกันที่เขียนไว้ **ไม่ทำงานเลย** ⇒ ทุกรหัสกลายเป็น "ของหมด"
     แล้วแผนดันสต็อกจะสั่ง reopen ทั้งร้านจากเลขที่แต่งขึ้น
   ⇒ **ต้องแยก "มีคีย์แล้วค่าเป็น 0" ออกจาก "ไม่มีคีย์ให้อ่าน" ตั้งแต่ในตัวอ่าน**
     นับเฉพาะสมาชิกที่ "มีคีย์นั้นจริง" ถ้าไม่มีสักตัว = อ่านไม่ได้ (undefined) */
const sumOf = (arr, key) => {
  if (!Array.isArray(arr) || !arr.length) return undefined;
  let seen = 0;
  let total = 0;
  for (const it of arr) {
    if (it && it[key] !== undefined && it[key] !== null) {
      seen++;
      total += num(it[key]);
    }
  }
  return seen ? total : undefined;
};

const QTY_PATHS = [
  (s) => sumOf(s?.inventory, "quantity"),
  (s) => sumOf(s?.stock_infos, "available_stock"),
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
  let noSku = 0;
  let pageToken = "";
  /* ⚠️ **หลุดเพดานหน้าแล้วต้องโยน error ห้ามออกจากลูปเงียบ ๆ**
      คืนของบางส่วนเหมือนเป็นของครบ = ทุกตัวนับข้างล่างผิดหมดโดยไม่มีอะไรฟ้อง
      (ฝั่ง Shopee เรียนบทเรียนนี้ไปแล้วและโยน error — ของใหม่ไม่ได้ลอกส่วนนี้มา) */
  const MAX_PAGES = 25;
  for (let p = 0; p <= MAX_PAGES; p++) {
    if (p === MAX_PAGES) {
      throw new Error(`สินค้า TikTok เกิน ${MAX_PAGES * 100} รหัส — ต้องขยายเพดานหน้า ไม่ใช่ตัดทิ้งเงียบ ๆ`);
    }
    const d = await shopCall(`/product/${VERSION}/products/search`, {
      method: "POST",
      query: { page_size: "100", ...(pageToken ? { page_token: pageToken } : {}) },
      body: { status: "ACTIVATE" },
    });
    for (const it of d?.data?.products ?? []) {
      for (const s of it?.skus ?? []) {
        const sku = String(s?.seller_sku ?? "").trim();
        // ⚠️ ทิ้งได้ แต่ **ต้องนับ** — ไม่งั้น tiktokSkus ต่ำกว่าจริงและไม่มีใครรู้ว่ามีของผูกรหัสไม่ได้
        if (!sku) { noSku++; continue; }
        const qty = readQty(s);
        if (qty === undefined) unmapped.add("sku.quantity");
        rows.push({ sku, name: String(it?.title ?? "").slice(0, 120), qty: num(qty) });
      }
    }
    pageToken = d?.data?.next_page_token || "";
    if (!pageToken) break;
  }
  return { rows, unmapped: [...unmapped], noSku };
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
  if (!p) return { skip: "ไม่มีสินค้าที่ลงขายอยู่เลย" };
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
  const noSku = num(got.noSku);
  const rows = got.rows;

  const dayRows = await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`);
  const day = dayRows[0]?.d;
  if (!day) return { skip: "ยังไม่มีภาพถ่ายสต็อกในคลังเรา", tiktokSkus: rows.length };

  const [snapRows, rec] = await Promise.all([
    coreQuery(`SELECT sku, qty FROM stock_snapshots WHERE day = ?`, [day]),
    coreQuery(
      `SELECT b.sku AS sku, i.sku AS base, i.qty AS per
       FROM bundles b JOIN bundle_items i ON i.bundle_sku = b.sku
       WHERE b.active = 1`
    ).catch((e) => {
      /* 🔴 **แยก "ไม่มีตารางสูตร" (ปกติ) ออกจาก "ถามไม่ได้" (ผิดปกติ)** (แก้ 6 ก.ย. 2569)
          เดิมกลืนเป็น `[]` ทั้งสองกรณี ⇒ D1 สะดุดชั่วคราว ⇒ สูตรชุดหายทั้งกอง
          ⇒ โซ่ตัดขาย/ชุด KINGKONG ตกไปเป็น "คลังไม่รู้จัก" ⇒ Telegram รายวันส่งว่า
            "คลังไม่รู้จัก 148 จาก 1,926 รหัสที่ลงขายอยู่" **ทั้งที่คลังรู้จักครบ**
          และตัวตรวจตัวเอง `bucketsAddUp` ยังเป็น true (ทุกกองบวกได้ครบ) ⇒ ไม่มีอะไรฟ้อง
          ⇒ ไม่มีตาราง = ถอยไปวิธีเดิมเงียบ ๆ ได้ · ถามไม่ได้ = **ต้องติดธงไปกับผล** */
      const msg = String(e?.message || e);
      return /no such table/i.test(msg) ? [] : { __err: msg.slice(0, 160) };
    }),
  ]);
  /* ถามสูตรชุดไม่ได้ = ต้องบอกออกไป ห้ามให้ผลดูเหมือนตรวจครบ */
  const recipeErr = rec && !Array.isArray(rec) ? rec.__err : null;
  const recRows = Array.isArray(rec) ? rec : [];
  const snap = new Map(snapRows.map((r) => [String(r.sku).trim(), num(r.qty)]));

  /* สูตรชุด — เหมือนฝั่ง Shopee เป๊ะ (ชุดหลายชิ้นคิดแบบนี้ไม่ได้ จึงข้าม) */
  const recipe = new Map();
  {
    const count = new Map();
    for (const r of recRows) count.set(String(r.sku), (count.get(String(r.sku)) || 0) + 1);
    for (const r of recRows) {
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
    // ⚠️ รหัสที่ผูก seller_sku ไม่ได้ — ไม่ได้อยู่ในตัวหาร แต่ต้องเห็น
    noSellerSku: noSku,
    same,
    missing,
    viaRecipe,
    diffCount: diff.length,
    diff,
    missingSample,
    /* ⚠️ ตัวตรวจตัวเอง — ทุกรหัสต้องตกกองใดกองหนึ่งพอดี (partial-coverage-reported-as-full) */
    bucketsAddUp: same + diff.length + missing === rows.length,
    /* ⚠️ ถามตารางสูตรชุดไม่ได้ ⇒ กอง "คลังไม่รู้จัก" สูงเกินจริง (สินค้าชุดตกมากองนี้หมด)
        **ห้ามอ่านตัวเลขนั้นเป็น "ของหาย"** · null = ถามได้ปกติ */
    recipeError: recipeErr,
  };
}

/** บรรทัดเดียวสำหรับ Telegram รายวัน (คืน null ถ้ายังเทียบไม่ได้) */
export async function tiktokStockLine() {
  const c = await tiktokStockCompare().catch(() => null);
  /* 🔴 **ห้ามเช็ค `c.note` ตรงนี้อีก** — เหตุผลเดียวกับใน shopee-stock.mjs
      `note` = คำอธิบายผลที่สำเร็จ · `skip` = ทำต่อไม่ได้ **ห้ามปนกัน**
      ฝั่ง Lazada โดนคลาสนี้จริงแล้ว 6 ก.ย. 2569 (แผนดันสต็อกไม่เคยถูกคำนวณ) */
  if (!c || c.skip) return null;
  /* ⚠️ เหมือนฝั่ง Shopee — ถามสูตรชุดไม่ได้ = ตัวเลข "คลังไม่รู้จัก" สูงเกินจริง ต้องเขียนกำกับ */
  return (
    `🎵 สต็อก TikTok vs คลัง (${c.day}): ตรง ${c.same} · ต่าง ${c.diffCount} · ` +
    `คลังไม่รู้จัก ${c.missing} จาก ${c.tiktokSkus} รหัสที่ลงขายอยู่` +
    (c.recipeError ? " | ⚠️ ถามสูตรชุดไม่ได้ ตัวเลขนี้สูงเกินจริง" : "")
  );
}
