// สต็อกและราคาสดของ "สินค้าทุกตัว" จาก ZORT
//
// ต่างจาก netlify/functions/stock.mjs ที่ถามทีละรหัส (ใช้ตอนลูกค้าเปิดหน้าสินค้า)
// ตัวนี้กวาดทั้งคลังมาทีเดียว ใช้ทำฟีดสินค้าให้ผู้ช่วย AI อ่าน
//
// ⚠️ กวาดทั้งคลังหนักและช้า ห้ามยิงทุกคำขอ
//    เก็บผลไว้ 30 นาที · ถ้า ZORT ล่มให้ใช้ของเก่าต่อไปเรื่อย ๆ ดีกว่าไม่มีอะไรเลย
//
// ⚠️ Netlify ให้ฟังก์ชันแบบรอผลทำงานได้สูงสุด 26 วินาที
//    จึงต้องดึงหลายหน้าพร้อมกัน ไม่ใช่ไล่ทีละหน้า (เคยพลาดที่หลังร้านตัวเก่ามาแล้ว)
import { getStore } from "@netlify/blobs";

const ZORT = "https://open-api.zortout.com/v4/Product/GetProducts";
const PAGE = 200;          // จำนวนต่อหน้า
const CONCURRENCY = 6;     // ดึงพร้อมกันกี่หน้า
const MAX_PAGES = 30;      // กันวนไม่รู้จบ (30 × 200 = 6,000 รายการ)
const FRESH_MS = 30 * 60 * 1000;

const store = () => getStore({ name: "gucut-coupon", consistency: "eventual" });
const KEY = "zort-stock";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function creds() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME || !ZORT_APIKEY || !ZORT_APISECRET) return null;
  return { storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET };
}

async function fetchPage(headers, page) {
  const r = await fetch(`${ZORT}?page=${page}&limit=${PAGE}`, {
    headers,
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`zort ${r.status}`);
  const d = await r.json().catch(() => ({}));
  return d.list || d.List || [];
}

/** กวาดสต็อกทั้งคลัง — คืน { at, map: { "<sku>": [สต็อก, ราคา] } } */
async function scrape() {
  const headers = creds();
  if (!headers) throw new Error("ยังไม่ได้ตั้งรหัส ZORT");

  const map = {};
  let page = 1;
  let done = false;

  while (!done && page <= MAX_PAGES) {
    const batch = [];
    for (let i = 0; i < CONCURRENCY && page + i <= MAX_PAGES; i++) batch.push(page + i);
    const pages = await Promise.all(batch.map((n) => fetchPage(headers, n).catch(() => null)));

    for (const rows of pages) {
      if (!rows || rows.length === 0) { done = true; continue; }
      for (const x of rows) {
        const sku = String(x.sku || "").trim();
        if (sku) map[sku] = [num(x.availablestock ?? x.stock), num(x.sellprice ?? x.price)];
      }
      if (rows.length < PAGE) done = true;
    }
    page += CONCURRENCY;
  }

  if (!Object.keys(map).length) throw new Error("ZORT ไม่ส่งสินค้ามาเลย");
  return { at: Date.now(), map };
}

/**
 * สต็อกสด — อ่านจากที่เก็บก่อน ถ้าเก่าเกิน 30 นาทีค่อยไปกวาดใหม่
 * คืน { at, map, stale } · stale = true แปลว่าเป็นของเก่าเพราะ ZORT มีปัญหา
 */
export async function liveStock() {
  const s = store();
  let cached = null;
  try {
    cached = await s.get(KEY, { type: "json" });
  } catch { /* อ่านแคชไม่ได้ ไปกวาดใหม่ */ }

  if (cached?.map && Date.now() - cached.at < FRESH_MS) return { ...cached, stale: false };

  try {
    const fresh = await scrape();
    s.setJSON(KEY, fresh).catch(() => {});   // เขียนแบบไม่รอ ผู้ใช้ไม่ควรต้องรอขั้นตอนนี้
    return { ...fresh, stale: false };
  } catch {
    // ZORT ล่มหรือช้า — ใช้ของเก่าต่อไปดีกว่าไม่มีอะไรเลย
    if (cached?.map) return { ...cached, stale: true };
    return { at: 0, map: null, stale: true };
  }
}
