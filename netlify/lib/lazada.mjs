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
