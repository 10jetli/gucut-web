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

/** อ่านเลขจากช่องของ ZORT ตามลำดับที่ลอง — คืน `null` เมื่อ **ไม่มีช่องนั้นหรืออ่านไม่ออก**
 *
 *  🔴 ทำไมต้องมี (19 ก.ย. 2569) — ของเดิมเป็น `num()` แบบที่มีอยู่อีก 26 ที่ใน repo
 *     ซึ่ง **กลืน "อ่านไม่ได้" เป็น 0** (ลบตัวนั้นออกจากไฟล์นี้แล้ว ไม่ทิ้งไว้ให้ใครหยิบใช้ต่อ)
 *     ⇒ วันที่ ZORT เปลี่ยนชื่อช่อง (`availablestock`/`stock` หายทั้งคู่) แต่ยังส่งแถวมาพร้อม `sku`
 *       เราจะได้ map ที่ **สมบูรณ์ทุกคีย์แต่เป็นศูนย์ทั้งหมด** ⇒ ไม่มีใคร throw ⇒ `partial` เป็น false
 *       ⇒ **เขียนทับแคชด้วยสต็อกศูนย์** ⇒ `liveStock()` คืน `stale: false` = หน้าตาสุขภาพดีทุกประการ
 *       ⇒ หน้าร้านขึ้น "สินค้าหมด" ทั้งเว็บ · `/products.json` บอก AI ว่าไม่มีของ · ลูกค้าซื้อไม่ได้
 *       ⇒ และ **ช่องราคา** เป็นทางเดียวกัน: ราคาอ่านไม่ได้ ⇒ 0 บาท ⇒ ขายฟรี
 *     🔑 ศูนย์อันตรายกว่าว่างเปล่า — **ว่างทำให้คนสงสัย แต่ศูนย์ทำให้คนสบายใจ**
 *        (ประโยคนี้อยู่ใน `lazada.mjs` มาตั้งแต่ 11 ก.ย. ⇒ ฝั่ง Lazada มีด่านตรวจรูปร่างระดับ sku
 *         ที่ **โยน error** เมื่อชนิดข้อมูลไม่ตรง · ไฟล์นี้กับ shopee/tiktok/pos/ads **ยังไม่มี**)
 *  🔑 `0` กับ "อ่านไม่ได้" ต้องแยกกันเสมอ — ถอดจุลภาคด้วย เพราะถ้าวันหนึ่งเลขมาเป็น "1,234"
 *     `Number()` จะให้ NaN แล้วกลายเป็น 0 (ยิงวัด 12 ก.ย. 2569 ฝั่ง Lazada ว่าเป็น number จริง
 *     แต่ **นั่นคือค่าของวันนั้น ไม่ใช่สัญญา** — ถอดไว้ไม่มีผลข้างเคียงกับเลขที่ถูกอยู่แล้ว) */
