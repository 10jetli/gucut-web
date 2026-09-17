/* 🔐 ตรวจสิทธิ์ "เขียนสต็อก" ของ Shopee + TikTok **ด้วยรหัสสินค้าที่ไม่มีอยู่จริง** — ไม่เปลี่ยนสต็อกอะไรเลย
 *
 * ท่านประธานสั่ง "ทำให้ครบ" (17 ก.ย. 2569 20:4x) — ตัวยิง Shopee + TikTok · ข้อ ① ห้ามข้าม:
 *   ก่อนเขียนตัวยิง ต้องรู้ว่า token ที่ร้านอนุญาตไว้ **มีสิทธิ์เขียน** หรือแค่อ่าน
 *   · ตอบว่า "หาสินค้าไม่เจอ"      ⇒ เส้นเขียนผ่านด่านสิทธิ์แล้ว แค่ไม่มีของ = **มีสิทธิ์**
 *   · ตอบว่า "ไม่มีสิทธิ์/scope"   ⇒ **ยังเขียนไม่ได้** ต้องให้ร้านขอสิทธิ์เพิ่ม
 *   · อย่างอื่น                    ⇒ **ไม่รู้** — คืนรหัส/ข้อความดิบ ห้ามเดาให้เป็นสองแบบแรก
 *
 * 🔴 กันยิงโดนของจริง (สองชั้น):
 *   ① รหัสปลอมเป็นเลขที่ไม่มีทางเป็นรหัสสินค้าร้านเรา (รหัสจริงยาว 10+ หลัก)
 *   ② **อ่านก่อนว่ารหัสนั้นไม่มีในร้าน** — อ่านเจอของ / อ่านไม่ได้ ⇒ **ไม่ยิงเขียน** และบอกว่าไม่ได้ยิงเพราะอะไร
 *
 * ⚠️ Shopee `shopCall` ใน shopee.mjs **ยิงได้แค่ GET** (ไม่เคยส่ง body) — CEO เข้าใจว่ารองรับ POST
 *    ⇒ ไฟล์นี้ประกอบ POST เองจาก `shopUrl` (ลายเซ็นร้านของ Shopee ไม่รวม body) · ไม่แก้ shopee.mjs
 * ⚠️ ไม่เก็บ token/ลายเซ็นในผล · คืนแค่รหัสผิดพลาดกับข้อความของแพลตฟอร์ม
 */
import { validToken as shopeeToken, shopUrl, shopeeReady } from "./shopee.mjs";
import { shopCall as tiktokCall, ensureShop, tiktokReady, VERSION } from "./tiktok.mjs";

export const รหัสปลอม = "1";

/** แยกผลจากคำตอบผิดพลาด — จับเฉพาะคำที่ชัดเจน ที่เหลือ = ไม่รู้ */
export function แปลผล(code, message) {
  const t = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  if (/permission|scope|unauthori[sz]ed|access[ _]denied|no auth|forbidden|not authori/.test(t)) return "ไม่มีสิทธิ์";
  if (/not[ _]?found|not[ _]exist|does not exist|no such|item_not_found|product_not_found|invalid (item|product)[ _]?id/.test(t)) return "มีสิทธิ์";
  return "ไม่รู้";
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  return { http: res.status, data };
}

/** ข้อ ② หาเพดานจำนวนรายการต่อคำขอ — ส่งรายการปลอม N ตัวในสินค้าปลอมตัวเดียว
 *  ⚠️ ถ้าแพลตฟอร์มหาสินค้าก่อนตรวจขนาด ทุกขนาดจะตอบ "ไม่พบ" เหมือนกัน ⇒ **หาเพดานด้วยวิธีนี้ไม่ได้** ต้องบอกตรง ๆ */
export const ขนาดสูงสุดที่ลอง = 500;
const ขนาดจาก = (n) => Math.max(1, Math.min(ขนาดสูงสุดที่ลอง, Math.floor(Number(n)) || 1));

