/* 🏷️ นับเอกสาร 4 ชนิดของ ZORT แยกสองร้าน — ใบกระดาน t_mu28iq46 (15 ก.ย. 2569)
   คำถาม: ร้าน z2 (ceojet · หน้าร้าน POS) มีใบซื้อ · ใบเสนอราคา · ใบคืน · ใบโอน จริงไหม
   ⇒ ถ้าเป็น 0 ทั้งหมด ไม่ต้องลงแรงดึงของ z2 เข้ากระจก · ถ้าไม่ 0 ต้องทำ
   🔒 คืน "จำนวน" อย่างเดียว — ไม่คืนแถว ไม่คืนข้อมูลลูกค้า · GET ไป ZORT เท่านั้น
   ⚠️ ร้าน z1 ยิงคู่กันทุกครั้งเป็นตัวควบคุมบวก (รู้ค่าอยู่แล้ว) — z1 ได้ unknown ⇒ ผล z2 เชื่อไม่ได้
   ⚠️ **ไม่มี count ที่เป็นตัวเลข = unknown ไม่ใช่ 0** — ZORT ตอบ HTTP 200 พร้อม resCode ผิดพลาดได้
      ถ้าปัด 0 จะได้คำตอบ "z2 ไม่มีเอกสาร" ที่หน้าตาเหมือนผลจริงทุกประการ */
const BASE = "https://open-api.zortout.com/v4";
export const DOC_PATHS = {
  purchases: "PurchaseOrder/GetPurchaseOrders",
  quotations: "Quotation/GetQuotations",
  returnorders: "ReturnOrder/GetReturnOrders",
  transfers: "Transfer/GetTransfers",
};

export function storeCreds(store, env = process.env) {
  const sfx = store === "z2" ? "_2" : store === "z1" ? "" : null;
  if (sfx === null) return null;
  const storename = env[`ZORT_STORENAME${sfx}`];
  const apikey = env[`ZORT_APIKEY${sfx}`];
  const apisecret = env[`ZORT_APISECRET${sfx}`];
  return storename && apikey && apisecret ? { storename, apikey, apisecret } : null;
}

async function countOne(path, creds, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(`${BASE}/${path}?limit=1&page=1`, { headers: creds, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    return { unknown: true, error: `ยิง ZORT ไม่สำเร็จ (${e?.name === "TimeoutError" ? "หมดเวลา" : "เครือข่าย"})` };
  }
  if (!res?.ok) return { unknown: true, error: `ZORT ตอบ HTTP ${res?.status}` };
  let data;
  try {
    data = await res.json();
  } catch {
    return { unknown: true, error: "ZORT ตอบรูปที่อ่านไม่ได้" };
  }
  const resCode = data?.res?.resCode ?? data?.resCode;
  if (resCode !== undefined && resCode !== null && String(resCode) !== "200") {
    return { unknown: true, error: `ZORT resCode ${resCode}`, resDesc: String(data?.res?.resDesc ?? data?.resDesc ?? "").slice(0, 120) };
  }
  const n = data?.count;
  if (typeof n !== "number" && !(typeof n === "string" && /^\d+$/.test(n))) {
    return { unknown: true, error: "ZORT ไม่ส่ง count มา — ห้ามแปลว่า 0" };
  }
  return { count: Number(n) };
}

export async function zortStoreDocCounts(o = {}) {
  const env = o.env ?? process.env;
  const fetchImpl = o.fetch ?? globalThis.fetch;
  const stores = {};
  await Promise.all(["z1", "z2"].map(async (store) => {
    const creds = storeCreds(store, env);
    if (!creds) { stores[store] = { error: `ยังไม่ได้ตั้งรหัส ZORT ของร้าน ${store}` }; return; }
    const entries = await Promise.all(Object.entries(DOC_PATHS).map(async ([k, p]) => [k, await countOne(p, creds, fetchImpl)]));
    stores[store] = Object.fromEntries(entries);
  }));
  const allKnown = (s) => s && !s.error && Object.keys(DOC_PATHS).every((k) => typeof s[k]?.count === "number");
  return {
    ok: true,
    at: new Date().toISOString(),
    stores,
    controlOk: allKnown(stores.z1),
    z2Known: allKnown(stores.z2),
    note: "นับจาก count ของ ZORT (limit=1) · z1 = ตัวควบคุม ถ้า controlOk=false ห้ามเชื่อผล z2 · unknown ≠ 0",
  };
}