function เลขหรือnull(...ค่าที่ลองตามลำดับ) {
  for (const v of ค่าที่ลองตามลำดับ) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(String(v).replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

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
/* 🔑 **แยกตัวกวาดออกมาให้ทดสอบได้ด้วยหน้าปลอม โดยเดินโค้ดเส้นเดียวกับของจริง**
   (แพตเทิร์นเดียวกับ `collectLazadaRows` / `collectShopeeItemIds` — กฎ test-must-hit-the-path)
   ⚠️ ห้ามเขียนตัวทดสอบที่ลอกตรรกะไปไว้ในไฟล์เทส — ผลถูกไม่ได้แปลว่าบรรทัดนี้ถูกเรียก
   @param ดึงหน้า (page) => แถว[] | null   (null = โหลดหน้านั้นไม่สำเร็จ ไม่ใช่จบชุด) */
export async function collectZortStock(ดึงหน้า) {

  const map = {};
  const failed = [];
  let page = 1;
  let reachedEnd = false;

  /* ตัวนับ "อ่านไม่ได้" — **นับเสมอ ไม่ว่าจะปกติหรือไม่** เพราะเลขนี้คือหลักฐานว่า
     ด่านข้างล่างมีโอกาสได้ทำงานจริงไหม (ด่านที่ไม่เคยเห็นตัวเลขของตัวเอง = ด่านที่พิสูจน์ไม่ได้) */
  let แถวที่เห็น = 0;
  let อ่านสต็อกไม่ได้ = 0;
  let อ่านราคาไม่ได้ = 0;

  const absorb = (rows) => {
    for (const x of rows) {
      const sku = String(x.sku || "").trim();
      if (!sku) continue;
      แถวที่เห็น++;
      const สต็อก = เลขหรือnull(x.availablestock, x.stock);
      const ราคา = เลขหรือnull(x.sellprice, x.price);
      if (สต็อก === null) อ่านสต็อกไม่ได้++;
      if (ราคา === null) อ่านราคาไม่ได้++;
      /* ⚠️ ยังเก็บ 0 ลง map เหมือนเดิม **โดยตั้งใจ** — ปลายทาง (`useLiveStock` · `products-feed`)
         คาดว่าได้ตัวเลข การเปลี่ยนเป็น null ต้องแก้ปลายทางพร้อมกัน ⇒ คนละใบงาน
         รอบนี้เปลี่ยนแค่ "เรารู้ตัวหรือไม่" ไม่เปลี่ยนค่าที่ส่งออก */
      map[sku] = [สต็อก ?? 0, ราคา ?? 0];
    }
  };

  while (!reachedEnd && page <= MAX_PAGES) {
    const batch = [];
    for (let i = 0; i < CONCURRENCY && page + i <= MAX_PAGES; i++) batch.push(page + i);
    const pages = await Promise.all(batch.map((n) => Promise.resolve(ดึงหน้า(n)).catch(() => null)));

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
    const again = await Promise.all(failed.map((n) => Promise.resolve(ดึงหน้า(n)).catch(() => null)));
    again.forEach((rows, i) => (rows === null ? stillFailed.push(failed[i]) : absorb(rows)));
  }

  if (!Object.keys(map).length) throw new Error("ZORT ไม่ส่งสินค้ามาเลย");

  /* 🔴 **ด่าน: มีแถวมา แต่อ่านสต็อกไม่ได้ทุกแถว = ช่องข้อมูลหาย ห้ามเดินต่อ** (19 ก.ย. 2569)
      ⇒ โยน error เพื่อให้ `liveStock()` ตกไปใช้แคชเก่าแล้วรายงาน `stale: true` ตามที่มันทำอยู่แล้ว
        (ของเก่าที่จริง ดีกว่าของใหม่ที่เป็นศูนย์ทั้งกอง — และ `stale` ขึ้นให้คนเห็นบนหน้าสถานะ)
      🔑 **ด่านนี้ผูกกับ "ช่องไม่มีอยู่" ไม่ใช่ "ค่าเป็น 0"** ⇒ ของจริงที่สต็อกหมดจริงทั้งคลัง
         จะไม่ทำให้ด่านนี้ร้อง (ค่า 0 อ่านได้ ⇒ ไม่ถูกนับ) — นี่คือสิ่งที่ทำให้ด่านแยกแยะได้
      🚫 **ไม่ตั้งเพดานเป็นสัดส่วน** (เช่น "เกิน 5% ให้หยุด") เพราะยังไม่ได้วัดว่าของจริง
         มีสินค้าที่ไม่มีช่องราคา/สต็อกอยู่กี่ตัว ⇒ เดาเพดานแล้วพลาดทางนี้จะเจ็บหนักกว่า:
         ถ้าไปผูกกับ `partial` แล้วสัดส่วนจริงเกินเพดานทุกวัน ⇒ **แคชไม่ถูกเขียนเลย
         ⇒ กวาดทั้งคลังใหม่ทุกคำขอ** ซึ่งเป็นบั๊กที่เคยเจอจริง 28 ส.ค. 2569 และแพงมาก
         ⇒ รอบนี้จึง **รายงานตัวเลข** ไว้ก่อน แล้วค่อยรัดเมื่อมีค่าจริงสะสม
      📏 ตัวเลขที่ต้องวัดก่อนจะรัดเพดานได้: `unreadableStock` / `unreadablePrice` ในรอบปกติ
         ควรเป็น 0 — ถ้าไม่ใช่ 0 ต้องรู้ก่อนว่าทำไม แล้วเพดานจึงมีความหมาย */
  if (แถวที่เห็น > 0 && อ่านสต็อกไม่ได้ === แถวที่เห็น) {
    throw new Error(
      `ZORT ส่งสินค้ามา ${แถวที่เห็น} แถว แต่ **อ่านช่องสต็อกไม่ได้เลยสักแถว** ` +
      "(ไม่มีทั้ง availablestock และ stock) ⇒ น่าจะเปลี่ยนชื่อช่องข้อมูล " +
      "⇒ หยุดไว้ก่อน ไม่เขียนสต็อกศูนย์ทับของเก่า — ต้องไปแก้ชื่อช่องใน zort-stock.mjs ให้ตรงก่อน"
    );
  }

  return {
    at: Date.now(),
    map,
    partial: stillFailed.length > 0,
    /* ⚠️ ส่งออกเพื่อให้หน้าสถานะเห็นได้ — **ตัวนับที่ไม่มีใครเห็น คือตัวนับที่ไม่มีใครเชื่อ** */
    rowsSeen: แถวที่เห็น,
    unreadableStock: อ่านสต็อกไม่ได้,
    unreadablePrice: อ่านราคาไม่ได้,
  };
}

/** ตัวกวาดของจริง — ประกอบรหัสร้านเข้ากับตัวดึงหน้าจริง แล้วเรียกเส้นเดียวกับที่เทสเดิน */
async function scrape() {
  const headers = creds();
  if (!headers) throw new Error("ยังไม่ได้ตั้งรหัส ZORT");
  return collectZortStock((page) => fetchPage(headers, page));
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