export async function ตรวจShopee({ ขนาด = 1 } = {}) {
  const เส้น = "/api/v2/product/update_stock";
  if (!shopeeReady()) return { platform: "shopee", ผล: "ไม่รู้", ไม่ได้ยิง: "ยังไม่ได้ตั้งกุญแจ Shopee" };
  const t = await shopeeToken().catch((e) => ({ error: String(e?.message || e) }));
  if (!t?.accessToken) return { platform: "shopee", ผล: "ไม่รู้", ไม่ได้ยิง: `ไม่มี token ที่ใช้ได้${t?.error ? ` (${t.error})` : ""}` };

  // ชั้น ② — อ่านก่อนว่ารหัสปลอมไม่มีในร้าน
  const อ่าน = await fetch(shopUrl("/api/v2/product/get_item_base_info", t.accessToken, t.shopId, { item_id_list: รหัสปลอม }),
    { signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch((e) => ({ error: "fetch", message: String(e?.message || e) }));
  const เจอ = อ่าน?.response?.item_list;
  if (Array.isArray(เจอ) && เจอ.length) return { platform: "shopee", ผล: "ไม่รู้", ไม่ได้ยิง: `รหัสปลอม ${รหัสปลอม} มีอยู่ในร้านจริง — หยุด` };
  /* ของจริง 17 ก.ย. 2569 21:34: รหัสที่ไม่มีในร้าน Shopee ตอบ `error:""` และ **ไม่มี item_list เลย** (ไม่ใช่รายการว่าง)
     ⇒ "ไม่มี error + ไม่มีของ" = ไม่มีในร้าน · มี error จริง (ไม่ใช่ไม่พบ) หรืออ่านพัง ⇒ ยังหยุดเหมือนเดิม */
  const ไม่มีError = อ่าน && typeof อ่าน === "object" && !อ่าน.error;
  if (!Array.isArray(เจอ) && !ไม่มีError && !/not[ _]?found|not exist/i.test(`${อ่าน?.error} ${อ่าน?.message}`)) {
    return { platform: "shopee", ผล: "ไม่รู้", ไม่ได้ยิง: "ยืนยันไม่ได้ว่ารหัสปลอมไม่มีในร้าน", อ่าน: { error: อ่าน?.error ?? null, message: อ่าน?.message ?? null } };
  }

  const n = ขนาดจาก(ขนาด);
  const body = {
    item_id: Number(รหัสปลอม),
    stock_list: n === 1 ? [{ model_id: 0, seller_stock: [{ stock: 0 }] }]
      : Array.from({ length: n }, (_, i) => ({ model_id: i + 1, seller_stock: [{ stock: 0 }] })),
  };
  const { http, data } = await postJson(shopUrl(เส้น, t.accessToken, t.shopId), body).catch((e) => ({ http: null, data: { error: "fetch", message: String(e?.message || e) } }));
  const code = data?.error || null;
  const message = data?.message || null;
  return {
    platform: "shopee", เส้น, http, ขนาด: n,
    ผล: code ? แปลผล(code, message) : "ไม่รู้",
    code, message, requestId: data?.request_id ?? null,
    ...(code ? {} : { เตือน: "ไม่มี error กลับมากับรหัสที่ไม่มีอยู่ — ผิดคาด ห้ามอ่านว่ามีสิทธิ์" }),
  };
}

export async function ตรวจTikTok({ ขนาด = 1 } = {}) {
  const เส้น = `/product/${VERSION}/products/${รหัสปลอม}/inventory/update`;
  if (!tiktokReady()) return { platform: "tiktok", ผล: "ไม่รู้", ไม่ได้ยิง: "ยังไม่ได้ตั้งกุญแจ TikTok" };
  const t = await ensureShop().catch((e) => ({ error: String(e?.message || e) }));
  if (!t?.accessToken) return { platform: "tiktok", ผล: "ไม่รู้", ไม่ได้ยิง: `ไม่มี token ที่ใช้ได้${t?.error ? ` (${t.error})` : ""}` };

  // ชั้น ② — อ่านก่อนว่ารหัสปลอมไม่มีในร้าน (callJson โยน error เมื่อ code ≠ 0)
  let อ่านเจอ = false; let อ่านผิด = null;
  try {
    const d = await tiktokCall(`/product/${VERSION}/products/${รหัสปลอม}`);
    อ่านเจอ = Boolean(d?.data?.id);
  } catch (e) { อ่านผิด = String(e?.message || e); }
  if (อ่านเจอ) return { platform: "tiktok", ผล: "ไม่รู้", ไม่ได้ยิง: `รหัสปลอม ${รหัสปลอม} มีอยู่ในร้านจริง — หยุด` };
  if (อ่านผิด && แปลผล(null, อ่านผิด) !== "มีสิทธิ์" && !/^\d+:/.test(อ่านผิด)) {
    return { platform: "tiktok", ผล: "ไม่รู้", ไม่ได้ยิง: "ยืนยันไม่ได้ว่ารหัสปลอมไม่มีในร้าน", อ่าน: อ่านผิด.slice(0, 200) };
  }

  try {
    const n = ขนาดจาก(ขนาด);
    const skus = Array.from({ length: n }, (_, i) => ({ id: String(i + 1), inventory: [{ quantity: 0 }] }));
    const d = await tiktokCall(เส้น, { method: "POST", body: { skus } });
    return { platform: "tiktok", เส้น, ผล: "ไม่รู้", code: d?.code ?? 0, message: d?.message ?? null, requestId: d?.request_id ?? null,
      เตือน: "ตอบสำเร็จกับรหัสที่ไม่มีอยู่ — ผิดคาด ห้ามอ่านว่ามีสิทธิ์", อ่านก่อนยิง: อ่านผิด };
  } catch (e) {
    const m = String(e?.message || e);
    const [, code, message] = m.match(/^(\d+):\s*(.*)$/s) || [null, null, m];
    return { platform: "tiktok", เส้น, ขนาด: ขนาดจาก(ขนาด), ผล: แปลผล(code, message), code, message: String(message).slice(0, 300), อ่านก่อนยิง: อ่านผิด?.slice(0, 200) ?? null };
  }
}

export async function ตรวจสิทธิ์เขียนสต็อก({ ขนาด = 1 } = {}) {
  const [shopee, tiktok] = await Promise.all([
    ตรวจShopee({ ขนาด }).catch((e) => ({ platform: "shopee", ผล: "ไม่รู้", error: String(e?.message || e) })),
    ตรวจTikTok({ ขนาด }).catch((e) => ({ platform: "tiktok", ผล: "ไม่รู้", error: String(e?.message || e) })),
  ]);
  return {
    ok: true, at: new Date().toISOString(), รหัสปลอม,
    shopee, tiktok,
    note: "ยิงเส้นเขียนสต็อกด้วยรหัสสินค้าที่ไม่มีจริง (อ่านยืนยันก่อนว่าไม่มีในร้าน) · มีสิทธิ์ = แพลตฟอร์มตอบว่าหาสินค้าไม่เจอ · ไม่มีสิทธิ์ = ตอบเรื่อง scope/permission · ไม่รู้ = อ่านรหัสดิบเอง ห้ามเดา",
  };
}
