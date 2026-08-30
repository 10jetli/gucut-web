// ฟีดสินค้าสำหรับยิงโฆษณา — /catalog.xml (รูปแบบ Google Merchant RSS 2.0)
//
// ใช้กับสองเจ้าด้วยไฟล์เดียว:
//   Google Merchant Center → Shopping/Performance Max (ลูกค้าค้นชื่อรุ่นแล้วเจอ)
//   Meta Commerce Manager  → Advantage+ Catalog (Meta รองรับฟีดรูปแบบ Google ตรง ๆ)
//
// ข้อมูลชุดเดียวกับ /products.json: โครงจาก feed-base.json (สร้างตอน build)
// + สต็อก/ราคาสดจาก ZORT (แคช 30 นาที) — ของหมดไม่ใส่ในฟีด กันยิงโฆษณาของที่ขายไม่ได้
//
// ⚠️ ไม่มี GTIN (สินค้าโรงงานเราเอง) จึงส่ง brand + mpn(=SKU) ตามเกณฑ์ Google
//    "ต้องมี 2 ใน 3 ของ gtin/mpn/brand" — ห้ามใส่ gtin มั่วเด็ดขาด โดนแบนฟีดได้
import { liveStock } from "../lib/zort-stock.mjs";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export default async function handler(req) {
  const origin = new URL(req.url).origin;

  let base;
  try {
    const r = await fetch(`${origin}/feed-base.json`, { signal: AbortSignal.timeout(8000) });
    base = await r.json();
  } catch {
    return new Response("โหลดข้อมูลสินค้าไม่ได้", { status: 503 });
  }
  const list = Array.isArray(base?.list) ? base.list : [];

  const { map } = await liveStock();

  const items = [];
  for (const p of list) {
    if (!p?.sku || !p?.t || !p?.img || !p?.h) continue;
    const live = map?.[p.sku];
    const st = live ? live[0] : p.st;
    const price = live && live[1] > 0 ? live[1] : p.p;
    if (!(st > 0) || !(price > 0)) continue; // ของหมด/ไม่มีราคา ไม่เอาเข้าฟีดโฆษณา

    const url = `${origin}/products/${encodeURIComponent(p.h)}/`;
    const brand = p.b || "GUCUT";
    items.push(
      `<item>` +
        `<g:id>${esc(p.sku)}</g:id>` +
        `<title>${esc(String(p.t).slice(0, 150))}</title>` +
        `<description>${esc(`${p.t} ของแท้จากตัวแทนจำหน่าย ${brand} · มีสต็อกพร้อมส่งทั่วไทย`)}</description>` +
        `<link>${esc(url)}</link>` +
        `<g:image_link>${esc(p.img)}</g:image_link>` +
        `<g:availability>in_stock</g:availability>` +
        `<g:price>${Number(price).toFixed(2)} THB</g:price>` +
        `<g:brand>${esc(brand)}</g:brand>` +
        `<g:mpn>${esc(p.sku)}</g:mpn>` +
        `<g:condition>new</g:condition>` +
        `</item>`
    );
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">` +
    `<channel>` +
    `<title>GUCUT</title>` +
    `<link>${esc(origin)}</link>` +
    `<description>เลื่อยยนต์ NEWWAVE / KingKong ของแท้ โซ่ บาร์ และอะไหล่แยกชิ้น</description>` +
    items.join("") +
    `</channel></rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // แคชที่ edge ครึ่งชั่วโมง เท่ากับรอบสต็อกสด — บอตฟีดของ Google/Meta มาดึงบ่อยแค่ไหนก็ไม่หนัก
      "cache-control": "public, max-age=0, must-revalidate",
      "netlify-cdn-cache-control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}

export const config = { path: "/catalog.xml" };
