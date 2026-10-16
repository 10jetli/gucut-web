// `list=topproducts&sort=amount` — เรียงที่ ORDER BY เท่านั้น ห้ามให้จอเรียงเอง
//
// ที่มา: ฝั่งจอขอ 16 ต.ค. 2569 — ตาราง "สินค้าขายดีย้อนหลัง" ใน /Warehouse/Details ของ ZORT
//   เรียงตามยอดขาย (13,135 > 13,000 > 6,601) ส่วนเส้นนี้เรียงตามจำนวนมาตลอด
// 🔑 เขา **ไม่เรียงเองในหน้าเดียว** ซึ่งถูกแล้ว — เรียงกองที่ถูก limit ตัดมาแล้ว
//    = อันดับข้ามหน้าผิด (display-limits-cant-decide) ⇒ การเรียงต้องเกิดที่ ORDER BY
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("netlify/functions/core.mjs", "utf8");
/* ตัดที่ขอบของเส้นถัดไป ห้ามใช้ความยาวคงที่ — เหยียบมาแล้ววันนี้ (test-must-hit-the-path) */
const i = src.indexOf('if (url.searchParams.get("list") === "topproducts") {');
const j = src.indexOf('url.searchParams.get("peak")', i);
assert.ok(i > 0 && j > i, "หาขอบของเส้น topproducts ไม่เจอ — เทสนี้วัดอะไรไม่ได้");
const ก้อน = src.slice(i, j);

test("ค่าที่ไม่รู้จักต้อง 400 ห้ามตกไปใช้ค่าปริยายเงียบ ๆ", () => {
  // เมินเงียบ = จอส่งค่าไปแล้วเชื่อว่าเรียงแล้ว ทั้งที่ไม่ได้เรียง = ปุ่มหลอก
  assert.match(ก้อน, /sort รับแค่ amount หรือ qty/);
  assert.match(ก้อน, /if \(sortRaw && sortRaw !== "amount" && sortRaw !== "qty"\)/);
});

test("by=month ส่ง sort มาด้วยต้อง 400 — ไม่ใช่รับแล้วเมิน", () => {
  // เดือนเป็นแกนเวลาของกราฟ · รับแล้วเมิน = คนส่งไม่มีทางรู้ว่ามันไม่มีผล
  assert.match(ก้อน, /if \(sortRaw && byMonth\)/);
  assert.match(ก้อน, /by=month เรียงตามเดือนเสมอ/);
});

test("ค่าปริยายต้องไม่เปลี่ยนของเดิม — รายสินค้า qty · รายหมวด amount", () => {
  /* 🔴 ข้อนี้คือข้อที่กันผมเองไม่ให้เปลี่ยนพฤติกรรมจอที่ใช้อยู่แล้วโดยไม่มีใครขอ */
  assert.match(ก้อน, /const เรียงรายสินค้า = `\$\{sortRaw === "amount" \? "amount" : "qty"\} DESC/);
  assert.match(ก้อน, /const เรียงรายหมวด = `\$\{sortRaw === "qty" \? "qty" : "amount"\} DESC/);
});

test("ORDER BY ต้องมีตัวตัดสินเสมอกัน ไม่งั้นไล่หน้าแล้วแถวซ้ำ/หาย", () => {
  /* SQLite ไม่รับประกันลำดับของแถวที่คีย์เรียงเท่ากัน ⇒ LIMIT/OFFSET คนละหน้าได้แถวซ้ำ
     **โดยยอดรวมยังดูสมเหตุสมผล** · เส้นนี้เคยโดนคลาสนี้มาแล้ว 19 ก.ย. (คนละต้นเหตุ อาการเดียวกัน) */
  assert.match(ก้อน, /DESC, oi\.sku`/, "รายสินค้าต้องตัดสินเสมอกันด้วย sku");
  assert.match(ก้อน, /DESC, category`/, "รายหมวดต้องตัดสินเสมอกันด้วยชื่อหมวด");
  // ORDER BY ที่ยังเขียนตายตัวแบบเดิม = ยังไม่ได้ต่อสาย
  assert.ok(!/ORDER BY qty DESC LIMIT/.test(ก้อน), "ยังมี ORDER BY qty DESC แบบเขียนตายอยู่");
  assert.ok(!/ORDER BY amount DESC LIMIT/.test(ก้อน), "ยังมี ORDER BY amount DESC แบบเขียนตายอยู่");
});

test("ลำดับที่ใช้จริงต้องติดไปกับคำตอบ ไม่ใช่แค่สะท้อนค่าที่ส่งมา", () => {
  /* ไม่ส่ง sort ก็ยังต้องรู้ว่าเรียงด้วยอะไร — จอต้องเขียนหัวตารางว่า "เรียงตาม…"
     เขียนผิดเมื่อไหร่ คนอ่านตัดสินใจผิดตาม */
  assert.match(ก้อน, /sortApplied:/);
  assert.match(ก้อน, /sort: sortRaw \|\| null/);
  assert.match(ก้อน, /sortNote:/);
});

test("ค่าที่ลง SQL ต้องมาจากชุดปิด ไม่ใช่สตริงจากผู้ใช้", () => {
  // กัน SQL injection แบบโครงสร้าง: sortRaw ถูกเทียบกับค่าคงที่ แล้วใช้คำที่เราเขียนเอง
  assert.ok(!/ORDER BY \$\{sortRaw\}/.test(ก้อน), "ห้ามเอาค่าจากผู้ใช้ลง ORDER BY ตรง ๆ");
  assert.ok(!/\$\{url\.searchParams\.get\("sort"\)\}/.test(ก้อน));
});
