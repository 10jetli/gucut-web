#!/usr/bin/env node
/* อบสต็อกสดจาก ZORT ลง `src/data/stock-live.json` ให้การ์ดในหน้ารวมใช้ตอน build
 *
 * 🔴 ที่มา 2 ต.ค. 2569 — ท่านประธานถ่ายจอมาเอง:
 *    การ์ด `00313 หัวเทียน NEWWAVE` ขึ้น "สินค้าหมด" ทั้งที่ ZORT มี **641 ชิ้น**
 *    วัดครบแคตตาล็อก 2,505 ใบ: ขึ้นป้ายหมด 631 ใบ ⇒ 26 ใบโกหก (รวม 3,958 ชิ้น)
 *    · 373 ใบหมดจริง · 232 ใบไม่รู้ (227 ใบไม่มีช่อง sku เลย)
 *    เหตุ: การ์ดอ่าน `st` ที่ **แช่ไว้ตั้งแต่ 15 ส.ค. 2569** และไม่ยิงถาม `/api/stock` รายใบ
 *
 * 🔑 กติกาที่ไฟล์นี้ยึด (เหมือน `netlify/lib/zort-stock.mjs` ซึ่งเป็นตัวจริง — ห้ามเขียนใหม่)
 *    · ได้ไม่ครบ (`partial`) ⇒ **ห้ามประกาศว่า `live`** ⇒ ลงเป็น `cached`
 *    · ยิงไม่ได้/แมปว่าง ⇒ **เก็บไฟล์เดิมไว้** ไม่เขียนทับด้วยของว่าง
 *      (ของเก่าที่จริง ดีกว่าของใหม่ที่เป็นศูนย์ทั้งกอง — กติกาเดิมของ zort-stock)
 *    · และ **ห้ามทำให้ build ตก** เพราะ ZORT ล่ม — แต่ต้องตะโกนออก log
 *
 * ⚠️ ไฟล์นี้เขียน `src/data/stock-live.json` ⇒ ต้องอยู่ใน .gitignore หรือ commit ทุกรอบ
 *    เลือก **commit** เพราะเป็นข้อมูลที่หน้าเว็บต้องใช้ตอน build บน Netlify
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const dest = join(root, "src/data/stock-live.json");

const เดิม = (() => {
  try { return JSON.parse(readFileSync(dest, "utf8")); } catch { return null; }
})();
const จำนวนเดิม = Object.keys(เดิม?.map ?? {}).length;

let ผล = null;
try {
  const { liveStock } = await import("../netlify/lib/zort-stock.mjs");
  ผล = await liveStock();
} catch (e) {
  console.error(`⚠️ gen-stock-live: ยิงสต็อกสดไม่ได้ (${e?.message ?? e})`);
}

const แมปดิบ = ผล?.map ?? null;
const จำนวนใหม่ = แมปดิบ ? Object.keys(แมปดิบ).length : 0;

if (!แมปดิบ || จำนวนใหม่ === 0) {
  console.error(`⚠️ gen-stock-live: **ไม่เขียนทับ** — ของสดว่าง/อ่านไม่ได้`);
  console.error(`   ไฟล์เดิมมี ${จำนวนเดิม} รหัส · source=${เดิม?.source ?? "(ไม่มี)"} · generatedAt=${เดิม?.generatedAt ?? "(ไม่มี)"}`);
  console.error(`   ⇒ การ์ดจะใช้ของเดิม · รหัสที่ไม่อยู่ในนั้นจะเป็น "ไม่รู้" (ไม่ขึ้นป้ายหมด)`);
  process.exit(0);
}

/* `map[sku] = [qty, price]` — เอาแต่จำนวน ราคาไม่ใช่เรื่องของไฟล์นี้
   (กติกาเดิม: ราคาให้ฝั่งสินค้าเป็นเจ้าของ ห้ามให้สต็อกมาทับราคา) */
const map = {};
let ทิ้งเพราะค่าเสีย = 0;
for (const [sku, v] of Object.entries(แมปดิบ)) {
  const n = Array.isArray(v) ? Number(v[0]) : Number(v);
  if (!Number.isFinite(n)) { ทิ้งเพราะค่าเสีย++; continue; }   // ค่าเสีย ⇒ **ไม่รู้** ห้ามใส่ 0
  map[String(sku).trim()] = n;
}

const source = ผล.partial || ผล.stale ? "cached" : "live";
const out = {
  _อ่านก่อนแก้: เดิม?._อ่านก่อนแก้ ?? [
    "สต็อกสดจาก ZORT ที่อบไว้ตอน build ให้การ์ดในหน้ารวมใช้",
    "เขียนโดย scripts/gen-stock-live.mjs ตอน prebuild — ห้ามแก้ด้วยมือ",
    "source: live = ยิง ZORT สำเร็จครบรอบนี้ · cached = ของเก่า/ได้ไม่ครบ · baked = ยังไม่เคยมีของสด",
    "รหัสที่ไม่อยู่ใน map = 'ไม่รู้' ⇒ ห้ามขึ้นป้ายสินค้าหมด",
    "ไม่รู้ ห้ามกลายเป็น 0 — ศูนย์เป็นคำยืนยันว่าของหมด",
  ],
  generatedAt: new Date(ผล.at ?? Date.now()).toISOString(),
  source,
  partial: Boolean(ผล.partial),
  map,
};
writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");

const หมด = Object.values(map).filter((n) => n <= 0).length;
console.log(`gen-stock-live: ${Object.keys(map).length} รหัส · source=${source}`
  + `${ผล.partial ? " (ได้ไม่ครบ ⇒ ไม่ประกาศว่า live)" : ""}`
  + ` · ในนั้น ≤ 0 อยู่ ${หมด} รหัส · เดิมมี ${จำนวนเดิม} รหัส`
  + (ทิ้งเพราะค่าเสีย ? ` · ทิ้งค่าเสีย ${ทิ้งเพราะค่าเสีย}` : ""));
