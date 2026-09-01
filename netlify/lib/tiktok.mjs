// คุยกับ TikTok Shop Open API — ลายเซ็น ขอ token และเรียกคำสั่ง
//
// แอป "GUCUT Shop Sync" หมวด นักพัฒนาผู้ขายภายในองค์กร / ผู้ขายของ TikTok Shop
// (บริการแบบกำหนดเอง — ไม่ขึ้นตลาดบริการสาธารณะ ใช้กับร้านตัวเองเท่านั้น)
//
// ⚠️ ลายเซ็นของ TikTok คิดคนละแบบกับ Shopee ทั้งหมด อย่าเอาสูตรมาปนกัน
//    1) เอา query ทุกตัว **ยกเว้น `sign` และ `access_token`** มาเรียงตามตัวอักษร
//    2) ต่อกันเป็น `key1value1key2value2...` (ไม่มีเครื่องหมายคั่นเลย)
//    3) เอา path มาแปะไว้ "หน้า" ก้อนนั้น
//    4) ถ้ามี body ที่ไม่ใช่ multipart ให้แปะ JSON ของ body ต่อ "ท้าย"
//    5) ครอบหัวท้ายด้วย app_secret แล้วทำ HMAC-SHA256 ด้วย app_secret อีกที
//    ผิดขั้นไหนขั้นหนึ่ง = ตอบ 36xxxx invalid signature โดยไม่บอกว่าผิดตรงไหน
//
// ⚠️ timestamp เป็นวินาที · access_token อายุสั้น ต้องต่ออายุด้วย refresh_token
import { createHmac } from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE = "gucut-tiktok";
const API = "https://open-api.tiktokglobalshop.com";
const AUTH = "https://auth.tiktok-shops.com";
const VERSION = "202309";

export const tiktokReady = () => !!(process.env.TIKTOK_APP_KEY && process.env.TIKTOK_APP_SECRET);
const appKey = () => process.env.TIKTOK_APP_KEY;
const appSecret = () => process.env.TIKTOK_APP_SECRET;
const now = () => Math.floor(Date.now() / 1000);

/**
 * ลายเซ็นตามสูตร TikTok Shop
 * @param {string} path  เช่น "/product/202309/products/search"
 * @param {object} query พารามิเตอร์ทั้งหมด (จะคัด sign กับ access_token ออกให้เอง)
 * @param {string} body  ตัว JSON ของ body ถ้ามี
 */
export function sign(path, query = {}, body = "") {
  const keys = Object.keys(query)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort();
  let base = path;
  for (const k of keys) base += `${k}${query[k]}`;
  if (body) base += body;
  base = `${appSecret()}${base}${appSecret()}`;
  return createHmac("sha256", appSecret()).update(base).digest("hex");
}

/** ลิงก์ให้เจ้าของร้านกดอนุญาตให้แอปเข้าถึงร้านตัวเอง (ทำครั้งเดียว)
 *  ⚠️ ต้องเป็น services.tiktokshop.com เท่านั้น — ใช้ `auth.tiktok-shops.com/oauth/authorize`
 *  จะตอบ 36004003 invalid client_key (ลองแล้วของจริง 1 ก.ย. 2569)
 *  ส่วนคำสั่งแลก/ต่ออายุ token ยังอยู่ที่ auth.tiktok-shops.com ตามเอกสาร อย่าสลับกัน */
export function authLink(state = "gucut") {
  const q = new URLSearchParams({ service_id: process.env.TIKTOK_SERVICE_ID || "", state });
  return `https://services.tiktokshop.com/open/authorize?${q}`;
}

// ── เก็บ token ──
// ⚠️ ต่ออายุแล้ว refresh_token เปลี่ยนตัวใหม่ ต้องเขียนทับเสมอ
//    ไม่เขียนทับ = ครั้งถัดไปใช้ตัวที่ถูกยกเลิกแล้ว หลุดทั้งระบบ ต้องให้ร้านกดอนุญาตใหม่
const store = () => getStore({ name: STORE, consistency: "strong" });
export const loadToken = () => store().get("token", { type: "json" }).catch(() => null);
export const saveToken = (t) => store().setJSON("token", { ...t, savedAt: new Date().toISOString() });

async function callJson(url, init) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), ...init });
  const data = await res.json().catch(() => ({}));
  // TikTok ตอบ 200 เสมอ แล้วบอกความผิดพลาดใน code ⇒ เช็ค code ไม่ใช่ status
  if (data?.code && data.code !== 0) throw new Error(`${data.code}: ${data.message || ""}`.trim());
  return data;
}

/** แลก code ที่ได้ตอนร้านกดอนุญาต เป็น access_token ครั้งแรก */
export async function exchangeCode(code) {
  const q = new URLSearchParams({
    app_key: appKey(),
    app_secret: appSecret(),
    auth_code: code,
    grant_type: "authorized_code",
  });
  const data = await callJson(`${AUTH}/api/v2/token/get?${q}`);
  const d = data.data || {};
  const t = {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    shopCipher: null,
    shopId: null,
    expireAt: Number(d.access_token_expire_in) || now() + 25200,
  };
  await saveToken(t);
  return t;
}

/** ต่ออายุ token */
export async function refresh(t) {
  const q = new URLSearchParams({
    app_key: appKey(),
    app_secret: appSecret(),
    refresh_token: t.refreshToken,
    grant_type: "refresh_token",
  });
  const data = await callJson(`${AUTH}/api/v2/token/refresh?${q}`);
  const d = data.data || {};
  const next = {
    ...t,
    accessToken: d.access_token,
    refreshToken: d.refresh_token || t.refreshToken,
    expireAt: Number(d.access_token_expire_in) || now() + 25200,
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

/**
 * เรียกคำสั่งของร้าน
 * ⚠️ คำสั่งเกือบทุกตัวต้องมี `shop_cipher` ซึ่งได้จาก /authorization/{v}/shops
 *    ไม่ใช่ shop_id — ใส่ shop_id แทนจะโดนปฏิเสธ
 */
export async function shopCall(path, { method = "GET", query = {}, body = null } = {}) {
  const t = await validToken();
  if (!t) throw new Error("ยังไม่ได้เชื่อมร้าน — ให้เจ้าของร้านกดอนุญาตก่อนที่ /api/tiktok/auth");
  const bodyStr = body ? JSON.stringify(body) : "";
  const q = { app_key: appKey(), timestamp: String(now()), ...query };
  if (t.shopCipher && !("shop_cipher" in q)) q.shop_cipher = t.shopCipher;
  q.sign = sign(path, q, bodyStr);
  const url = `${API}${path}?${new URLSearchParams(q)}`;
  return callJson(url, {
    method,
    headers: { "content-type": "application/json", "x-tts-access-token": t.accessToken },
    body: bodyStr || undefined,
  });
}

/** หา shop_cipher ของร้านที่อนุญาตไว้ แล้วจำไว้ใช้ครั้งต่อไป */
export async function ensureShop() {
  const t = await validToken();
  if (!t) return null;
  if (t.shopCipher) return t;
  const path = `/authorization/${VERSION}/shops`;
  const q = { app_key: appKey(), timestamp: String(now()) };
  q.sign = sign(path, q, "");
  const data = await callJson(`${API}${path}?${new URLSearchParams(q)}`, {
    headers: { "content-type": "application/json", "x-tts-access-token": t.accessToken },
  });
  const shop = (data?.data?.shops || [])[0];
  if (!shop) return t;
  const next = { ...t, shopCipher: shop.cipher, shopId: shop.id, shopName: shop.name };
  await saveToken(next);
  return next;
}

export { VERSION };
