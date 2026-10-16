// `?list=topproducts` — เงื่อนไขที่หย่อนลง **สตริงตัวกรองที่ใช้ร่วมกัน** ต้องใช้ได้กับ **ทุกคิวรี**
//
// 🔴 ของจริง 16 ต.ค. 2569 22:4x (ฝั่งจอแจ้ง): ผมเพิ่ม `category=` แล้วเขียนเงื่อนไขเป็น
//    `AND TRIM(COALESCE(p.category,'')) = ?` หย่อนลงสตริง `filter`
//    ⇒ แต่ `filter` ถูกกิน **4 คิวรี** และ **สองตัวไม่ได้ JOIN ตาราง products**
//      (by=month และตัวนับ totalSkus) ⇒ D1 ตอบ `no such column: p.category` ⇒ HTTP 500
//    🔑 ผมตัดสินใจจาก **คิวรีที่เผอิญเปิดดูอยู่** ไม่ใช่จากทุกตัวที่กินสตริงนั้น
//
// ⇒ ด่านนี้ไม่ได้เฝ้า "category" ตัวเดียว แต่เฝ้า **กฎ**: ทุกเงื่อนไขใน `filter`
//   ต้องอ้างได้เฉพาะตารางที่ **ทุกคิวรี** มีร่วมกัน (oi · o) หรือพาตารางของตัวเองมาด้วย (EXISTS)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("netlify/functions/core.mjs", "utf8");
const i = src.indexOf('url.searchParams.get("list") === "topproducts"');
const จบ = src.indexOf("สะพานส่งเอกสารขายเข้า PEAK", i);
const ก้อน = src.slice(i, จบ > i ? จบ : i + 12000);

/** ดึงทุกเงื่อนไขที่ถูกต่อเข้า `filter` */
const เงื่อนไขในfilter = [...ก้อน.matchAll(/filter \+?= "([^"]+)"/g)].map((m) => m[1]);

test("ต้องมีคิวรีที่ใช้ ${filter} มากกว่าหนึ่งตัว (ไม่งั้นด่านนี้ไม่มีความหมาย)", () => {
  const จำนวน = [...ก้อน.matchAll(/\$\{filter\}/g)].length;
  assert.ok(จำนวน >= 2, `เจอคิวรีที่ใช้ filter ${จำนวน} ตัว — ด่านนี้มีไว้เพราะมันถูกใช้ร่วมกัน`);
});

test("เงื่อนไขใน filter ห้ามอ้างตารางที่ไม่ใช่ทุกคิวรีมีร่วมกัน", () => {
  assert.ok(เงื่อนไขในfilter.length > 0, "ไม่เจอเงื่อนไขที่ต่อเข้า filter เลย");
  /* ตารางที่ทุกคิวรีมีร่วมกันแน่ ๆ: oi (order_items) · o (orders)
     ตารางอื่น (p = products) **ไม่มีในทุกคิวรี** ⇒ อ้างตรง ๆ ไม่ได้
     ยกเว้นพามาเองด้วย EXISTS/subquery ซึ่งใช้ชื่อย่อของตัวเอง */
  for (const เงื่อนไข of เงื่อนไขในfilter) {
    const พามาเอง = /EXISTS\s*\(\s*SELECT/i.test(เงื่อนไข) || /IN\s*\(\s*SELECT/i.test(เงื่อนไข);
    if (พามาเอง) continue;
    const อ้างp = /\bp\.[a-z_]+/i.test(เงื่อนไข);
    assert.equal(อ้างp, false,
      `เงื่อนไขนี้อ้าง p.* แต่ไม่ได้พาตารางมาเอง ⇒ คิวรีที่ไม่ JOIN products จะล้ม: ${เงื่อนไข}`);
  }
});

test("ตัวกรองหมวดต้องพาตาราง products มาเอง", () => {
  const หมวด = เงื่อนไขในfilter.find((x) => /category/i.test(x));
  assert.ok(หมวด, "ไม่เจอเงื่อนไขกรองหมวดใน filter");
  assert.match(หมวด, /EXISTS \(SELECT 1 FROM products/);
  /* 🚫 ห้ามกลับไปเขียนแบบที่ล้ม */
  assert.ok(!/TRIM\(COALESCE\(p\.category/.test(หมวด), "กลับไปอ้าง p.category ตรง ๆ อีกแล้ว");
});

test("ตัวนับหัวตาราง (totalSkus) ต้องกินตัวกรองเดียวกัน — ไม่งั้นเลขหัวโกหก", () => {
  /* 🔑 ทางที่ "ง่ายกว่า" คือเติมตัวกรองเฉพาะคิวรีที่ JOIN ไว้ แล้วปล่อยตัวนับไว้เฉย ๆ
     ⇒ แถวถูกกรอง แต่เลขหัวตารางนับทั้งคลัง = **โกหกแบบดูสมเหตุสมผล** ⇒ ด่านนี้กันทางนั้น */
  const ตัวนับ = ก้อน.slice(ก้อน.indexOf("COUNT(DISTINCT oi.sku)"));
  assert.match(ตัวนับ.slice(0, 400), /\$\{filter\}/,
    "คิวรีนับจำนวนรหัสต้องใช้ตัวกรองชุดเดียวกับคิวรีที่ดึงแถว");
});
