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
//    เจ้าที่ยังไม่ได้เชื่อม ⇒ ไม่เคยอยู่ใน checked เลย · ถ้าจอไม่แยก คนจะอ่านว่า
//    "ไม่ได้ลงขายที่นั่น" ทั้งที่ความจริงคือเรายังถามไม่ได้
//    สองอย่างนี้หน้าตาเหมือนกันบนจอ แต่คนละความหมายโดยสิ้นเชิง
//
// ⚠️ **`notConnected` ต้องคิดจากของจริงทุกรอบ ห้ามเขียนตายตัว** — พลาดมาแล้ว 4 ก.ย. 2569
//    เดิมเขียนตายตัวว่า "Lazada ยังรอ review" ทั้งที่ Lazada อนุมัติไปตั้งแต่ 30 ส.ค.
//    ข้อความที่แช่ไว้จะกลายเป็นคำโกหกเงียบ ๆ ในวันที่สถานะจริงเปลี่ยน และไม่มีอะไรฟ้อง
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

/** รหัสที่กำลังลงขายบน Lazada */
async function lazadaSkus() {
  const { listedSkus } = await import("./lazada.mjs");
  return await listedSkus();
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

  // เจ้าที่ยัง "เชื่อมไม่ได้" ต้องไม่เข้าลูป — ไม่งั้นมันจะไปโผล่ใน failed
  // ซึ่งอ่านว่า "ล่ม" ทั้งที่ความจริงคือยังไม่ได้กดอนุญาต คนละเรื่องกัน
  const notConnected = {};
  const { validToken: lzToken } = await import("./lazada.mjs");
  const lzOk = await lzToken().catch(() => null);
  if (!lzOk) notConnected.lazada = "ยังไม่ได้กดอนุญาตให้เว็บเข้าถึงร้าน Lazada (ที่ /api/lazada/auth)";

  const sources = [
    ["shopee", shopeeSkus],
    ["tiktok", tiktokSkus],
  ];
  if (lzOk) sources.push(["lazada", lazadaSkus]);

  for (const [tag, fn] of sources) {
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
    notConnected, // ยังเชื่อมไม่ได้ = ยังไม่รู้ ไม่ใช่ "ไม่มีของลงขาย"
    failed,
    listings: Object.fromEntries([...bySku].map(([k, v]) => [k, v])),
  };
  await store.setJSON(CACHE_KEY, out);
  return { ...out, cached: false };
}
