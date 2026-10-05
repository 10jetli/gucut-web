// สต็อก/ราคาสดจาก ZORT — เสิร์ฟที่ /api/stock?sku=XXXX
// รหัส API อยู่ใน Environment Variables ของ Netlify เท่านั้น (ไม่อยู่ในโค้ด)
//   ZORT_STORENAME / ZORT_APIKEY / ZORT_APISECRET
// ตอบ: { found: true, st: <สต็อกพร้อมขาย>, p: <ราคาขาย> }
//      สินค้าเป็นชุด (โซ่ตัดขาย) ตอบ { found: true, st, kind: "bundle", priceFrom: "web" }
//      **ไม่มี p โดยตั้งใจ** — ราคาเว็บกับ ZORT ยังไม่ตรงกัน 100 รหัส รอเจ้าของร้านตัดสิน
// cache ที่ edge 3 นาที — ลูกค้าคนถัดไปได้คำตอบทันทีไม่ต้องรอ ZORT

import { licensedStock, LICENSED_ASOF } from "../lib/licensed-stock.mjs";
import { ทะเบียนเหลือทุกกลุ่ม, ทะเบียนเหลือของรหัส, ทะเบียนอ่านไม่ได้ } from "../lib/core-registry.mjs";

const ZORT = "https://open-api.zortout.com/v4/Product/GetProducts";

/* ══════ 🔁 ตัวหักกลับ: จำนวนของทะเบียนต้องอ่านสด ไม่ใช่ค่าแช่แข็ง ══════
   (ท่านประธานสั่ง 5 ต.ค. 2569 "ทำขั้น ③ ตัวหักกลับต่อเลย")
   เดิม `licensedStock()` คืนค่าคงที่ที่นับด้วยมือเมื่อ `LICENSED_ASOF` ⇒ **ขายแล้วเลขไม่ลด**

   ⏱️ **เส้นนี้อยู่บนทางที่ลูกค้ากดจริง** (`VariantSheet.tsx` ยิงตอนแตะตัวเลือก)
      และ D1 อยู่ APAC ส่วนฟังก์ชันอยู่ US ⇒ ไป-กลับ ~286ms (ฝั่งท่อวัดไว้)
      ⇒ กัน 2 ชั้น **ไม่ให้ลูกค้าจ่ายเวลาเพิ่ม**:
        ① อ่านทะเบียน **ทั้งก้อนครั้งเดียว** (311 แถว เล็กมาก) แล้วถือไว้ในอินสแตนซ์ 60 วิ
           ⇒ หน้าสินค้าที่มี 10 ตัวเลือกยิง 10 ครั้ง เสียเวลาแค่ครั้งแรก
        ② **ยิงขนานกับ ZORT ไม่ใช่ต่อคิว** — เส้นนี้ต้องถาม ZORT เอาราคาอยู่แล้วทุกคำขอ
           ⇒ เริ่ม promise ไว้ก่อน fetch แล้วไป await ที่ประตูทางออก ⇒ ซ่อนเวลาไว้ใต้ ZORT
      (เส้นนี้ยังแคชที่ขอบ 180 วิเหมือนเดิม — แต่คำขอแรกของทุกรหัสในทุกหน้าต่างยังโดนเต็ม) */
let แคชทะเบียน = { เมื่อ: 0, m: null };
const อายุแคช = 60_000;

async function กลุ่มที่เหลือ() {
  const ตอนนี้ = Date.now();
  if (แคชทะเบียน.m && ตอนนี้ - แคชทะเบียน.เมื่อ < อายุแคช) return แคชทะเบียน.m;
  const m = await ทะเบียนเหลือทุกกลุ่ม();
  แคชทะเบียน = { เมื่อ: ตอนนี้, m };
  return m;
}

/** จำนวนของทะเบียนสำหรับรหัสนี้ — **สามสถานะ ห้ามยุบ**
 *  คืน `null` = ไม่ใช่ของในทะเบียน (ผู้เรียกไปใช้ ZORT ต่อ)
 *  คืน `{ st, src: "licensed-live" }`   = เลขสดจากทะเบียน
 *  คืน `{ st, src: "licensed-frozen" }` = อ่านสดไม่ได้ ⇒ ใช้ค่าแช่แข็ง **และประกาศว่าไม่ใช่เลขสด**
 *  🚫 ห้ามให้ "อ่านไม่ได้" กลายเป็น 0 (ปิดขายของที่มี) หรือเป็น null (เด้งไปอ่าน ZORT ที่เชื่อไม่ได้) */
