// ต่อ Lazada Open Platform — ร้านทำแอปใช้เอง (Seller In-house APP)
//
// ⚠️ **ลายเซ็นคิดคนละแบบกับ Shopee และ TikTok ทั้งหมด อย่าเอาสูตรมาปนกัน**
//    Lazada: HMAC-SHA256 ของ  path + (ชื่อพารามิเตอร์+ค่า เรียงตามตัวอักษร)  ด้วย app_secret
//            แล้วทำเป็น **ตัวพิมพ์ใหญ่**
//    (Shopee ใช้ partner_id|path|timestamp · TikTok เอา secret หุ้มหัวท้าย — คนละเรื่องเลย)
//
// ⚠️ **timestamp เป็นมิลลิวินาที** ไม่ใช่วินาทีเหมือน TikTok
// ⚠️ access_token อายุ **7 วัน** · refresh_token 30 วัน ⇒ ต้องต่ออายุ ไม่งั้นหลุดทุกสัปดาห์
// ⚠️ โควตา 10,000 ครั้ง/วัน — ดึงทั้งคลัง 1,988 ตัวได้สบาย แต่ห้ามยิงทุกครั้งที่เปิดจอ
import { createHmac } from "node:crypto";
import { getStore } from "@netlify/blobs";

const API = "https://api.lazada.co.th/rest";
const AUTH = "https://auth.lazada.com/rest";
const STORE = "gucut-lazada";

export const lazadaReady = () =>
  Boolean(process.env.LAZADA_APP_KEY && process.env.LAZADA_APP_SECRET);

const appKey = () => process.env.LAZADA_APP_KEY || "";
const appSecret = () => process.env.LAZADA_APP_SECRET || "";

/** ลายเซ็นแบบ Lazada — path + คู่คีย์ค่าที่เรียงแล้ว ต่อกันเป็นสตริงเดียว */
export function sign(path, params) {
  const keys = Object.keys(params).sort();
  const base = path + keys.map((k) => k + params[k]).join("");
  return createHmac("sha256", appSecret()).update(base).digest("hex").toUpperCase();
}

/** ลิงก์ให้เจ้าของร้านกดอนุญาต (ทำครั้งเดียว) */
export function authLink(state = "gucut") {
  const q = new URLSearchParams({
    response_type: "code",
    force_auth: "true",
    redirect_uri: "https://gucut.com/api/lazada/callback",
    client_id: appKey(),
    state,
  });
  return `https://auth.lazada.com/oauth/authorize?${q}`;
}

const store = () => getStore({ name: STORE, consistency: "strong" });
export const loadToken = () => store().get("token", { type: "json" }).catch(() => null);
// ⚠️ ต่ออายุแล้ว refresh_token เปลี่ยนตัวใหม่ ต้องเขียนทับเสมอ
//    ไม่เขียนทับ = ครั้งถัดไปใช้ตัวที่ถูกยกเลิกแล้ว หลุดทั้งระบบ ต้องให้ร้านกดอนุญาตใหม่
export const saveToken = (t) =>
  store().setJSON("token", { ...t, savedAt: new Date().toISOString() });

