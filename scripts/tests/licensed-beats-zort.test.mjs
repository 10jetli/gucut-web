/* ด่าน: ทุกท่อที่บอก "ของมีเท่าไหร่" ต้องให้ **ทะเบียนชนะ ZORT** — ห้ามมีท่อไหนหลุด
 *
 * 🔴 คำสั่งท่านประธาน 25 ก.ย. 2569: **"ไม่เชื่อ zort ให้อิงตาม google ชีท"**
 *    ที่มา: พบซีเรียลที่ ZORT ว่ายังมีของ แต่ทะเบียนบอกขายไปแล้ว —
 *      F660 `45-7-67-00017` · F250 `45-7-67-00002` · F361 `45-7-67-00005`
 *    และเลื่อย 8800 SUPER-S 10 เครื่องไม่มีรหัสรายซีเรียลใน ZORT เลย
 *    ⇒ ของมีทะเบียนขายเกิน = **ปัญหาทางกฎหมาย** ไม่ใช่แค่สต็อกผิด
 *
 * 🔑 ทำไมต้องเป็นด่านอัตโนมัติ ไม่ใช่แค่คอมเมนต์:
 *    ผมแก้ `products-feed.mjs` (ฟีด AI) ไปแล้วรอบหนึ่ง **แต่ลืม `catalog-feed.mjs`
 *    (ฟีดโฆษณา Google Merchant) ซึ่งเป็นท่อที่จ่ายเงินจริง** — โค้ดสองไฟล์นี้
 *    เขียนเหมือนกันทุกบรรทัด ต่างกันแค่ชื่อไฟล์ ⇒ คลาสนี้จะเกิดซ้ำแน่นอน
 *    ([[partial-coverage-reported-as-full]] · [[fix-whole-bug-class]])
 *    ด่านนี้บังคับว่า **ไฟล์ไหนก็ตามที่ดึงสต็อกจาก ZORT ต้องเรียก licensedStock ด้วย**
 *
 * ⚠️ ด่านนี้ตรวจ "มีการเรียกไหม" ไม่ได้ตรวจ "เรียกถูกที่ไหม" — เป็นตะแกรงหยาบ
 *    ของจริงต้องยิง /api/... หลัง deploy เสมอ
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ราก = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** ไฟล์ที่ "ตอบคำถามว่าของมีเท่าไหร่ให้คนนอกเห็น" — ต้องให้ทะเบียนชนะ */
const ท่อที่ต้องครอบ = [
  "netlify/functions/stock.mjs",          // หน้าสินค้า + ตัวเลือกขนาด
  "netlify/functions/products-feed.mjs",  // ฟีดที่ ChatGPT/Gemini อ่าน
  "netlify/functions/catalog-feed.mjs",   // ฟีดโฆษณา Google Merchant (จ่ายเงินจริง)
];

test("ทุกท่อที่บอกจำนวนของ ต้องเรียก licensedStock", () => {
  for (const rel of ท่อที่ต้องครอบ) {
    const s = readFileSync(join(ราก, rel), "utf8");
    assert.ok(s.includes("licensedStock"), `${rel} ไม่ได้เรียก licensedStock ⇒ ZORT จะชนะทะเบียนที่ท่อนี้`);
    assert.ok(/from\s+["'][^"']*licensed-stock\.mjs["']/.test(s), `${rel} ไม่ได้ import licensed-stock.mjs`);
  }
});

test("🔍 ไม่มีท่อใหม่ที่ดึงสต็อก ZORT แล้วลืมครอบ", () => {
  /* กวาดทั้ง netlify/functions หาไฟล์ที่ใช้ `liveStock` (ตัวอ่านสต็อก ZORT)
     แล้วเช็คว่าเรียก licensedStock ด้วย — ไฟล์ใหม่ที่ลืมจะถูกจับตรงนี้
     ⚠️ ยกเว้นไฟล์ที่ใช้ ZORT เพื่อเรื่องอื่น (ราคา · สุขภาพระบบ) ไม่ใช่บอกจำนวนให้ลูกค้า */
  const ยกเว้น = new Set([
    "orders.mjs",      // ใช้ ZORT เฉพาะ "ราคา" ไม่ได้ใช้ตัดสินว่ามีของไหม (ตรวจแล้ว 25 ก.ย. 2569)
    "status.mjs",      // หน้าสถานะระบบ — หน้าที่คือรายงานว่า ZORT ตอบไหม
    "feed-health.mjs", // ตัวตรวจสุขภาพฟีด
  ]);
  const ดิร = join(ราก, "netlify", "functions");
  const หลุด = [];
  for (const f of readdirSync(ดิร)) {
    if (!f.endsWith(".mjs") || ยกเว้น.has(f)) continue;
    const s = readFileSync(join(ดิร, f), "utf8");
    if (!s.includes("liveStock")) continue;
    if (!s.includes("licensedStock")) หลุด.push(f);
  }
  assert.deepEqual(หลุด, [],
    `ไฟล์เหล่านี้ดึงสต็อก ZORT แต่ไม่ได้ครอบด้วยทะเบียน: ${หลุด.join(", ")}\n` +
    `ถ้าตั้งใจให้ใช้ ZORT ล้วน ให้เพิ่มชื่อไฟล์ในรายการ 'ยกเว้น' พร้อมเหตุผล`);
});

test("✅ ทิศลบ: ด่านนี้ต้องจับได้จริง", () => {
  // พิสูจน์ว่าเงื่อนไขที่ใช้แยกแยะได้ — ไฟล์ที่ไม่มีคำนี้ต้องถูกมองว่าหลุด
  const ปลอม = "import { liveStock } from '../lib/zort-stock.mjs';\nconst st = live[0];";
  assert.equal(ปลอม.includes("licensedStock"), false, "ถ้าข้อนี้ตก แปลว่าเงื่อนไขที่ใช้ตรวจกว้างเกินจนจับอะไรไม่ได้");
});
