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
    img: `${SITE}${p.img}`,
    b: brandOf(p.t) || undefined,
    rv: p.rv ? [p.rv.a, p.rv.n] : undefined,
    st: p.st,                              // ตัวสำรอง ใช้เมื่อ ZORT ล่ม
  }));

fs.writeFileSync(path.join(root, "public/feed-base.json"), JSON.stringify({ site: SITE, list }));
console.log(`gen-feed-base: เขียน public/feed-base.json แล้ว (${list.length} รายการที่มีรหัสสินค้า)`);