async function callAuth(path, extra) {
  const params = { app_key: appKey(), timestamp: String(Date.now()), sign_method: "sha256", ...extra };
  params.sign = sign(path, params);
  const res = await fetch(`${AUTH}${path}?${new URLSearchParams(params)}`, {
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  // ⚠️ Lazada ตอบ 200 เสมอ แล้วบอกความผิดพลาดใน code ⇒ เช็ค code ไม่ใช่ status
  if (data?.code && data.code !== "0") {
    throw new Error(`${data.code}: ${data.message || data.detail || ""}`.trim());
  }
  return data;
}

/** แลก code ที่ได้ตอนร้านกดอนุญาต เป็น access_token ครั้งแรก */
export async function exchangeCode(code) {
  const d = await callAuth("/auth/token/create", { code });
  await saveToken({
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: Date.now() + Number(d.expires_in || 0) * 1000,
    account: d.account,
    country: d.country,
  });
  return d;
}

/** ต่ออายุก่อนหมด — เรียกเองอัตโนมัติใน validToken() */
export async function refresh(t) {
  const d = await callAuth("/auth/token/refresh", { refresh_token: t.refreshToken });
  const next = {
    accessToken: d.access_token,
    refreshToken: d.refresh_token || t.refreshToken,
    expiresAt: Date.now() + Number(d.expires_in || 0) * 1000,
    account: d.account || t.account,
    country: d.country || t.country,
  };
  await saveToken(next);
  return next;
}

/** token ที่ใช้ได้จริง — ต่ออายุให้เองถ้าใกล้หมด (เหลือน้อยกว่า 1 วัน) */
export async function validToken() {
  const t = await loadToken();
  if (!t?.accessToken) return null;
  if (Number(t.expiresAt || 0) - Date.now() > 864e5) return t;
  try {
    return await refresh(t);
  } catch {
    return t; // ต่ออายุไม่ได้ก็ลองใช้ตัวเดิมไปก่อน — ดีกว่าตัดขาดทันที
  }
}

/** เรียก API ของร้าน */
export async function shopCall(path, extra = {}) {
  const t = await validToken();
  if (!t) throw new Error("ยังไม่ได้เชื่อมร้าน — ให้เจ้าของร้านกดอนุญาตก่อนที่ /api/lazada/auth");
  const params = {
    app_key: appKey(),
    timestamp: String(Date.now()),
    sign_method: "sha256",
    access_token: t.accessToken,
    ...extra,
  };
  params.sign = sign(path, params);
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json().catch(() => ({}));
  if (data?.code && data.code !== "0") {
    throw new Error(`${data.code}: ${data.message || data.detail || ""}`.trim());
  }
  return data;
}

/** รหัสสินค้าที่ "กำลังลงขายอยู่จริง" บน Lazada
 *  ⚠️ ใช้รายการสินค้าจริง ไม่ใช่ประวัติการขาย — ของที่ถอดออกแล้วต้องไม่ติดมาด้วย
 *  ⚠️ Lazada แยก active / inactive / deleted ⇒ ขอเฉพาะ active */
/*  ⚠️ **ต้องดึงหลายหน้าพร้อมกัน ไม่งั้นฟังก์ชันตายก่อนดึงจบ** — พลาดมาแล้ว 4 ก.ย. 2569
       Lazada จำกัดหน้าละ 50 (ขอมากกว่านี้ไม่ได้) ร้านมีสินค้าหลายร้อย ⇒ ไล่ทีละหน้า
       ใช้เวลาเกิน 26 วินาทีที่ Netlify ให้ **ตอบ 502 เปล่า ๆ ไม่มีข้อความบอกสาเหตุ**
    ⚠️ **ดึงไม่ครบต้องโยน error ห้ามคืนของที่ได้มาบางส่วน** — ปลายทางเอาไปตอบคำถาม
       "รหัสนี้ลงขายอยู่ไหม" ของที่หายเพราะดึงไม่ทันจะกลายเป็น "ไม่ได้ลงขาย"
       ซึ่งหน้าตาเหมือนคำตอบจริงทุกประการ · ยอมขึ้นว่า "เช็คไม่ได้" ดีกว่าตอบผิด  */
const PAGE = 50;
const CONCURRENCY = 6;

/* ── 🔎 ตรวจ "รูปร่าง" ของคำตอบที่ขอบระบบ ก่อนเอาไปใช้ (12 ก.ย. 2569) ──────────────
   ทำไมต้องมี: ของเดิมเขียน `d?.data?.products || []` ⇒ **วันที่ Lazada เปลี่ยนชื่อฟิลด์
   หรือห่อข้อมูลใหม่ แต่ยังตอบ 200 เราจะได้กองว่างเงียบ ๆ แล้วเดินต่อจนได้ผล "ศูนย์ครบทุกช่อง"
   ซึ่งหน้าตาเหมือนคำตอบที่สมบูรณ์** (คลาสเดียวกับที่เจ็บมาสามรอบวันเดียว: lazada · shopee · tiktok)

   ⚠️ ด่าน "0 แถว = หยุด" ที่ใส่ไว้ใน lazadaStockCompare จับได้เฉพาะกรณี **ว่างทั้งกอง**
      ถ้าเขาเปลี่ยนชื่อฟิลด์ระดับแถวแต่ยังส่งของมา เราจะอ่านผิด **ทีละแถว** แบบที่ด่านนั้นมองไม่เห็น
      ⇒ ตัวนี้จึงตรวจถึงระดับ sku ไม่ใช่แค่ว่ามีของหรือไม่มี

   🔑 **ชนิดข้อมูลที่ตรวจมาจากการวัดของจริง ไม่ใช่การเดา** (ยิง /api/lazada/fields 12 ก.ย. 2569)
      total_products: 1724 (number) · Available/quantity/price/SkuId = number จริง (ไม่ใช่สตริง)
      SellerSku/Status/ShopSku = string
      ⇒ ถ้าวันหนึ่งเลขกลายเป็นสตริง นั่นคือ **ของเปลี่ยน** ไม่ใช่เรื่องปกติ ⇒ ต้องหยุดให้รู้

   ⚠️ `SellerSku` ว่างได้ (ของจริงมี) — โค้ดที่ใช้ข้ามแถวว่างอยู่แล้วตั้งแต่เดิม
      ⇒ ตรวจว่า "ช่องมีอยู่และเป็นสตริง" **ไม่ใช่** ว่าต้องไม่ว่าง (คนละเรื่องกัน)
   🚫 ไม่ลงไลบรารีตรวจ schema — กฎคือเขียนเองได้ในไม่กี่บรรทัดห้ามเพิ่มของใน package.json
      (Netlify ต้องลงตามทุกครั้งที่ build) · ตัวนี้ ~30 บรรทัด ไม่คุ้มที่จะพึ่งของนอก */
const MAX_REPORT = 5;   // รายงานตัวอย่างไม่เกินนี้ แล้วบอกยอดรวม — ข้อความยาวเกินคนไม่อ่าน

function shapeProblems(d) {
  const bad = [];
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const note = (path, msg) => { if (bad.length < MAX_REPORT) bad.push(`${path} ${msg}`); };

  if (!isObj(d)) return { problems: [`คำตอบทั้งก้อนไม่ใช่ออบเจกต์ (ได้ ${typeof d})`], count: 1 };
  if (!isObj(d.data)) return { problems: [`data ${d.data === undefined ? "หาย" : `ไม่ใช่ออบเจกต์ (ได้ ${Array.isArray(d.data) ? "array" : typeof d.data})`}`], count: 1 };
  if (!Array.isArray(d.data.products)) {
    return { problems: [`data.products ${d.data.products === undefined ? "หาย" : `ไม่ใช่ array (ได้ ${typeof d.data.products})`}`], count: 1 };
  }
  /* total_products ใช้คิดจำนวนหน้า — หายแล้วจะ "ไล่หน้าเดียวแล้วจบ" โดยดูเหมือนปกติ */
  if (typeof d.data.total_products !== "number" || !Number.isFinite(d.data.total_products)) {
    note("data.total_products", d.data.total_products === undefined
      ? "หาย (ใช้คิดจำนวนหน้า — หายแล้วจะไล่หน้าไม่ครบแบบเงียบ ๆ)"
      : `ต้องเป็น number แต่ได้ ${typeof d.data.total_products}`);
  }

  let count = bad.length;
  d.data.products.forEach((p, i) => {
    const at = `data.products[${i}]${isObj(p) && (p.item_id ?? p.ItemId) !== undefined ? `(item ${p.item_id ?? p.ItemId})` : ""}`;
    if (!isObj(p)) { count++; note(at, `ไม่ใช่ออบเจกต์ (ได้ ${typeof p})`); return; }
    if (!Array.isArray(p.skus)) { count++; note(`${at}.skus`, p.skus === undefined ? "หาย" : `ไม่ใช่ array (ได้ ${typeof p.skus})`); return; }
    p.skus.forEach((sk, j) => {
      const sat = `${at}.skus[${j}]`;
      if (!isObj(sk)) { count++; note(sat, `ไม่ใช่ออบเจกต์ (ได้ ${typeof sk})`); return; }
      const name = typeof sk.SellerSku === "string" ? ` (SellerSku "${sk.SellerSku}")` : "";
      for (const f of ["SellerSku", "Status"]) {
        if (typeof sk[f] !== "string") {
          count++; note(`${sat}.${f}${name}`, sk[f] === undefined ? "หาย" : `ต้องเป็น string แต่ได้ ${typeof sk[f]}`);
        }
      }
      for (const f of ["Available", "quantity", "SkuId"]) {
        if (typeof sk[f] !== "number" || !Number.isFinite(sk[f])) {
          count++; note(`${sat}.${f}${name}`, sk[f] === undefined ? "หาย" : `ต้องเป็น number แต่ได้ ${typeof sk[f]}${typeof sk[f] === "string" ? ` ("${String(sk[f]).slice(0, 20)}")` : ""}`);
        }
      }
    });
  });
  return { problems: bad, count };
}

/** ดึงสินค้าหนึ่งหน้า + **ตรวจรูปร่างก่อนส่งต่อ**
 *  @param call แทนที่ได้เพื่อทดสอบ — ขอบเครือข่ายอย่างเดียว ตัวตรวจกับตัวแปลงเป็นของจริง
 *             (แพตเทิร์นเดียวกับ collectLazadaRows/collectShopeeItemIds — กฎ test-must-hit-the-path)
 *  🔴 รูปร่างไม่ตรง = **โยน error บอกชื่อฟิลด์** ห้ามข้ามแถวเงียบ ห้ามเดาค่าแทน
 *     เพราะปลายทางเอาไปตอบว่า "ของเหลือเท่าไหร่ / ต้องดันสต็อกไหม" — เดาแล้วเขียนออกนอกระบบได้ */
export async function lazadaPageSkus(offset, call = shopCall) {
  const d = await call("/products/get", {
    filter: "live",
    limit: String(PAGE),
    offset: String(offset),
  });
  const { problems, count } = shapeProblems(d);
  if (problems.length) {
    throw new Error(
      `Lazada /products/get รูปร่างข้อมูลไม่ตรงกับที่โค้ดคาด (offset ${offset}) — ` +
      `${count} จุด: ${problems.join(" · ")}` +
      (count > problems.length ? ` · (แสดง ${problems.length} จุดแรก)` : "") +
      " ⇒ หยุดไว้ก่อน ไม่เดาค่าแทน — ถ้า Lazada เปลี่ยนชื่อฟิลด์จริง ต้องแก้ที่ lazada.mjs ให้ตรงก่อน"
    );
  }
  return {
    items: d.data.products,
    total: d.data.total_products,
  };
}

const pageSkus = (offset) => lazadaPageSkus(offset);

export async function listedSkus() {
  const out = new Set();
  const eat = (items) => {
    for (const p of items) {
      for (const s of p?.skus || []) {
        const code = String(s?.SellerSku ?? "").trim();
        if (code) out.add(code);
      }
    }
  };

  const first = await pageSkus(0);
  eat(first.items);
  // ไม่บอก total มา (หรือหน้าแรกไม่เต็ม) = จบแล้ว
  if (!first.total || first.items.length < PAGE) return out;

  const pages = Math.ceil(first.total / PAGE);
  const rest = [];
  for (let i = 1; i < pages; i++) rest.push(i * PAGE);

  for (let i = 0; i < rest.length; i += CONCURRENCY) {
    const batch = rest.slice(i, i + CONCURRENCY);
    const got = await Promise.all(batch.map((o) => pageSkus(o)));
    for (const g of got) eat(g.items);
  }
  return out;
}

/** ตารางแปลง SellerSku → { skuId, itemId } — จำเป็นสำหรับ API เขียนสต็อก
 *  ที่มา (จากการยิงจริง 8 ก.ย. 2569 — canary ตัวแรกของตัวดันสต็อก):
 *  Lazada ตอบ E0501 "The SellerSku parameter is no longer supported. Please update
 *  your parameter to use SkuId" ⇒ ฝั่งเขียนต้องใช้ SkuId (ฝั่งอ่านยังให้ SellerSku มา) */
export async function skuIdMap() {
  const map = new Map();
  const eat = (items) => {
    for (const p of items) {
      for (const s of p?.skus || []) {
        const code = String(s?.SellerSku ?? "").trim();
        if (code && !map.has(code)) {
          map.set(code, { skuId: s?.SkuId, itemId: p?.item_id ?? p?.ItemId });
        }
      }
    }
  };
  const first = await pageSkus(0);
  eat(first.items);
  if (first.total && first.items.length >= PAGE) {
    const pages = Math.ceil(first.total / PAGE);
    const rest = [];
    for (let i = 1; i < pages; i++) rest.push(i * PAGE);
    for (let i = 0; i < rest.length; i += CONCURRENCY) {
      const got = await Promise.all(rest.slice(i, i + CONCURRENCY).map((o) => pageSkus(o)));
      for (const g of got) eat(g.items);
    }
  }
  return map;
}

/* ── ดูว่า Lazada ส่งฟิลด์อะไรมาบ้างต่อ SKU ── (5 ก.ย. 2569)
   ⚠️ **สร้างเพื่อไม่ต้องเดา** — ก่อนจะทำตัวเทียบสต็อกกับ Lazada
      ต้องรู้ก่อนว่าเขาส่ง "จำนวนคงเหลือ" มาในชื่ออะไร และมีจริงไหม
      (บทเรียนคืนก่อน: จอเดาชื่อฟิลด์เอง แล้วได้ขีดกลางทั้งคอลัมน์)

   ⚠️ **คืนแค่ชื่อฟิลด์ + ค่าของฟิลด์ที่ปลอดภัยเท่านั้น ห้ามดัมพ์ทั้งก้อน**
      บทเรียน 4 ก.ย.: ตัวดัมพ์ฟิลด์ของ ZORT เคยรั่วชื่อ/ที่อยู่/เบอร์ลูกค้าออกมา
      เพราะใช้ regex จับชื่อฟิลด์ · รอบนี้ใช้รายชื่อตรงตัว (Set) ตั้งแต่แรก
      สินค้าไม่มีข้อมูลลูกค้าก็จริง แต่กติกาเดียวกันต้องใช้ทุกที่ ไม่ใช่เลือกใช้ */
const SKU_SAFE = new Set([
  "SellerSku", "ShopSku", "quantity", "Available", "SkuId", "Status", "price", "special_price",
]);

export async function lazadaSkuFields(sample = 3) {
  const first = await pageSkus(0);
  const items = first.items.slice(0, Math.max(1, Math.min(10, sample)));
  const keysProduct = new Set();
  const keysSku = new Set();
  const rows = [];
  for (const p of items) {
    for (const k of Object.keys(p || {})) keysProduct.add(k);
    for (const sk of p?.skus || []) {
      for (const k of Object.keys(sk || {})) keysSku.add(k);
      rows.push(
        Object.fromEntries(Object.entries(sk).filter(([k]) => SKU_SAFE.has(k)))
      );
    }
  }
  return {
    totalProducts: first.total,
    productKeys: [...keysProduct].sort(),
    skuKeys: [...keysSku].sort(),
    // ⚠️ เฉพาะฟิลด์ในรายชื่อปลอดภัย · ไม่ใช่ทั้งก้อน
    sampleSkus: rows.slice(0, 10),
    note:
      "productKeys/skuKeys = ชื่อฟิลด์ทั้งหมดที่ Lazada ส่งมาจริง · " +
      "sampleSkus = คืนเฉพาะฟิลด์ในรายชื่อปลอดภัย (SKU_SAFE) ไม่ดัมพ์ทั้งก้อน",
  };
}

/* ── เทียบสต็อก Lazada กับคลังเรา ── (5 ก.ย. 2569)
   ⚠️ **นี่คือด่านที่ต้องผ่านก่อนจะกล้าเลิกใช้ตัวซิงก์สต็อกของ ZORT**
      ถ้าตัวเลขสองฝั่งไม่ตรงและเราอธิบายไม่ได้ ⇒ ยังตัด ZORT ไม่ได้

   ⚠️ **ชื่อฟิลด์ไม่ได้เดา** — ยิง /api/lazada/fields ดูของจริงก่อน พบว่า Lazada
      ส่ง `quantity` กับ `Available` มาต่อ SKU (ค่าเท่ากันในตัวอย่างที่ดู)
      ⇒ ใช้ `Available` เป็นหลัก (คือของที่ขายได้จริง) และเก็บ `quantity` ไว้เทียบด้วย
      **ถ้าวันไหนสองค่านี้ไม่เท่ากัน ต้องเห็น ไม่ใช่เลือกมาตัวเดียวเงียบ ๆ**

   ⚠️ SellerSku ของ Lazada มีทั้งรหัสล้วน ("01412") และรหัส+คำต่อท้าย
      ("01929 set ลูกสูบ") ⇒ ต้องผ่านตัวจับคู่กลาง ไม่ใช่เทียบตรงตัวอย่างเดียว */
/* ⚠️ **`full: 1` = ส่ง `diff` มาครบทุกแถว ห้ามตัด** (เพิ่ม 6 ก.ย. 2569)
    ค่าเริ่มต้นตัดไว้ 50 แถวเพื่อให้จอโหลดเร็ว ซึ่งถูกสำหรับ "การแสดงผล"
    แต่ **ผิดมหันต์สำหรับ "การคิดแผนดันสต็อก"** — แผนที่คิดจากตัวอย่าง 50 แถว
    จะทิ้งรหัสที่เกินไปเงียบ ๆ โดยที่ `diffCount` ยังรายงานเลขเต็ม ⇒ ดูเหมือนครบทุกอย่าง
    (บั๊กตัวเดียวกันนี้เคยเจอและแก้ที่ฝั่ง Shopee ไปแล้ว 5 ก.ย. 2569 — ฝั่ง Lazada ตกหล่น) */
/** ไล่หน้าสินค้า Lazada — **แยกออกมาเพื่อทดสอบได้ด้วยหน้าปลอม โดยเดินโค้ดเส้นเดียวกับของจริง**
 *  (แพตเทิร์นเดียวกับ collectShopeeItemIds / collectTiktokStock — 11 ก.ย. 2569)
 *  คืน { rows, declared } · `declared` = ยอดที่แพลตฟอร์มประกาศ (null = ไม่ได้บอกมา)
 *  ⚠️ ที่นี่ **ไม่ตัดสินใจแทนผู้เรียก** — แค่เก็บของกับรายงานว่าแพลตฟอร์มบอกยอดเท่าไหร่
 *     การตัดสินว่า "0 แถว = หยุด" อยู่ที่ lazadaStockCompare เพื่อให้เหตุผลอยู่ที่เดียว
 *  @param fetchPage (offset) => { items, total }
 */
export async function collectLazadaRows(fetchPage) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const rows = [];
  const eat = (items) => {
    for (const p of items || []) {
      for (const sk of p?.skus || []) {
        const code = String(sk?.SellerSku ?? "").trim();
        if (!code) continue;
        rows.push({
          sku: code,
          available: num(sk?.Available),
          quantity: num(sk?.quantity),
          status: String(sk?.Status ?? ""),
        });
      }
    }
  };
  const first = await fetchPage(0);
  eat(first?.items);
  const declared = Number.isFinite(Number(first?.total)) ? Number(first.total) : null;
  if (first?.total && (first?.items?.length ?? 0) >= PAGE) {
    const pages = Math.ceil(first.total / PAGE);
    const rest = [];
    for (let i = 1; i < pages; i++) rest.push(i * PAGE);
    for (let i = 0; i < rest.length; i += CONCURRENCY) {
      const got = await Promise.all(rest.slice(i, i + CONCURRENCY).map((o) => fetchPage(o)));
      for (const g of got) eat(g?.items);
    }
  }
  return { rows, declared };
}

export async function lazadaStockCompare(o = {}) {
  const { coreReady, coreQuery } = await import("./coredb.mjs");
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const t = await validToken();
  if (!t) return { skip: "ยังไม่ได้เชื่อมร้าน Lazada" };

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const { expandSku } = await import("./sku-match.mjs");

  // ── ดึงสินค้าทั้งหมดจาก Lazada ──
  const { rows, declared } = await collectLazadaRows(pageSkus);

  /* 🔴 **ได้ 0 รายการ = หยุด ห้ามเดินต่อด้วยกองว่าง** (เพิ่ม 11 ก.ย. 2569)
      เหตุที่ต้องมี: `pageSkus` คืน `items: d?.data?.products || []` และ `shopCall` โยน error
      **เฉพาะตอนมี `data.code` ที่ไม่ใช่ "0"** ⇒ ถ้า Lazada ตอบ 200 พร้อม payload ที่ไม่มี
      `data.products` (รูปแบบเปลี่ยน · ตอบผิดรูปช่วงมีปัญหาฝั่งเขา) เราจะได้กองว่างแบบเงียบสนิท
      ⇒ เดินต่อจนจบแล้วได้ผล "สมบูรณ์ทุกคีย์แต่เป็นศูนย์ทั้งหมด" ⇒ แผนดันบอกว่า
        **"ไม่มีอะไรต้องดัน"** ทั้งที่มีของรออยู่ · และ `bucketsAddUp` ก็ยัง true (0+0+0 === 0)
      ⚠️ ศูนย์อันตรายกว่าว่างเปล่า เพราะ **ว่างทำให้คนสงสัย แต่ศูนย์ทำให้คนสบายใจ**
      (CEO เจออาการนี้ของจริง 11 ก.ย. 2569 แล้วเครื่องมือที่ใช้ดูกลืนความต่างไปพอดี)

      ⚠️ **แยกให้ออกระหว่าง "อ่านไม่ได้" กับ "ร้านไม่มีของลงขายจริง ๆ"**
         แพลตฟอร์มบอกยอดมา > 0 แต่เราเก็บได้ 0 = อ่านไม่ได้แน่นอน
         แพลตฟอร์มบอกว่า 0 = ร้านไม่มีของลงขายจริง
         ไม่ได้บอกยอดมาเลย = **แยกไม่ได้ ⇒ เขียนตรง ๆ ว่าแยกไม่ได้ ห้ามเดาแทนคนอ่าน** */
  if (!rows.length) {
    const why = Number.isFinite(declared) && declared > 0
      ? `Lazada บอกว่ามี ${declared} รายการ แต่เราอ่านมาได้ 0 ⇒ อ่านรายการสินค้าไม่สำเร็จ`
      : Number.isFinite(declared) && declared === 0
        ? "Lazada บอกเองว่าไม่มีสินค้าลงขายอยู่เลย (ไม่ใช่เราอ่านไม่ได้)"
        : "อ่านรายการสินค้าบน Lazada ได้ 0 รายการ และแพลตฟอร์มไม่ได้บอกยอดรวมมา "
          + "⇒ **แยกไม่ได้ว่าอ่านไม่สำเร็จ หรือร้านไม่มีของลงขายจริง**";
    return { skip: why, lazadaSkus: 0, declaredOnPlatform: Number.isFinite(declared) ? declared : null };
  }

  // ── ภาพถ่ายสต็อกล่าสุดของเรา ──
  const [latest] = await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`);
  const day = latest?.d;
  /* ⚠️ **ต้องเป็น `skip` ไม่ใช่ `note`** (แก้ 6 ก.ย. 2569)
      ในไฟล์นี้ `note` ท้ายฟังก์ชันคือ **คำอธิบายคอลัมน์ของผลที่สำเร็จ** ⇒ มีทุกรอบที่สำเร็จ
      เดิมบรรทัดนี้ใช้ `note` เป็น "เหตุผลที่ทำต่อไม่ได้" = **ชื่อเดียวสองความหมาย**
      ผลคือ `stock-push.mjs` ที่เขียนว่า `if (c.skip || c.note) return {skip:...}`
      **ตีผลที่สำเร็จว่าเป็นการข้าม ⇒ แผนดันสต็อก Lazada ไม่เคยถูกคำนวณเลยสักครั้ง**
      และมันคืนคำอธิบายคอลัมน์ออกไปเป็น "เหตุผลที่ข้าม" ซึ่งอ่านแล้วดูสมเหตุสมผลมาก
      ⇒ กติกาของไฟล์นี้ต่อจากนี้: `skip` = ทำต่อไม่ได้ · `note` = คำอธิบายผลลัพธ์ **ห้ามปนกัน** */
  if (!day) return { skip: "ยังไม่มีภาพถ่ายสต็อกในคลังเรา", lazadaSkus: rows.length };
  const snap = new Map(
    (await coreQuery(`SELECT sku, qty FROM stock_snapshots WHERE day = ?`, [day])).map((r) => [
      String(r.sku).trim(),
      num(r.qty),
    ])
  );

  /* ── สินค้าเป็นชุด (โซ่ตัดขาย) ── (5 ก.ย. 2569)
     ⚠️ **เดิมกอง "เทียบตัวต่อตัวไม่ได้" มี 406 รหัส = 21% ของที่ลงขาย** ซึ่งไม่ใช่ของชายขอบ
        มันคือโซ่ตัดขาย = สินค้าหลักของร้าน และเป็นกลุ่มที่สต็อกเพี้ยนง่ายที่สุด
        ⇒ บอกว่า "ตรงกัน 99%" โดยไม่พูดถึง 21% ที่ไม่ได้ตรวจ = จริงเฉพาะกับของที่เทียบง่าย
     ⇒ **ZORT มี availablestock ของชุดให้อยู่แล้ว** (เก็บไว้ในตาราง bundles ของคลังเงา)
        ใช้ตัวนั้นเทียบตรงตัวได้เลย ไม่ต้องเดาด้วยการตัดท้ายอีก
     ⚠️ ใช้เฉพาะ `available` **ห้ามแตะ sellprice** — ราคาชุดกับราคาเว็บต่างกัน 100 จาก 146 รหัส
        เรื่องราคายังรอเจ้าของร้านตัดสิน (ดู netlify/functions/stock.mjs) */
  /* ⚠️ **ห้ามใช้ `bundles.available` เป็นตัวเลขจริง** — พิสูจน์แล้ว 5 ก.ย. 2569 ว่ามันไม่ตรง
      ZORT มีตัวเลขของโซ่ม้วนเดียวกันอยู่ **สามค่า** และไม่ตรงกันเอง (ตระกูล 00894):
        ชุด onhand    ⇒ สื่อถึงม้วน ≈ 14,580
        ชุด available ⇒ สื่อถึงม้วน ≈ 14,175
        ม้วนแม่ availablestock (ที่ /api/stock ใช้) = **13,978.5**
      และ **Lazada ตรงกับตัวสุดท้าย** (ตัวเลขที่ลงขายสื่อถึงม้วน 13,970–13,978)
      ⇒ ใช้ชุดเพื่อ **ระบุตัว** (รหัสนี้คือโซ่ตัดจากม้วนไหน ยาวเท่าไหร่) เท่านั้น
        ส่วน **จำนวน** ให้คิดจากม้วนแม่ตัวจริง ÷ สูตร — ตรงกับที่หน้าเว็บทำ
      ⇒ ถ้าเอา available ของชุดมาใช้ จะได้ตัวเลขสูงกว่าความจริง ~1.4% ⇒ **ขายเกิน** */
  let recipe = new Map(); // sku ของชุด → { base, per }
  try {
    const rows2 = await coreQuery(
      `SELECT b.sku AS sku, i.sku AS base, i.qty AS per
       FROM bundles b JOIN bundle_items i ON i.bundle_sku = b.sku
       WHERE b.active = 1`
    );
    // ⚠️ เอาเฉพาะชุดที่มีส่วนประกอบตัวเดียว — ชุดหลายชิ้นคิดแบบนี้ไม่ได้
    const count = new Map();
    for (const r of rows2) count.set(String(r.sku), (count.get(String(r.sku)) || 0) + 1);
    for (const r of rows2) {
      const k = String(r.sku).trim();
      if (count.get(k) !== 1) continue;
      const per = num(r.per);
      if (per > 0 && r.base) recipe.set(k, { base: String(r.base).trim(), per });
    }
  } catch {
    // ยังไม่มีตารางสูตร = ถอยไปใช้วิธีเดิม ห้ามล้ม
  }

  /* ⚠️ **หลายรหัสบน Lazada ชี้มาที่รหัสเดียวในคลังได้** — เจอของจริงรอบแรก 5 ก.ย. 2569
      โซ่ขายเป็นม้วน รหัสคลังคือ `03793` มีอยู่ 38,598.5 (เป็นข้อ/เมตร)
      แต่บน Lazada แตกเป็นความยาว: 03793-42T · 03793-57T · 03793-69T · 03793-roll …
      ตัวจับคู่ตัดท้ายทำให้ทุกตัวไปชนรหัสเดียวกัน ⇒ **แต่ละตัวถูกเทียบกับ 38,598.5**
      แล้วรายงานว่า "ต่างกัน +38,000" ทุกบรรทัด

      ⇒ **นี่ไม่ใช่สต็อกไม่ตรง มันคือผลข้างเคียงของการเดา** ถ้าปล่อยไว้
         จะได้เลข "ไม่ตรง 278 รายการ" ที่ดูน่ากลัวและไม่มีความหมาย
         แล้วคนจะเลิกดูตัวเลขนี้ไปเลย ซึ่งแย่กว่าไม่มีตัวเลข
      ⇒ นับ "กี่รหัส Lazada ชี้มาที่รหัสคลังเดียวกัน" ก่อน แล้วแยกกองออกไปต่างหาก */
  const keyOf = new Map(); // sku ของ Lazada → รหัสในคลังที่จับคู่ได้
  const fanIn = new Map(); // รหัสในคลัง → จำนวน sku ของ Lazada ที่ชี้มา
  const viaBundle = new Set(); // sku ที่จับคู่ได้เพราะเป็นสินค้าเป็นชุด (ตรงตัว ไม่ใช่เดา)
  for (const r of rows) {
    /* ① มีสูตรชุด = รู้แน่ว่าตัดจากม้วนไหน ยาวเท่าไหร่ — **ระบุตัวได้ตรงตัว ไม่ต้องเดา**
        แล้วคิดจำนวนจากม้วนแม่ตัวจริง (snap) ไม่ใช่จาก available ของชุด */
    const rec = recipe.get(r.sku);
    if (rec && snap.has(rec.base)) {
      keyOf.set(r.sku, r.sku);
      viaBundle.add(r.sku);
      fanIn.set(r.sku, (fanIn.get(r.sku) || 0) + 1);
      continue;
    }
    // ② ค่อยไปหาในสินค้าเดี่ยว (ตรงตัวก่อน แล้วค่อยตัดท้าย)
    for (const cand of expandSku(r.sku)) {
      if (snap.has(cand)) {
        keyOf.set(r.sku, cand);
        fanIn.set(cand, (fanIn.get(cand) || 0) + 1);
        break;
      }
    }
  }

  const diff = [];
  const oneToMany = new Map(); // รหัสคลัง → รายการ sku ของ Lazada ที่ชี้มา
  const missingSample = [];
  const availVsQty = [];
  let same = 0;
  let sameExact = 0;
  let sameBase = 0;
  let missing = 0;
  let matchedByBase = 0;
  for (const r of rows) {
    // ⚠️ Available กับ quantity ต่างกันเมื่อไหร่ ต้องเห็น ไม่ใช่เงียบ
    if (r.available !== r.quantity && availVsQty.length < 20) {
      availVsQty.push({ sku: r.sku, available: r.available, quantity: r.quantity });
    }
    const key = keyOf.get(r.sku) || null;
    if (!key) {
      missing += 1;
      if (missingSample.length < 20) missingSample.push({ sku: r.sku, lazada: r.available });
      continue;
    }
    if (key !== r.sku) matchedByBase += 1;

    /* หลายตัวชี้มารหัสเดียว = เทียบตัวต่อตัวไม่ได้ **แยกกองออกไป ห้ามนับเป็นไม่ตรง**
       (เทียบได้เฉพาะยอดรวม ซึ่งก็ยังไม่ตรงอยู่ดีเพราะหน่วยคนละอย่าง — ม้วน vs เส้น) */
    if ((fanIn.get(key) || 0) > 1) {
      if (!oneToMany.has(key)) oneToMany.set(key, { core: snap.get(key), n: 0, skus: [] });
      const g = oneToMany.get(key);
      /* ⚠️ **นับแยกจากตัวอย่าง** — เดิมนับจากความยาวของ skus ซึ่งถูกตัดที่ 12 ตัวต่อรหัส
          ⇒ oneToManySkus ได้ 327 ทั้งที่ของจริง 406 · ผลรวมทุกกองเลยไม่เท่ากับ 1,967
          จับได้เพราะบวกทุกกองแล้วเทียบกับยอดรวม (ตัวเลขที่บวกกลับไม่ได้ = มีของหาย)
          **การตัดตัวอย่างเป็นเรื่องของการแสดงผล ห้ามให้มันไปลดตัวนับ** */
      g.n += 1;
      if (g.skus.length < 12) g.skus.push({ sku: r.sku, lazada: r.available });
      continue;
    }

    /* ⚠️ **แยกตามวิธีจับคู่เสมอ** (ฝั่งจอชี้ 5 ก.ย. 2569)
        "ตรงตัว" = รหัส Lazada ตรงกับรหัสคลังเป๊ะ ⇒ เชื่อได้
        "ตัดท้าย" = **เป็นการเดา ต่อให้ fan-in เป็น 1 ก็ยังเดาอยู่ดี**
        ยุบรวมเป็นเปอร์เซ็นต์เดียว = ตัวที่เดาแล้วบังเอิญเลขใกล้กัน
        จะไปเพิ่มเปอร์เซ็นต์ให้ดูดีขึ้นเงียบ ๆ ซึ่งอันตรายกว่าตัวที่เดาแล้วเลขต่างเยอะ
        (ตัวหลังเราเห็น ตัวแรกเราไม่เห็น) */
    const exact = key === r.sku;
    /* ⚠️ ของชุด: คิดจาก **ม้วนแม่จริง ÷ สูตร** ปัดลง — วิธีเดียวกับที่หน้าเว็บใช้
        และตรงกับตัวเลขที่ Lazada ลงขายจริง (พิสูจน์แล้วกับตระกูล 00894 · 03793) */
    const rc = recipe.get(r.sku);
    const ours = viaBundle.has(r.sku)
      ? Math.floor(num(snap.get(rc.base)) / rc.per)
      : snap.get(key);
    if (ours === r.available) {
      same += 1;
      if (exact) sameExact += 1;
      else sameBase += 1;
    } else
      diff.push({
        sku: r.sku,
        matchedAs: key === r.sku ? "ตรงตัว" : `ตัดท้ายเป็น ${key}`,
        lazada: r.available,
        core: ours,
        gap: ours - r.available,
      });
  }
  diff.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  return {
    day,
    snapshotRows: snap.size,
    lazadaSkus: rows.length,
    /* ⚠️ **ตัวตรวจตัวเอง** — ทุกรหัสต้องตกอยู่กองใดกองหนึ่งพอดี
        ผลรวมไม่เท่ากับ lazadaSkus เมื่อไหร่ = มีของหายระหว่างทาง (เจอมาแล้ว) */
    bucketsAddUp:
      sameExact + sameBase + diff.length +
        [...oneToMany.values()].reduce((a, g) => a + g.n, 0) + missing ===
      rows.length,
    same,
    /* ⚠️ **ตัวเลขที่เชื่อได้จริงคือกอง exact เท่านั้น** — กอง base คือของที่เดาว่าเป็นตัวเดียวกัน */
    sameExact,
    sameBase,
    // จับคู่ได้เพราะเป็นสินค้าเป็นชุดของ ZORT — ตรงตัว ไม่ใช่การเดา
    matchedByBundle: viaBundle.size,
    bundlesWithRecipe: recipe.size,
    diffExact: diff.filter((x) => x.matchedAs === "ตรงตัว").length,
    diffBase: diff.filter((x) => x.matchedAs !== "ตรงตัว").length,
    diffCount: diff.length,
    missing,
    matchedByBase,
    /* ⚠️ กองนี้ **ไม่ได้แปลว่าสต็อกผิด** — แปลว่าเทียบตัวต่อตัวไม่ได้
        เพราะหลายรหัสบน Lazada ชี้มาที่รหัสเดียวในคลัง (เช่นโซ่ขายเป็นม้วนแล้วตัดขาย) */
    oneToManyKeys: oneToMany.size,
    oneToManySkus: [...oneToMany.values()].reduce((a, g) => a + g.n, 0),
    oneToMany: [...oneToMany.entries()]
      .sort((a, b) => b[1].skus.length - a[1].skus.length)
      .slice(0, 10)
      .map(([k, v]) => ({
        coreSku: k,
        coreQty: v.core,
        total: v.n, // จำนวนจริง
        shown: v.skus.length, // ตัวอย่างที่ส่งมา — น้อยกว่า total ได้ ห้ามเอาไปนับ
        lazadaSkus: v.skus,
      })),
    negativeInCore: [...snap.values()].filter((v) => v < 0).length,
    /* ⚠️ **ตัดไว้ 50 เพื่อการแสดงผลเท่านั้น — ตัวคิดแผนต้องขอ `full: 1` เสมอ**
        `diffCount` ข้างบนเป็นเลขเต็มอยู่แล้ว ⇒ ใครอ่าน `diff.length` ไปใช้แทนจะได้เลขที่
        **น้อยกว่าความจริงแบบดูสมเหตุสมผล** และไม่มีอะไรฟ้อง (เจอจริง 6 ก.ย. 2569: แผนเห็น 50 จาก 83)
        ⇒ ถ้าเพิ่มผู้ใช้เส้นนี้อีกในอนาคต **ต้องถามก่อนว่าเขาจะเอาไปนับหรือเอาไปโชว์** */
    diff: o.full ? diff : diff.slice(0, 50),
    diffTruncated: !o.full && diff.length > 50, // จอจะได้รู้ว่ากำลังดูของไม่ครบ
    missingSample,
    // ⚠️ ว่าง = สองค่านี้ตรงกันทุกตัวในรอบนี้ · ไม่ว่าง = ต้องตัดสินใจว่าจะยึดตัวไหน
    availableNotEqualQuantity: availVsQty,
    note:
      "same = ตัวเลขตรงกัน · diff = ไม่ตรง (gap = ของเรา ลบ ของ Lazada) · " +
      "missing = Lazada มีรหัสนี้แต่คลังเราไม่รู้จัก **คนละเรื่องกับตัวเลขไม่ตรง** · " +
      "matchedByBase = จับคู่ได้ด้วยการตัดคำต่อท้าย ไม่ใช่ตรงตัว ⇒ เป็นการเดา ดูให้ดี · " +
      "oneToMany = หลายรหัส Lazada ชี้มารหัสเดียวในคลัง (เช่นโซ่ตัดขายตามความยาว) " +
      "**เทียบตัวต่อตัวไม่ได้ ไม่ใช่สต็อกผิด** ⇒ แยกกองไว้ ไม่นับรวมใน diffCount · " +
      "⚠️ **คิดเปอร์เซ็นต์จาก sameExact/(sameExact+diffExact) เท่านั้น** " +
      "กอง base คือการเดา เอาไปรวมแล้วเปอร์เซ็นต์จะดูดีเกินจริง",
  };
}
