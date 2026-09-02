// สร้างแผนที่ SKU → รูปสินค้า ให้จอสินค้าฝั่งหลังร้าน (admin.gucut.com/core/stock)
//
// ทำไมต้องมี: คลังเงา D1 รู้จักสินค้าเป็น "SKU" แต่รูปสินค้า 5,595 ใบบน R2
// ผูกกับ "handle" ของหน้าเว็บ — จอสินค้าที่อยากได้แบบ ZORT 100% (สั่ง 2 ก.ย. 2569)
// ต้องมีรูปย่อ จึงต้องมีตัวกลางแปลง SKU → ชื่อไฟล์รูป
//
// อ่านจาก public/search-index.json (สร้างโดย gen-search-index.mjs — **ต้องรันหลังตัวนั้นเสมอ**)
// ซึ่งมีทั้ง SKU หลัก (k) และ SKU ของทุกตัวเลือก (vk) พร้อมรูปของสินค้านั้น (i)
//
// ผลลัพธ์: public/sku-images.json  { "<SKU>": "<ชื่อไฟล์.webp>", ... }
// จอฝั่ง gucut-next เอาไปประกอบเป็น https://video.gucut.com/i/128/<ชื่อไฟล์>
// (ขั้น 128 คือรูปย่อเล็กสุดที่ img-to-r2.mjs สร้างไว้แล้วทุกใบ — พอดีกับตาราง)
//
// ⚠️ เก็บเฉพาะชื่อไฟล์ ไม่เก็บ URL เต็ม — ที่อยู่โฮสต์รูปเปลี่ยนได้ (IMG_HOST)
//    แผนที่จะได้ไม่ต้องสร้างใหม่ตามทุกครั้ง
import { readFileSync, writeFileSync } from "node:fs";

const idx = JSON.parse(readFileSync("public/search-index.json", "utf8"));
const items = idx.items ?? [];
if (!items.length) throw new Error("search-index.json ว่าง — ลำดับ prebuild ผิดหรือไฟล์พัง");

const map = {};
let products = 0;
for (const it of items) {
  const img = String(it.i ?? "");
  if (!img.startsWith("/img/")) continue;
  const file = img.slice("/img/".length);
  if (!file) continue;
  const skus = [it.k, ...String(it.vk ?? "").split(/\s+/)].map((s) => String(s ?? "").trim()).filter(Boolean);
  if (!skus.length) continue;
  products++;
  // SKU ซ้ำข้ามสินค้า (มีจริง เช่นอะไหล่ร่วมรุ่น) — ตัวแรกชนะ ไม่เขียนทับ
  // จะได้ผลนิ่งเท่าลำดับใน search-index ไม่สลับไปมาระหว่าง build
  for (const s of skus) if (!(s in map)) map[s] = file;
}

// รหัสเว็บกับรหัส ZORT ไม่ตรงกันเป๊ะ: เว็บติดท้ายตัวเลือก (03793-21T · 00657-11.5-KK)
// แต่คลังบางแถวใช้รหัสฐาน (03793 · 00657) — เติม "รหัสฐานทุกชั้น" เป็นชื่อเรียกสำรอง
// จอจะได้ค้นแบบตรงตัวอย่างเดียว ไม่ต้องมีกติกาถอดรหัสของตัวเอง (วัดแล้วครอบ 90%
// ของ 200 ตัวขายดี — ที่เหลือคือของที่ไม่เคยมีบนเว็บจริง ๆ เช่นค่าบริการ)
for (const [sku, file] of Object.entries({ ...map })) {
  const parts = sku.split("-");
  for (let i = parts.length - 1; i > 0; i--) {
    const base = parts.slice(0, i).join("-");
    if (base && !(base in map)) map[base] = file;
  }
}

writeFileSync("public/sku-images.json", JSON.stringify(map));
console.log(`gen-sku-images: ${Object.keys(map).length} SKU จากสินค้า ${products} ตัว ✓`);
