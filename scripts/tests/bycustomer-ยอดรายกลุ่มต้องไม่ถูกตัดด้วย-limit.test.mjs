// `?bycustomer=1` — ยอด/จำนวนรายของกลุ่ม (ลูกค้าใหม่ · ซื้อซ้ำ) ต้องเป็นของ **ทั้งช่วง**
//
// ที่มา: ฝั่งจอขอ 16 ต.ค. 2569 — ZORT /Dashboard/ContactReport คิดคอลัมน์ ยอดขาย (%)
//   โดยหารด้วย **ยอดของกลุ่มที่แท็บนั้นเปิดอยู่** ไม่ใช่ยอดรวมทั้งหมด
// 🔴 สิ่งที่เฝ้า: ตัวหารต้องไม่ผูกกับ `limit`
//    ของจริงวันนี้ 90 วันมี 1,135 ชื่อ ถูกตัดเหลือ 500 ⇒ ถ้าตัวหารมาจากรายชื่อที่ส่งกลับ
//    % จะผิดแบบ **ดูสมเหตุสมผล** (คลาส display-limits-cant-decide)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("netlify/functions/core.mjs", "utf8");
const i = src.indexOf("const เพดานชื่อสำหรับกลุ่ม");
const ก้อน = src.slice(i, i + 4200);

test("ตัวหารมาจากทุกชื่อในช่วง ไม่ใช่รายชื่อที่ถูกตัดด้วย limit", () => {
  assert.ok(i > 0, "ไม่เจอท่อนคิดยอดรายกลุ่ม");
  /* 🔑 `named` คือรายชื่อหลังตัด limit · `rows` คือทุกชื่อในช่วง
     ด่านนี้แดงทันทีถ้าใครเปลี่ยนตัวหารไปใช้ของที่ถูกตัด */
  assert.match(ก้อน, /const ชื่อทั้งช่วง = rows\.filter/);
  assert.ok(!/ชื่อทั้งช่วง = named/.test(ก้อน), "ตัวหารต้องไม่มาจาก named (ซึ่งถูกตัดด้วย limit)");
  // วนคิดกลุ่มจาก rows ไม่ใช่ named
  assert.match(ก้อน, /for \(const r of rows\) \{[\s\S]{0,400}?firstMap\.get/);
});

test("สี่กอง ไม่ใช่สอง — ของที่ยุบไม่ได้ต้องมีกองของตัวเอง", () => {
  // มีชื่อแต่หาวันซื้อแรกไม่เจอ = ไม่รู้ว่าใหม่หรือเก่า ⇒ ยุบเข้ากองไหนก็เป็นการยืนยันสิ่งที่ไม่รู้
  assert.match(ก้อน, /unknownFirstDay/);
  assert.match(ก้อน, /วันแรก === undefined \? g\.unknownFirstDay/);
  // ใบไม่ระบุชื่อ นับ "คน" ไม่ได้ ⇒ customers ต้องเป็น null ห้ามเป็น 0
  assert.match(ก้อน, /unnamed:[\s\S]{0,160}customers: null/);
  assert.ok(!/unnamed:[\s\S]{0,120}customers: 0/.test(ก้อน), "unnamed.customers ต้องเป็น null ไม่ใช่ 0");
});

test("เกินเพดานชื่อ ⇒ ไม่ส่งเลขบางส่วน แต่ประกาศเหตุ", () => {
  // เลขที่ถูกบางส่วนอันตรายกว่าไม่มีเลข เพราะจอจะเอาไปหาร % แล้วไม่มีใครรู้
  assert.match(ก้อน, /if \(!คิดกลุ่มได้\) return null;/);
  assert.match(src, /groupTotalsSkipped/);
  assert.match(src, /groupTotalsScope/);
});

test("ป้ายขอบเขตต้องบอกว่าไม่ผูกกับ limit และห้ามบวกสี่กอง", () => {
  const j = src.indexOf("groupTotalsScope");
  const ป้าย = src.slice(j, j + 900);
  assert.match(ป้าย, /ไม่ถูกตัดด้วย limit/);
  assert.match(ป้าย, /ห้ามบวกสี่กอง/);
  // นิยาม "ใหม่" ต้องเขียนไว้ ไม่ใช่ให้จอเดา
  assert.match(ป้าย, /ซื้อครั้งแรกอยู่ในช่วงนี้/);
});
