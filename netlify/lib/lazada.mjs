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

async function pageSkus(offset) {
  const d = await shopCall("/products/get", {
    filter: "live",
    limit: String(PAGE),
    offset: String(offset),
  });
  return {
    items: d?.data?.products || [],
    total: Number(d?.data?.total_products ?? 0),
  };
}

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
export async function lazadaStockCompare() {
  const { coreReady, coreQuery } = await import("./coredb.mjs");
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const t = await validToken();
  if (!t) return { skip: "ยังไม่ได้เชื่อมร้าน Lazada" };

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const { expandSku } = await import("./sku-match.mjs");

  // ── ดึงสินค้าทั้งหมดจาก Lazada ──
  const rows = [];
  const eat = (items) => {
    for (const p of items) {
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

  // ── ภาพถ่ายสต็อกล่าสุดของเรา ──
  const [latest] = await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`);
  const day = latest?.d;
  if (!day) return { note: "ยังไม่มีภาพถ่ายสต็อกในคลังเรา", lazadaSkus: rows.length };
  const snap = new Map(
    (await coreQuery(`SELECT sku, qty FROM stock_snapshots WHERE day = ?`, [day])).map((r) => [
      String(r.sku).trim(),
      num(r.qty),
    ])
  );

  const diff = [];
  const missingSample = [];
  const availVsQty = [];
  let same = 0;
  let missing = 0;
  let matchedByBase = 0;
  for (const r of rows) {
    // ⚠️ Available กับ quantity ต่างกันเมื่อไหร่ ต้องเห็น ไม่ใช่เงียบ
    if (r.available !== r.quantity && availVsQty.length < 20) {
      availVsQty.push({ sku: r.sku, available: r.available, quantity: r.quantity });
    }
    let key = null;
    for (const cand of expandSku(r.sku)) {
      if (snap.has(cand)) {
        key = cand;
        if (cand !== r.sku) matchedByBase += 1;
        break;
      }
    }
    if (!key) {
      missing += 1;
      if (missingSample.length < 20) missingSample.push({ sku: r.sku, lazada: r.available });
      continue;
    }
    const ours = snap.get(key);
    if (ours === r.available) same += 1;
    else
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
    same,
    diffCount: diff.length,
    missing,
    matchedByBase,
    negativeInCore: [...snap.values()].filter((v) => v < 0).length,
    diff: diff.slice(0, 50),
    missingSample,
    // ⚠️ ว่าง = สองค่านี้ตรงกันทุกตัวในรอบนี้ · ไม่ว่าง = ต้องตัดสินใจว่าจะยึดตัวไหน
    availableNotEqualQuantity: availVsQty,
    note:
      "same = ตัวเลขตรงกัน · diff = ไม่ตรง (gap = ของเรา ลบ ของ Lazada) · " +
      "missing = Lazada มีรหัสนี้แต่คลังเราไม่รู้จัก **คนละเรื่องกับตัวเลขไม่ตรง** · " +
      "matchedByBase = จับคู่ได้ด้วยการตัดคำต่อท้าย ไม่ใช่ตรงตัว ⇒ เป็นการเดา ดูให้ดี",
  };
}
