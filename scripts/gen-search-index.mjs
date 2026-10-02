// สร้างดัชนีค้นหา → public/search-index.json
// โหลดครั้งเดียวตอนลูกค้าเปิดหน้า /search แล้วค้นในเครื่อง — เร็วระดับพิมพ์ปุ๊บเจอปั๊บ
// บีบขนาด: รูปเก็บเฉพาะท้าย URL (prefix ซ้ำกัน 2,261 ตัว) + ใช้ key สั้น
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
/* 🔑 ใช้กติกาตัวเดียวกับหน้าเว็บ — core เป็น .js เพื่อให้สคริปต์ Node โหลดได้
   (ถ้า import .ts ตรง ๆ Netlify Node 20 จะล้มทั้ง build — เกิดจริง 2 ต.ค. deploy 9a22940) */
import { สถานะจากค่า, รวมสถานะ } from "../src/lib/stock-state-core.mjs";

const root = process.cwd();
let partInfo = {};
try { partInfo = JSON.parse(readFileSync(join(root, "src/data/part-info.json"), "utf8")); } catch {}
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


/* 🔴 ของสดจาก ZORT ที่อบไว้ (2 ต.ค. 2569) — ดัชนีค้นหาเคยใช้ `p.st` ที่แช่ไว้ตั้งแต่ 15 ส.ค.
   ⇒ ผลค้นหาขึ้น "สินค้าหมด" ทั้งที่มีของ เหมือนการ์ดในหน้ารวม (ท่านประธานถ่ายจอมาเอง)
   🔑 กติกาเดียวกับ `src/lib/live-stock-baked.ts` — **ไม่รู้ ห้ามกลายเป็น 0**
      (มีเทส `scripts/tests/สองฝั่งอ่านสต็อกสดเหมือนกัน.test.mjs` ผูกสองฝั่งไว้) */
const ของสด = (() => {
  try { return JSON.parse(readFileSync(join(root, "src/data/stock-live.json"), "utf8")).map ?? {}; }
  catch { return {}; }
})();
const สต็อกสดของ = (sku) => {
  if (!sku) return null;
  const n = ของสด[String(sku).trim()];
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const items = products.map((p) => {
  const e = {
    h: p.h,                 // handle → ลิงก์
    t: p.t,                 // ชื่อ
    k: p.sku || "",         // SKU หลัก
    p: p.p,                 // ราคาต่ำสุด
    m: p.pmax,              // ราคาสูงสุด
    s: p.st,                // ตั้งค่าเริ่มเป็นค่าแช่ แล้วทับด้านล่างด้วยผลของกติกาเดียวกับหน้าเว็บ
    n: p.v.length,          // จำนวนตัวเลือก
  };
  /* 🔴 แก้ 2 ต.ค. 2569 18:22 — เดิมตัดสินจาก **รหัสระดับสินค้าอันเดียว**
        ⇒ `ตะไบ NEWWAVE` ที่ ZORT รู้จักแค่ `03409-3` (= -8) ถูกประกาศว่าหมดทั้งใบ
          ทั้งที่อีก 5 ตัวเลือกไม่รู้ค่า (และค่าแช่บอกว่ามีของ 876 ชิ้น)
     🔑 ต้องรวมสัญญาณของ **ทุกตัวเลือก** ด้วย `รวมสถานะ()` — ตัวเลือกที่ไม่รู้กันการบอกว่าหมด */
  const สัญญาณ = [];
  const สดระดับสินค้า = สต็อกสดของ(p.sku);
  if (สดระดับสินค้า !== null) สัญญาณ.push(สถานะจากค่า(สดระดับสินค้า));
  for (const v of (p.v ?? [])) สัญญาณ.push(สถานะจากค่า(สต็อกสดของ(v.k)));
  const รวม = รวมสถานะ(สัญญาณ);
  if (รวม === "มีของ") {
    const ที่รู้ = [
      ...(สดระดับสินค้า !== null ? [สดระดับสินค้า] : []),
      ...(p.v ?? []).map((v) => สต็อกสดของ(v.k)).filter((n) => n !== null),
    ];
    e.s = Math.max(0, ...ที่รู้);
  } else if (รวม === "หมดจริง") {
    e.s = 0;
  } else {
    /* ธง "ไม่รู้สต็อก" — ใส่เฉพาะตอนไม่รู้ เพื่อให้ไฟล์ดัชนีไม่โตขึ้นทั้งก้อน
       ⇒ ตัวเลขที่ติดมาเป็นค่าแช่ ห้ามอ่านเป็นคำตัดสิน (จอฝั่งค้นหาเช็ค sk ก่อน) */
    e.sk = false;
  }
  if (p.c && p.c > p.p) e.c = p.c;                       // ราคาก่อนลด (ถ้ามี)
  const src = pick(p.img);
  if (src) e.i = src.startsWith(BASE) ? src.slice(BASE.length) : src;
  const rv = reviews[p.h];
  if (rv) e.r = [rv.avg, rv.count];                      // [ดาว, จำนวนรีวิว]
  // รวม SKU ของตัวเลือกไว้ค้นด้วย (เช่น 00894-22T) — เก็บเป็นสตริงเดียวประหยัดที่
  const vk = p.v.map((v) => v.k).filter(Boolean).join(" ");
  if (vk && vk !== e.k) e.vk = vk;
  // ชื่อรุ่นแบบปกติ ให้ค้น "MS070" เจอสินค้าที่ชื่อเขียนแค่ "070" ได้
  const fits = partInfo[p.h]?.fits;
  if (fits?.length) e.f = fits.join(" ");
  return e;
});

// ใส่ base เฉพาะตอนที่ยังมีสินค้าที่รูปยังไม่ได้เก็บมาไว้เอง
// (ตอนนี้เก็บครบแล้ว ดัชนีเลยไม่มี URL ของ Shopify เหลืออยู่เลย)
const needsBase = items.some((e) => e.i && !e.i.startsWith("/"));
const out = needsBase ? { v: 1, base: BASE, items } : { v: 1, items };
const json = JSON.stringify(out);
writeFileSync(join(root, "public/search-index.json"), json);
console.log(
  `[search] ดัชนี ${items.length} สินค้า · ${(json.length / 1024).toFixed(0)} KB (ก่อนบีบอัด)`
);
