// ฟีดสินค้าแบบเครื่องอ่าน — /products.json  (สต็อกสดจาก ZORT)
//
// ทำเพื่อ LLMO/AEO: ผู้ช่วย AI ไล่อ่านหน้าเว็บ 2,482 หน้าไม่ไหว
// แต่ถ้ามีไฟล์เดียวที่บอกครบว่ามีสินค้าอะไร ราคาเท่าไหร่ "ของมีจริงไหมตอนนี้"
// มันจะหยิบไปตอบได้ถูกและครบกว่ามาก
//
// ⚠️ เมื่อก่อนไฟล์นี้เป็นไฟล์นิ่ง สร้างตอน build จากสต็อกที่แช่ไว้ในโปรเจกต์
//    (ไฟล์ src/data/products.json แก้ล่าสุด 15 ส.ค. 2569)
//    แปลว่าของเข้าใหม่หรือของหมด AI ไม่มีวันรู้จนกว่าจะ deploy ใหม่
//    เจ้าของร้านถามตรง ๆ ว่า "ตอนมีของจะรายงาน AI ออโต้ไหม" — คำตอบตอนนั้นคือไม่
//    จึงเปลี่ยนมาประกบสต็อกสดจาก ZORT ตรงนี้
//
// ⚠️ ต้องไม่มีทางตอบพังเด็ดขาด ไล่ลำดับสำรองสามชั้น
//    1. สต็อกสดจาก ZORT (เก็บไว้ใช้ซ้ำ 30 นาที)
//    2. ของเก่าที่เคยกวาดไว้ ถ้า ZORT ล่ม
//    3. สต็อกที่แช่ไว้ในไฟล์ตอน build ถ้าไม่เคยกวาดสำเร็จเลย
import { liveStock } from "../lib/zort-stock.mjs";
import { licensedStock } from "../lib/licensed-stock.mjs";