async function จำนวนจากทะเบียน(sku) {
  const frozen = licensedStock(sku);
  if (frozen === null) return null;
  try {
    const live = await ทะเบียนเหลือของรหัส(sku, { กลุ่มที่เหลือ: await กลุ่มที่เหลือ() });
    if (live === null) return null; // ไม่ควรเกิด (frozen รู้จักแต่แมปไม่รู้จัก) ⇒ ด่านเทสบังคับสองทิศไว้แล้ว
    /* 🟡 **ตัวควบคุมนี้มีวันหมดอายุ — เกณฑ์ต้องเป็น "live > frozen" ไม่ใช่ "ไม่เท่ากัน"**
       `LICENSED_ASOF` เป็นภาพนิ่ง ⇒ ยิ่งเวลาผ่าน live ยิ่งน้อยกว่า frozen **โดยถูกต้อง** (ของขายออกไป)
       ⇒ ตั้ง "ต่างกัน = เตือน" วันหนึ่งจะเตือนทุกรอบจนไม่มีใครอ่าน [[nets-expire-silently]]
       ⇒ ที่ผิดแน่คือ **live > frozen** เพราะของในทะเบียนเพิ่มเองไม่ได้ (ต้องมีคนนำเข้าล็อตใหม่)
       ⚠️ เงื่อนไขที่ทำให้ตัวควบคุมนี้เลิกมีความหมาย: **มีการนำเข้าล็อตใหม่** หรือ **มีคนอัปเดต LICENSED**
          วันนั้น `live > frozen` จะเป็นเรื่องปกติ ⇒ ต้องอัปเดต `LICENSED_ASOF` พร้อมกันทุกครั้ง */
    /* 🔑 **ค่าของ `src` ต้องคงเป็น "licensed" เหมือนเดิม — ห้ามเปลี่ยนเป็น licensed-live**
       `core-stock.mjs:648` และ `lib/stock-source.ts` ฝั่งจอเทียบค่านี้อยู่ · และหัวไฟล์นี้
       เขียนกติกาไว้เองว่า **เพิ่มช่องอย่างเดียว ไม่เปลี่ยนของเดิม** (prepare-to-receive)
       ⇒ ความสด/ไม่สด ไปอยู่ช่องใหม่ `licensedSrc` ⇒ ฝั่งรับไม่ต้องแก้พร้อมกัน
       [[เปลี่ยนชื่อค่าในสัญญาร่วมต้องบอกว่าใครอ่านค่านั้น]] */
    return { st: live, meta: { licensedSrc: "live", frozen, live, frozenAsOf: LICENSED_ASOF,
             ...(live > frozen ? { ผิดทิศ: "live > frozen — ของในทะเบียนเพิ่มเองไม่ได้ ⇒ มีคนนำเข้าล็อตใหม่แล้วไม่ได้อัปเดต LICENSED หรือทะเบียนถูกแก้" } : {}) } };
  } catch (e) {
    const เหตุ = e instanceof ทะเบียนอ่านไม่ได้ ? e.message : `อ่านทะเบียนล้ม: ${e?.message || e}`;
    return { st: frozen, meta: { licensedSrc: "frozen", frozen, live: null, frozenAsOf: LICENSED_ASOF, ไม่ใช่เลขสดเพราะ: เหตุ } };
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const sku = (url.searchParams.get("sku") || "").trim();
  if (!sku || sku.length > 64) {
    return json({ error: "sku required" }, 400, 60);
  }

  /* ── ของในทะเบียนใบอนุญาต: จำนวนมาจากทะเบียน ไม่ใช่ ZORT ── (25 ก.ย. 2569)
     เจ้าของร้านสั่ง "เปิดขายที่เว็บ ไม่ได้ใช้สต๊อค zort" (เลื่อย) + "บาร์ด้วย"
     วัดจริง: รหัสเลื่อยทั้ง 9 รุ่น ZORT ตอบ found:false · รหัสบาร์ ZORT รู้จักแต่ `02984` ติดลบ -3
     ⚠️ **ยังถาม ZORT ต่อเพื่อเอา "ราคา" เหมือนเดิม** ทับเฉพาะ `st` เท่านั้น
        ถ้าลัดกลับตรงนี้เลย ราคาที่ลูกค้าเห็นจะเปลี่ยนเป็นค่าในไฟล์สินค้าทันที
        (NW 8800: ZORT 18,000 · ไฟล์ 20,000) — การแตะราคาเป็นเรื่องของเจ้าของร้าน ไม่ใช่ผลพลอยได้ */
  /* ⏱️ เริ่มไว้ก่อน **ห้าม await ที่บรรทัดนี้** — ต้องให้ fetch ZORT ข้างล่างออกตัวไปพร้อมกัน
     (await ที่นี่ = ต่อคิว ⇒ ลูกค้าจ่ายเวลา D1 เต็ม ๆ ทุกครั้งที่แตะตัวเลือก) */
  const ทะเบียนรอ = จำนวนจากทะเบียน(sku);
  /* 🔑 **ไม่ต้องมี `.catch` กันลอย** — `จำนวนจากทะเบียน()` ครอบ try/catch ทั้งก้อน
     (รวม `await กลุ่มที่เหลือ()` ที่อยู่ในนั้น) ⇒ promise นี้ **ไม่มีทาง reject**
     ⇒ `.catch(() => {})` ที่ใส่ไว้รอบแรกเป็นโค้ดตาย และด่าน "promise ปล่อยลอย" จับได้ถูกแล้ว
     ⚠️ ใครแก้ `จำนวนจากทะเบียน()` ให้ throw ออกมาได้ **ต้องกลับมาจัดการตรงนี้ด้วย** */

  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME || !ZORT_APIKEY || !ZORT_APISECRET) {
    // ยังไม่ได้ตั้งค่า env vars ใน Netlify — ของในทะเบียนยังตอบได้ ไม่ต้องพึ่ง ZORT
    { const lic = await ทะเบียนรอ;
      /* 🔑 **ต้องพิมพ์ `src: "licensed"` ออกมาเป็นตัวอักษรที่นี่ ห้ามซ่อนใน spread**
         ด่าน "นับประตู" อ่านซอร์สแล้วบังคับว่าทุกทางที่ตอบ found:true ต้องประกาศที่มา
         ⇒ `...lic` ที่มี src อยู่ข้างใน **ถูกต้องตอนรัน แต่คนอ่านซอร์สมองไม่เห็น** ⇒ ด่านแดงถูกแล้ว */
      if (lic) return json({ found: true, st: lic.st, src: "licensed", ...lic.meta }, 200, 180); }
    return json({ error: "not configured" }, 503, 0);
  }

  let res;
  try {
    res = await fetch(`${ZORT}?keyword=${encodeURIComponent(sku)}&limit=25`, {
      headers: {
        storename: ZORT_STORENAME,
        apikey: ZORT_APIKEY,
        apisecret: ZORT_APISECRET,
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // ZORT ล่มก็ยังขายของในทะเบียนได้ — จำนวนไม่ได้อยู่ที่ ZORT ตั้งแต่ต้น
    { const lic = await ทะเบียนรอ; if (lic) return json({ found: true, st: lic.st, src: "licensed", ...lic.meta }, 200, 180); }
    return json({ error: "zort unreachable" }, 502, 0);
  }
  if (!res.ok) {
    { const lic = await ทะเบียนรอ; if (lic) return json({ found: true, st: lic.st, src: "licensed", ...lic.meta }, 200, 180); }
    return json({ error: "zort " + res.status }, 502, 0);
  }

  const data = await res.json().catch(() => ({}));
  const skuLower = sku.toLowerCase();
  const exact = (arr) =>
    (arr || []).find((x) => String(x.sku || "").trim().toLowerCase() === skuLower);

  let hit = exact(data.list || data.List);

  // SKU แบบมีขีด (เช่น 00894-22T) — ZORT ค้นทั้งก้อนไม่เจอ
  // ลองใหม่ด้วยรหัสฐานก่อนขีด แล้วจับคู่ SKU เต็มแบบเป๊ะ ๆ ในผลลัพธ์
  if (!hit && sku.includes("-")) {
    const base = sku.split("-")[0];
    if (base.length >= 3) {
      try {
        const r2 = await fetch(
          `${ZORT}?keyword=${encodeURIComponent(base)}&limit=100`,
          {
            headers: {
              storename: ZORT_STORENAME,
              apikey: ZORT_APIKEY,
              apisecret: ZORT_APISECRET,
            },
            signal: AbortSignal.timeout(8000),
          }
        );
        if (r2.ok) {
          const d2 = await r2.json().catch(() => ({}));
          hit = exact(d2.list || d2.List);
        }
      } catch {
        /* ใช้ผลรอบแรกต่อ */
      }
    }
  }

  /* ── ยังไม่เจอ: ลองในสินค้าเป็นชุด (Bundle) ── (5 ก.ย. 2569)
      ⚠️ **โซ่ตัดขายทุกความยาวอยู่ใน Bundle ไม่ได้อยู่ใน Product** — 148 รหัส
         ZORT คิดจำนวนที่ขายได้ให้เองจากม้วนแม่ (00369 ม้วน 5,911 ÷ 25 ⇒ 00369-25T ได้ 236)
         ตัวนี้เลยเคยตอบ found:false กับสินค้ากลุ่มนี้มาตลอด แล้วหน้าเว็บต้องคำนวณเอง

      🛑 **ห้ามคืนราคาจาก Bundle เด็ดขาด** — ฝั่งจอตรวจแล้ว 5 ก.ย. 2569
         ราคาบนเว็บกับราคาใน ZORT **ต่างกัน 100 จาก 146 รหัส** (00369-25T เว็บ 380 · ZORT 450)
         และ `orders.mjs` มีท่อน `if (zp > 0 && zp !== i.price) i.price = zp`
         ⇒ ถ้าส่งราคาไปด้วย **ลูกค้าที่เห็น 380 จะถูกเรียกเก็บ 450 ทันที โดยไม่มีอะไรบอกเขา**
         ยังไม่มีใครรู้ว่าฝั่งไหนถูก ⇒ **เป็นเรื่องที่เจ้าของร้านต้องตัดสิน ไม่ใช่เรา**
      ⇒ คืนแต่ `st` · ไม่มี `p` ⇒ หน้าเว็บใช้ราคาเดิมของตัวเอง และตัวตรวจราคาไม่ทำงานกับกลุ่มนี้
         (เหมือนเดิมทุกประการ — เปลี่ยนแค่ "รู้จำนวน" ไม่เปลี่ยน "รู้ราคา") */
  if (!hit) {
    try {
      const rb = await fetch(
        `https://open-api.zortout.com/v4/Bundle/GetBundles?keyword=${encodeURIComponent(sku)}&limit=25`,
        {
          headers: {
            storename: ZORT_STORENAME,
            apikey: ZORT_APIKEY,
            apisecret: ZORT_APISECRET,
          },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (rb.ok) {
        const db = await rb.json().catch(() => ({}));
        const b = exact(db.list || db.List);
        if (b) {
          // ⚠️ ไม่มี p โดยตั้งใจ — ดูเหตุผลด้านบน ห้ามเติมกลับโดยไม่ถามเจ้าของร้าน
          return json(
            { found: true, st: toNum(b.availablestock ?? b.stock), kind: "bundle", priceFrom: "web" },
            200,
            180
          );
        }
      }
    } catch {
      /* ถามชุดไม่ได้ก็ตอบ not found เหมือนเดิม — ห้ามล้ม */
    }
    // ZORT ไม่รู้จัก แต่ทะเบียนรู้ — เป็นทางปกติของรหัสเลื่อยทั้ง 9 รุ่น ไม่ใช่ความผิดพลาด
    { const lic = await ทะเบียนรอ; if (lic) return json({ found: true, st: lic.st, src: "licensed", ...lic.meta }, 200, 180); }
    return json({ found: false }, 200, 300);
  }

  const st = toNum(hit.availablestock ?? hit.stock);
  const p = toNum(hit.sellprice ?? hit.price);
  /* 🔑 **ทุกคำตอบที่บอกว่า `found: true` ต้องบอกด้วยว่าเลขมาจากไหน** (28 ก.ย. 2569 · ใบ t_mul1ost0)
     เส้นนี้มีทางออก 12 ทาง และ **ห้าทางตอบ `found:true`** ⇒ ก่อนหน้านี้สองทางสุดท้าย
     (ของที่ ZORT รู้จัก) ไม่ติดที่มาเลย ⇒ "มาจาก ZORT" เป็นความหมายโดยปริยาย
     ⇒ ประตูใหม่ที่ตอบ `found:true` โดยไม่บอกที่มา จะกลืนไปกับสองทางนี้ **ไม่มีใครเห็น**
     ⇒ ติด `src` ให้ครบทุกทาง ⇒ ด่านบังคับได้ว่า "ทุกประตูที่บอกว่าเจอ ต้องประกาศที่มา"
     ⚠️ **เพิ่มช่องอย่างเดียว ไม่เปลี่ยนของเดิม** — `useLiveStock.ts:58` อ่านแค่ `found`/`st`/`p`
        (กติกา prepare-to-receive: ฝั่งรับไม่ต้องแก้พร้อมกัน) */
  // ทะเบียนชนะ ZORT เรื่องจำนวนเสมอ — แต่ราคายังเป็นของ ZORT เหมือนเดิม
  const lic = await ทะเบียนรอ;
  if (lic) return json({ found: true, st: lic.st, p, src: "licensed", ...lic.meta }, 200, 180);
  return json({ found: true, st, p, src: "zort" }, 200, 180);
}

export const config = { path: "/api/stock" };

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function json(body, status, edgeSeconds) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (edgeSeconds > 0) {
    headers["Cache-Control"] = "public, max-age=30";
    headers["Netlify-CDN-Cache-Control"] =
      `public, s-maxage=${edgeSeconds}, stale-while-revalidate=900`;
  } else {
    headers["Cache-Control"] = "no-store";
  }
  return new Response(JSON.stringify(body), { status, headers });
}
