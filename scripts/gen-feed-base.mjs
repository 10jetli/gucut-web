// สร้าง public/feed-base.json — ข้อมูลสินค้าส่วนที่ "ไม่ค่อยเปลี่ยน"
//
// ใช้คู่กับ netlify/functions/products-feed.mjs ที่ดึงสต็อกสดจาก ZORT มาประกบ
//   ไฟล์นี้      = ชื่อ ลิงก์ รูป ยี่ห้อ คะแนนรีวิว ตัวเลือก (เปลี่ยนตอน deploy)
//   ZORT         = สต็อกกับราคา ณ ตอนนี้ (เปลี่ยนตลอดเวลา)
//
// ⚠️ ไม่กรองด้วยสต็อกที่เก็บไว้ในไฟล์ เพราะสต็อกจริงมาจาก ZORT
//    ของที่ไฟล์บอกว่าหมดอาจเข้ามาใหม่แล้ว — ต้องปล่อยให้ ZORT เป็นคนตัดสิน
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const products = JSON.parse(fs.readFileSync(path.join(root, "src/data/products.json"), "utf8"));
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://gucut.com").replace(/\/$/, "");

// รูปในไฟล์สินค้าเก็บเป็น URL เต็มของ Shopify CDN (ของเดิมสมัยอยู่ Shopify)
// เราเก็บสำเนาไว้เองครบทุกใบแล้วที่ public/img/ — ต้องสลับมาใช้ของเราเสมอ
//
// ⚠️ บั๊กเดิม (เจอ 22 ส.ค. 2569): เขียน `${SITE}${p.img}` ตรง ๆ
//    p.img เป็น URL เต็มอยู่แล้ว จึงได้ "https://gucut.comhttps://cdn.shopify.com/..."
//    เสียไป 2,036 รายการ — และเป็นรูปที่ ChatGPT/Gemini เห็นในฟีดสินค้าของเรา
//    ตรวจไม่เจอมานาน เพราะไม่มีอะไรพังให้เห็น แค่ AI มองไม่เห็นรูปเงียบ ๆ
//
// ⚠️ และหลัง 26 ส.ค. 2569 ร้าน Shopify ปิด ลิงก์ cdn.shopify.com จะตายทั้งหมด
//    ต่อให้ต่อ URL ถูกก็ยังใช้ไม่ได้ ต้องชี้มาที่ /img/ ของเราเท่านั้น
const archived = new Set(
  JSON.parse(fs.readFileSync(path.join(root, "src/data/image-map.json"), "utf8")),
);

/** ชื่อไฟล์สำเนาในเครื่อง — กติกาเดียวกับ src/lib/local-images.ts ห้ามให้ต่างกัน */
function localName(url) {
  const base = String(url).split("?")[0].split("/").pop();
  return base ? base.replace(/\.(jpe?g|png|webp|avif|gif)$/i, "") + ".webp" : null;
}

/** คืน URL รูปแบบเต็มที่ใช้ได้จริง — ชอบสำเนาของเราก่อนเสมอ */
function imageUrl(raw) {
  const n = localName(raw);
  if (n && archived.has(n)) return `${SITE}/img/${n}`;
  // ไม่มีสำเนา: ถ้าเป็น URL เต็มอยู่แล้วห้ามเอา SITE ไปต่อหน้า
  return /^https?:\/\//i.test(raw) ? raw : `${SITE}${raw}`;
}

const brandOf = (t) =>
  /KINGKONG|KING KONG/i.test(t) ? "KINGKONG" : /NEWWAVE/i.test(t) ? "NEWWAVE" : "";

const list = products
  .filter((p) => p.img && p.sku)          // ต้องมีรูปและมีรหัสถึงจะจับคู่กับ ZORT ได้
  .map((p) => ({
    sku: p.sku,
    h: p.h,
    t: p.t,
    p: p.p,
    pmax: p.pmax > p.p ? p.pmax : undefined,
    img: imageUrl(p.img),
    b: brandOf(p.t) || undefined,
    rv: p.rv ? [p.rv.a, p.rv.n] : undefined,
    st: p.st,                              // ตัวสำรอง ใช้เมื่อ ZORT ล่ม
  }));

fs.writeFileSync(path.join(root, "public/feed-base.json"), JSON.stringify({ site: SITE, list }));
console.log(`gen-feed-base: เขียน public/feed-base.json แล้ว (${list.length} รายการที่มีรหัสสินค้า)`);
