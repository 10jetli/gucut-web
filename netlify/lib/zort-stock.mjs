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
/**
 * กวาดสต็อกทั้งคลัง — คืน { at, map, partial }
 *
 * ⚠️ ต้องแยก "หน้าว่างเพราะหมดแล้ว" ออกจาก "หน้าโหลดไม่สำเร็จ" ให้ขาด
 *    เขียนครั้งแรกใช้ .catch(() => null) แล้วเช็ค !rows รวมกับ length === 0
 *    ผลคือถ้าหน้ากลาง ๆ พลาดหนึ่งหน้า ระบบจะคิดว่า "จบแล้ว" แล้วหยุดกวาดทันที
 *    สินค้าหลายร้อยตัวจะหายไปจากผลลัพธ์เงียบ ๆ โดยไม่มีใครรู้
 *    ตอนนี้: [] = จบจริง · null = พลาด (ลองใหม่อีกรอบ ถ้ายังพลาดถือว่าได้ไม่ครบ)
 */
async function scrape() {
  const headers = creds();
  if (!headers) throw new Error("ยังไม่ได้ตั้งรหัส ZORT");

  const map = {};
  const failed = [];
  let page = 1;
  let reachedEnd = false;

  const absorb = (rows) => {
    for (const x of rows) {
      const sku = String(x.sku || "").trim();
      if (sku) map[sku] = [num(x.availablestock ?? x.stock), num(x.sellprice ?? x.price)];
    }
  };

  while (!reachedEnd && page <= MAX_PAGES) {
    const batch = [];
    for (let i = 0; i < CONCURRENCY && page + i <= MAX_PAGES; i++) batch.push(page + i);
    const pages = await Promise.all(batch.map((n) => fetchPage(headers, n).catch(() => null)));

    pages.forEach((rows, i) => {
      if (rows === null) { failed.push(batch[i]); return; }   // พลาด ไม่ใช่จบ
      absorb(rows);
      if (rows.length < PAGE) reachedEnd = true;              // หน้านี้ไม่เต็ม = หน้าสุดท้าย
    });
    page += CONCURRENCY;
  }

  // ลองหน้าที่พลาดอีกครั้ง ก่อนจะยอมรับว่าได้ไม่ครบ
  const stillFailed = [];
  if (failed.length) {
    const again = await Promise.all(failed.map((n) => fetchPage(headers, n).catch(() => null)));
    again.forEach((rows, i) => (rows === null ? stillFailed.push(failed[i]) : absorb(rows)));
  }

  if (!Object.keys(map).length) throw new Error("ZORT ไม่ส่งสินค้ามาเลย");
  return { at: Date.now(), map, partial: stillFailed.length > 0 };
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
    // ⚠️ ได้มาไม่ครบ ห้ามเขียนทับของเก่าที่ครบกว่า — ใช้ครั้งนี้ไปก่อนแล้วรอบหน้าค่อยลองใหม่
    // ⚠️ ต้อง await — Netlify แช่แข็งฟังก์ชันหลังตอบ promise ลอยตายกลางทาง
    //    แคชไม่เคยถูกเขียนเลย = สต็อก "เก่า 8,213 นาที" บนหน้าสถานะ ทั้งที่กวาดสำเร็จทุกรอบ
    //    แล้วก็เลยกวาดใหม่ทุกคำขอฟรี ๆ ด้วย (เจอจริง 28 ส.ค. 2569 — บทเรียนเดียวกับ keepScan)
    if (!fresh.partial) await s.setJSON(KEY, fresh).catch(() => {});
    return { ...fresh, stale: false };
  } catch {
    // ZORT ล่มหรือช้า — ใช้ของเก่าต่อไปดีกว่าไม่มีอะไรเลย
    if (cached?.map) return { ...cached, stale: true };
    return { at: 0, map: null, stale: true };
  }
}
