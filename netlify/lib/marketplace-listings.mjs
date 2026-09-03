// รหัสสินค้าที่ "กำลังลงขายอยู่จริง" บนแต่ละมาร์เก็ตเพลส — สำหรับคอลัมน์ Marketplace แบบ ZORT
//
// ⚠️ **ต้องดึงจากรายการสินค้าบนแพลตฟอร์ม ไม่ใช่จากประวัติการขาย** (ฝั่งจอทักไว้ 3 ก.ย. 2569)
//    "เคยขายเมื่อปีที่แล้ว" กับ "กำลังลงขายอยู่ตอนนี้" คนละเรื่องกัน
//    เอาประวัติมาใช้ = โลโก้ขึ้นเต็มไปหมดกับของที่ถอดออกไปนานแล้ว
//
// ⚠️ **ZORT ไม่มีข้อมูลนี้ให้** — ตรวจครบทั้ง 30 ฟิลด์ของ Product/GetProducts แล้ว 3 ก.ย. 2569
//    `tag` · `properties` · `sharelink` · `variant` · `inventoryDetails` ว่างทั้งหมดทุกตัว
//    ⇒ ต้องถามแพลตฟอร์มเอง ไม่มีทางลัดจากต้นทาง
//
// ⚠️ **"ไม่มีโลโก้" กับ "เช็คไม่ได้" ต้องแยกออกจากกันเสมอ**
//    Lazada ยังรอ review ⇒ ไม่เคยอยู่ใน checked เลย · ถ้าจอไม่แยก คนจะอ่านว่า
//    "ไม่ได้ลงขายที่ Lazada" ทั้งที่ความจริงคือเรายังไม่มีสิทธิ์ถาม
//    สองอย่างนี้หน้าตาเหมือนกันบนจอ แต่คนละความหมายโดยสิ้นเชิง
import { getStore } from "@netlify/blobs";

const CACHE_KEY = "marketplace-listings";
const TTL_MS = 30 * 60e3; // ครึ่งชั่วโมง — จอนี้เปิดบ่อย ไม่ควรยิงแพลตฟอร์มทุกครั้ง

/** รหัสที่กำลังลงขายบน Shopee */
async function shopeeSkus() {
  const { shopeeListedSkus } = await import("./shopee-stock.mjs");
  return await shopeeListedSkus();
}

/** รหัสที่กำลังลงขายบน TikTok Shop */
async function tiktokSkus() {
  const { shopCall, ensureShop } = await import("./tiktok.mjs");
  await ensureShop();
  const out = new Set();
  let token = "";
  for (let p = 0; p < 25; p++) {
    const d = await shopCall("/product/202309/products/search", {
      method: "POST",
      query: { page_size: "100", ...(token ? { page_token: token } : {}) },
      body: { status: "ACTIVATE" },
    });
    for (const it of d?.data?.products ?? []) {
      for (const s of it?.skus ?? []) {
        const code = String(s?.seller_sku ?? "").trim();
        if (code) out.add(code);
      }
    }
    token = d?.data?.next_page_token || "";
    if (!token) break;
  }
  return out;
}

/** map รหัส → รายชื่อช่องทางที่กำลังลงขาย + บอกว่ารอบนี้ถามใครได้บ้าง
 *  ⚠️ แพลตฟอร์มไหนล่ม = **ไม่นับว่าเช็คแล้ว** ห้ามตีเป็น "ไม่ได้ลงขาย"
 *     ยอมให้จอบอกว่า "เช็คไม่ได้" ดีกว่าบอกผิดว่าไม่มีของลงขาย */
export async function marketplaceListings() {
  const store = getStore("gucut-coupon");
  const cached = await store.get(CACHE_KEY, { type: "json" }).catch(() => null);
  if (cached?.at && Date.now() - cached.at < TTL_MS) return { ...cached, cached: true };

  const checked = [];
  const failed = {};
  const bySku = new Map();
  const add = (set, tag) => {
    for (const s of set) {
      const k = String(s).trim();
      if (!k) continue;
      if (!bySku.has(k)) bySku.set(k, []);
      bySku.get(k).push(tag);
    }
  };

  for (const [tag, fn] of [
    ["shopee", shopeeSkus],
    ["tiktok", tiktokSkus],
  ]) {
    try {
      const set = await fn();
      if (set && set.size) {
        add(set, tag);
        checked.push(tag);
      } else {
        failed[tag] = "เชื่อมต่อได้แต่ไม่พบสินค้าที่ลงขายอยู่";
      }
    } catch (e) {
      failed[tag] = String(e?.message || e).slice(0, 160);
    }
  }

  const out = {
    at: Date.now(),
    checked, // ถามได้จริงรอบนี้
    // ⚠️ Lazada ไม่เคยอยู่ใน checked — ยังรอ review อยู่ ไม่ใช่ว่าไม่มีของลงขาย
    notConnected: { lazada: "ยังรอ Lazada อนุมัติสิทธิ์ใช้ API" },
    failed,
    listings: Object.fromEntries([...bySku].map(([k, v]) => [k, v])),
  };
  await store.setJSON(CACHE_KEY, out);
  return { ...out, cached: false };
}
