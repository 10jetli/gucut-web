// สร้างดัชนีค้นหา → public/search-index.json
// โหลดครั้งเดียวตอนลูกค้าเปิดหน้า /search แล้วค้นในเครื่อง — เร็วระดับพิมพ์ปุ๊บเจอปั๊บ
// บีบขนาด: รูปเก็บเฉพาะท้าย URL (prefix ซ้ำกัน 2,261 ตัว) + ใช้ key สั้น
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const products = JSON.parse(readFileSync(join(root, "src/data/products.json"), "utf8"));
const reviews = JSON.parse(readFileSync(join(root, "src/data/reviews.json"), "utf8"));

const BASE = "https://cdn.shopify.com/s/files/1/0905/1081/9620/files/";
const archived = new Set(
  JSON.parse(readFileSync(join(root, "src/data/image-map.json"), "utf8"))
);
// ใช้รูปที่เก็บเองถ้ามี — ตรงกับที่ catalog.ts ทำ
function pick(url) {
  if (!url) return null;
  const base = url.split("?")[0].split("/").pop();
  const local = base && base.replace(/\.(jpe?g|png|webp|avif|gif)$/i, "") + ".webp";
  if (local && archived.has(local)) return "/img/" + local;
  return url;
}

const items = products.map((p) => {
  const e = {
    h: p.h,                 // handle → ลิงก์
    t: p.t,                 // ชื่อ
    k: p.sku || "",         // SKU หลัก
    p: p.p,                 // ราคาต่ำสุด
    m: p.pmax,              // ราคาสูงสุด
    s: p.st,                // สต็อกรวม
    n: p.v.length,          // จำนวนตัวเลือก
  };
  if (p.c && p.c > p.p) e.c = p.c;                       // ราคาก่อนลด (ถ้ามี)
  const src = pick(p.img);
  if (src) e.i = src.startsWith(BASE) ? src.slice(BASE.length) : src;
  const rv = reviews[p.h];
  if (rv) e.r = [rv.avg, rv.count];                      // [ดาว, จำนวนรีวิว]
  // รวม SKU ของตัวเลือกไว้ค้นด้วย (เช่น 00894-22T) — เก็บเป็นสตริงเดียวประหยัดที่
  const vk = p.v.map((v) => v.k).filter(Boolean).join(" ");
  if (vk && vk !== e.k) e.vk = vk;
  return e;
});

const out = { v: 1, base: BASE, items };
const json = JSON.stringify(out);
writeFileSync(join(root, "public/search-index.json"), json);
console.log(
  `[search] ดัชนี ${items.length} สินค้า · ${(json.length / 1024).toFixed(0)} KB (ก่อนบีบอัด)`
);
