// คุยกับ Shopee Open API v2 — ลายเซ็น ขอ token และเรียกคำสั่ง
//
// ใช้ทำอะไร: ดึงรีวิว (พร้อม **URL รูป** ซึ่งเปิดเบราว์เซอร์อ่านไม่ได้) · ออเดอร์ · สินค้า
// แอป "GUCUT Shop Sync" หมวด Seller In House System (แอปใช้กับร้านตัวเองเท่านั้น)
//
// ⚠️ Shopee มีสองโลกแยกกันเด็ดขาด คนละที่อยู่ คนละคีย์ ใช้ข้ามกันไม่ได้
//    test  → partner.test-stable.shopeemobile.com  (คีย์ที่มีคำว่า Test ในคอนโซล)
//    live  → partner.shopeemobile.com              (ได้หลังกด Go-Live)
//    สลับด้วย env `SHOPEE_ENV` อย่างเดียว โค้ดไม่ต้องแก้
//
// ⚠️ ลายเซ็นมีสองสูตร ใช้ผิดสูตร = ตอบ error 403 ทันที
//    คำสั่งสาธารณะ (ขอ token): partner_id + path + timestamp
//    คำสั่งของร้าน:            partner_id + path + timestamp + access_token + shop_id
//
// ⚠️ timestamp เป็น "วินาที" ไม่ใช่มิลลิวินาที และเพี้ยนได้ไม่เกิน 5 นาที
import { createHmac } from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE = "gucut-shopee";

export const shopeeReady = () => !!(process.env.SHOPEE_PARTNER_ID && process.env.SHOPEE_PARTNER_KEY);
export const isTest = () => (process.env.SHOPEE_ENV || "test") !== "live";
export const host = () =>
  isTest() ? "https://partner.test-stable.shopeemobile.com" : "https://partner.shopeemobile.com";

const partnerId = () => Number(process.env.SHOPEE_PARTNER_ID);
const partnerKey = () => process.env.SHOPEE_PARTNER_KEY;
const now = () => Math.floor(Date.now() / 1000);

/** ลายเซ็นตามสูตร Shopee v2 — HMAC-SHA256 ของ base string ด้วย partner_key */
function sign(base) {
  return createHmac("sha256", partnerKey()).update(base).digest("hex");
}

/** ที่อยู่คำสั่งสาธารณะ (ยังไม่มี token) เช่น ขอ/ต่ออายุ token */
export function publicUrl(path, extra = {}) {
  const ts = now();
  const s = sign(`${partnerId()}${path}${ts}`);
  const q = new URLSearchParams({ partner_id: String(partnerId()), timestamp: String(ts), sign: s, ...extra });
  return `${host()}${path}?${q}`;
}

/** ที่อยู่คำสั่งของร้าน (ต้องมี token กับ shop_id แล้ว) */
export function shopUrl(path, accessToken, shopId, extra = {}) {
  const ts = now();
  const s = sign(`${partnerId()}${path}${ts}${accessToken}${shopId}`);
  const q = new URLSearchParams({
    partner_id: String(partnerId()),
    timestamp: String(ts),
    access_token: accessToken,
    shop_id: String(shopId),
    sign: s,
    ...extra,
  });
  return `${host()}${path}?${q}`;
}

/** ลิงก์ให้เจ้าของร้านกดอนุญาตให้แอปเข้าถึงร้านตัวเอง (ทำครั้งเดียว) */
export function authLink(redirect) {
  return publicUrl("/api/v2/shop/auth_partner", { redirect });
}

// ── เก็บ token ──
// อายุ access_token แค่ 4 ชม. · refresh_token 30 วัน ⇒ ต้องต่ออายุเองก่อนใช้ทุกครั้ง
// ⚠️ ต่ออายุแล้ว refresh_token จะเปลี่ยนตัวใหม่ด้วย ต้องเขียนทับของเดิมเสมอ
//    ไม่เขียนทับ = ครั้งถัดไปใช้ตัวเก่าที่ถูกยกเลิกแล้ว แล้วหลุดทั้งระบบ ต้องให้ร้านกดอนุญาตใหม่
const store = () => getStore({ name: STORE, consistency: "strong" });

export async function saveToken(t) {
  await store().setJSON("token", { ...t, savedAt: new Date().toISOString() });
}
export async function loadToken() {
  return store().get("token", { type: "json" }).catch(() => null);
}

async function callJson(url, body) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  // Shopee ตอบ 200 เสมอ แล้วบอกความผิดพลาดในช่อง error ⇒ เช็ค error ไม่ใช่ status
  if (data?.error) throw new Error(`${data.error}: ${data.message || ""}`.trim());
  return data;
}

/** แลก code ที่ได้ตอนร้านกดอนุญาต เป็น access_token ครั้งแรก */
export async function exchangeCode(code, shopId) {
  const data = await callJson(publicUrl("/api/v2/auth/token/get"), {
    code,
    shop_id: Number(shopId),
    partner_id: partnerId(),
  });
  const t = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    shopId: Number(shopId),
    expireAt: now() + Number(data.expire_in || 14400),
  };
  await saveToken(t);
  return t;
}

/** ต่ออายุ token — เรียกเองอัตโนมัติเมื่อใกล้หมด */
export async function refresh(t) {
  const data = await callJson(publicUrl("/api/v2/auth/access_token/get"), {
    refresh_token: t.refreshToken,
    shop_id: t.shopId,
    partner_id: partnerId(),
  });
  const next = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || t.refreshToken,
    shopId: t.shopId,
    expireAt: now() + Number(data.expire_in || 14400),
  };
  await saveToken(next);
  return next;
}

/** คืน token ที่ใช้ได้แน่ ๆ — ต่ออายุให้เองถ้าเหลือน้อยกว่า 10 นาที */
export async function validToken() {
  const t = await loadToken();
  if (!t?.accessToken) return null;
  if (t.expireAt - now() > 600) return t;
  return refresh(t);
}

/** เรียกคำสั่งของร้าน — ต่ออายุ token ให้เองแล้ว */
export async function shopCall(path, extra = {}) {
  const t = await validToken();
  if (!t) throw new Error("ยังไม่ได้เชื่อมร้าน — ให้เจ้าของร้านกดอนุญาตก่อนที่ /api/shopee/auth");
  return callJson(shopUrl(path, t.accessToken, t.shopId, extra));
}
