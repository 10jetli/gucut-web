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
    const st = live ? live[0] : p.st;          // ไม่มีข้อมูลสด → ใช้ค่าที่แช่ไว้
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
      note: "สต็อกและราคาดึงจากระบบคลังของร้านโดยตรง อัปเดตอัตโนมัติทุก 30 นาที · ร้านนี้ไม่มีบริการส่งฟรี",
      stockUpdatedAt: at ? new Date(at).toISOString() : null,
      stockLive: !stale && !!map,
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