export default async function handler(req, context) {
  const origin = new URL(req.url).origin;

  // ส่วนที่ไม่ค่อยเปลี่ยน สร้างไว้ตอน build (scripts/gen-feed-base.mjs)
  let base;
  try {
    const r = await fetch(`${origin}/feed-base.json`, { signal: AbortSignal.timeout(8000) });
    base = await r.json();
  } catch {
    return json({ error: "โหลดข้อมูลสินค้าไม่ได้" }, 503, 0);
  }
  const list = Array.isArray(base?.list) ? base.list : [];

  const { map, at, stale } = await liveStock();

  const products = [];
  for (const p of list) {
    const live = map?.[p.sku];
    /* ของในทะเบียนใบอนุญาต — ทะเบียนชนะทั้ง ZORT และค่าที่แช่ไว้ (25 ก.ย. 2569)
       ไม่ใส่ตรงนี้ = บอก ChatGPT/Gemini ว่าเลื่อย 7 รุ่น "หมด" ทั้งที่ทะเบียนมีของ 24 เครื่อง
       (บรรทัดถัดไปกรอง `st > 0` ทิ้ง ⇒ หายจากฟีดไปทั้งรุ่น) */
    const lic = licensedStock(p.sku);
    const st = lic !== null ? lic : live ? live[0] : p.st;  // ไม่มีข้อมูลสด → ใช้ค่าที่แช่ไว้
    const price = live && live[1] > 0 ? live[1] : p.p;
    if (!(st > 0)) continue;                    // ของหมดไม่ต้องบอก AI ให้ไปแนะนำลูกค้า
    products.push({
      sku: p.sku,
      name: p.t,
      url: `${origin}/products/${encodeURIComponent(p.h)}/`,
      price,
      priceMax: p.pmax && p.pmax > price ? p.pmax : undefined,
      currency: "THB",
      inStock: true,
      stock: st,
      image: p.img,
      brand: p.b || "GUCUT",
      rating: p.rv ? { value: p.rv[0], count: p.rv[1] } : undefined,
    });
  }

  return json(
    {
      store: "GUCUT",
      about: "เลื่อยยนต์ NEWWAVE / KingKong ของแท้ โซ่ บาร์ และอะไหล่แยกชิ้น ส่งทั่วไทย",
      site: origin,
      currency: "THB",
      /* 🔴 **เลิกพิมพ์รอบเวลาไว้ในข้อความ** (แก้ 19 ก.ย. 2569)
         ไฟล์นี้บอกบอต AI/ลูกค้าว่าสต็อกสดแค่ไหน ⇒ เขียน "ทุก 30 นาที" ไว้เฉย ๆ
         จะกลายเป็นเท็จวันที่ใครแก้อายุแคชของ `zort-stock` **โดยไม่มีอะไรฟ้อง**
         ⚠️ รอบนี้ **ไม่ได้มาจาก cron** แต่มาจากอายุแคชสต็อก ⇒ คิดจากค่านั้นตรง ๆ
         ⇒ บอกเป็น "ความสดของข้อมูลชุดนี้" ซึ่งตรวจได้จริง ดีกว่าบอกรอบที่อาจไม่ตรง */
      note:
        "สต็อกและราคาดึงจากระบบคลังของร้านโดยตรง · " +
        /* 🔴 ชี้ชื่อช่องที่ **มีอยู่จริงในไฟล์นี้** เท่านั้น — รอบแรกผมเขียนอ้าง `stockAgeMinutes`
           ซึ่ง **ไม่มีในคำตอบ** ⇒ บอตที่ทำตามจะหาไม่เจอแล้วเชื่อว่าเราไม่ได้บอกความสด
           (คลาสเดียวกับที่ไล่กันทั้งวัน: ชี้ไปคีย์ที่ปลายทางไม่ได้ส่ง)
           ⚠️ ส่ง **เวลาดิบ** (`stockUpdatedAt`) ให้ผู้อ่านคิดอายุเอง ไม่ส่งจำนวนนาที
              เพราะค่าที่คิดจากเวลาปัจจุบันจะเก่าทันทีที่คำตอบถูกแคช */
        "🔎 ก่อนบอกลูกค้าว่ามีของ ให้ดู `stockSource` (live · cached · baked) " +
        "กับ `stockUpdatedAt` ในไฟล์นี้ประกอบเสมอ · " +
        "ร้านนี้ไม่มีบริการส่งฟรี",
      stockUpdatedAt: at ? new Date(at).toISOString() : null,
      stockLive: !stale && !!map,
      /* 🔒 **ทางถอยต้องประกาศตัวว่าเป็นทางถอยชั้นไหน** (กฎ 9 ก.ย. 2569)
         `stockLive` เป็น boolean เดียว ⇒ ชั้น 2 (ของเก่าที่เคยกวาด) กับ
         ชั้น 3 (สต็อกที่แช่ตอน build) ให้ค่า false เหมือนกัน **แยกไม่ออก**
         ทั้งที่สองอย่างนี้ต่างกันมาก: ชั้น 2 คลาดไม่กี่ชั่วโมง · ชั้น 3 คลาดเป็นเดือน
         ⇒ ถ้าตัวกวาดตายถาวร ฟีดจะยืนอยู่บนชั้น 3 ตลอดกาลโดยไม่มีอะไรฟ้อง
            (ทางถอยที่ "ยังตอบได้" คือทางถอยที่ไม่มีใครมาตรวจ)
         ⚠️ `stockLive` คงไว้เพื่อไม่ให้ผู้อ่านเดิมพัง — ตัวใหม่นี้เพิ่มอย่างเดียว */
      stockSource: !map ? "baked" : stale ? "cached" : "live",
      count: products.length,
      products,
    },
    200,
    1800,
  );
}

export const config = { path: "/products.json" };

function json(body, status, edgeSeconds) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (edgeSeconds > 0) {
    headers["Cache-Control"] = "public, max-age=300";
    headers["Netlify-CDN-Cache-Control"] =
      `public, s-maxage=${edgeSeconds}, stale-while-revalidate=3600`;
  } else {
    headers["Cache-Control"] = "no-store";
  }
  return new Response(JSON.stringify(body), { status, headers });
}
