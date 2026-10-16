// `?bycustomer=1` → `monthly` — ยอดขายรายเดือนแยกกลุ่ม (ฝั่งจอขอ 16 ต.ค. 2569)
// เหตุ: ZORT /Dashboard/ContactReport มีตัวสลับ "จำนวนลูกค้า / ยอดขาย" จอเรามีได้แค่จำนวน
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("netlify/functions/core.mjs", "utf8");
const i = src.indexOf("monthly: await (async () => {");
const j = src.indexOf("monthlyScope:", i);
assert.ok(i > 0 && j > i, "หาบล็อก monthly ไม่เจอ");
const ก้อน = src.slice(i, j);

test("ยอดรายกลุ่มต้องอยู่ในคำสั่งเดิม ไม่ยิงเพิ่ม", () => {
  /* เลขสองชุดที่มาจากคนละคำสั่ง มีโอกาสไม่ตรงกันเองโดยไม่มีใครรู้ (กติกาเดิมของไฟล์นี้) */
  assert.equal((ก้อน.match(/coreQuery\(/g) || []).length, 1, "บล็อก monthly ต้องยิงคำสั่งเดียว");
  for (const f of ["newSales", "repeatSales", "unnamedSales", "totalSales"]) {
    assert.ok(ก้อน.includes(`AS ${f}`), `คำสั่งต้องคิด ${f}`);
  }
});

test("สี่กอง ไม่ใช่สาม — ยอดที่หา firstDay ไม่เจอต้องมีที่ยืน", () => {
  /* 🔴 ถ้าไม่มีกองนี้ แถวที่ f.firstDay เป็น NULL จะตกไม่เข้าทั้ง new และ repeat
     ⇒ สามกองบวกไม่เท่ายอดเดือน **โดยไม่มีอะไรฟ้อง** และจอจะหาร % ผิด */
  assert.match(ก้อน, /AS unknownSales/);
  assert.match(ก้อน, /AS unknownCustomers/);
  assert.match(ก้อน, /f\.firstDay IS NULL/);
});

test("ส่งยอดรวมเดือนมาด้วย ⇒ ตรวจผลบวกได้ในคำตอบเดียว", () => {
  /* ไม่ต้องไปหาเลขจากคำขออื่นมาเทียบ ซึ่งอาจคนละรอบซิงก์แล้วดูเหมือนไม่ตรง
     (compare-within-one-response) */
  assert.match(src.slice(i, i + 9000), /totalSales: num2\(r\.totalSales\)/);
  assert.match(src, /newSales \+ repeatSales \+ unnamedSales \+ unknownSales = totalSales/);
});

test("ป้ายต้องเตือนว่าหน่วยไม่เหมือนกัน — คน vs ใบ", () => {
  /* newCustomers/repeatCustomers = คน · unnamedOrders = ใบ ⇒ บวกข้ามหน่วยคือเลขที่ไม่มีความหมาย */
  const ป้าย = src.slice(src.indexOf("monthlyScope:"), src.indexOf("monthlyScope:") + 1200);
  assert.match(ป้าย, /ห้ามบวกข้ามหน่วย/);
  assert.match(ป้าย, /unknownSales\/unknownCustomers/);
  assert.match(ป้าย, /อย่าซ่อน/);
});
