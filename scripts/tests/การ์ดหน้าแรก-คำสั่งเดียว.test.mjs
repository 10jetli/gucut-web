// `?cards=1` — การ์ดหน้าแรกแบบ ZORT ด้วยคำสั่ง D1 **คำสั่งเดียว**
//
// ที่มา: ฝั่งจอวัด 16 ต.ค. 2569 — การ์ดของ ZORT นับทุกช่วงเวลา ⇒ จอต้องยิง `list=orders`
//   แบบไม่ใส่ช่วงวัน = 17 คำสั่ง D1 สองคำขอ ~7 วิ **ทุกครั้งที่เปิดหน้าแรก**
// 🔴 สิ่งที่เฝ้า: ① คำสั่งเดียวจริง ② ส่ง grid ดิบไปด้วย ③ ไม่มีคู่สถานะที่ตรง ⇒ null ไม่ใช่ 0
//    ④ การ์ดที่ยังไม่ตรงกับ ZORT ต้องประกาศตัวว่ายังไม่ตรง
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("netlify/functions/core.mjs", "utf8");
const i = src.indexOf('if (url.searchParams.get("cards")) {');
/* 🔴 **ตัดที่ขอบของเส้นถัดไป ห้ามตัดด้วยความยาวคงที่** — เหยียบมาแล้ววันนี้เอง
   รุ่นแรกของเทสนี้ใช้ slice(i, i+5200) ⇒ กินเลยเข้าไปในเส้น `?pending=1`
   ซึ่งยิง coreQuery หลายรอบ ⇒ ข้อ "คำสั่งเดียว" **แดงลวง** ทั้งที่เส้นนี้ยิงรอบเดียวจริง
   ⇒ หน้าต่างคงที่ = วัดของเส้นข้างบ้าน (คลาส test-must-hit-the-path) */
const จบเส้น = src.indexOf('if (url.searchParams.get("pending")) {', i);
assert.ok(จบเส้น > i, "หาขอบท้ายของเส้น ?cards=1 ไม่เจอ — เทสนี้วัดอะไรไม่ได้ถ้าขอบเลื่อน");
const ก้อน = src.slice(i, จบเส้น);

test("ยิง D1 คำสั่งเดียว — เหตุผลทั้งหมดที่เส้นนี้มีอยู่", () => {
  assert.ok(i > 0, "ไม่เจอเส้น ?cards=1");
  const จำนวนcoreQuery = (ก้อน.match(/await coreQuery\(/g) || []).length;
  assert.equal(จำนวนcoreQuery, 1, `เส้นนี้ต้องยิง coreQuery ครั้งเดียว (เจอ ${จำนวนcoreQuery}) — เพิ่มคำสั่งคือทำลายเหตุผลที่เส้นนี้มีอยู่`);
  assert.match(ก้อน, /คำสั่งD1: 1/);
});

test("ส่งตารางดิบไปด้วย ไม่ใช่ส่งแต่เลขการ์ด", () => {
  /* นิยามการ์ดของ ZORT ยังไม่นิ่ง (การ์ด ZORT เองยังไม่ตรงกับรายการของ ZORT เอง 132 vs 95)
     ⇒ ถ้าท่อส่งแต่เลขสรุป วันที่นิยามเปลี่ยนจอต้องรอ deploy ท่อ */
  assert.match(ก้อน, /\n\s*grid,/);
  assert.match(ก้อน, /gridNote:/);
  assert.match(ก้อน, /รวมใบยกเลิกด้วย/);
  // ห้ามตัดใบยกเลิกทิ้งในคำสั่ง — ซ่อนคือตัดสินใจแทนคนอ่าน
  assert.ok(!/NOT LIKE '%cancel%'/.test(ก้อน), "คำสั่งของเส้นนี้ต้องไม่ซ่อนใบยกเลิก");
});

test("ไม่มีคู่สถานะที่ชื่อตรงเลย ⇒ null ไม่ใช่ 0", () => {
  /* 🔑 "ไม่มีช่องที่ชื่อตรง" มักแปลว่า **ชื่อสถานะเปลี่ยน** ไม่ใช่งานค้างหมดไป
     ส่ง 0 = การ์ดขึ้นเลขสวยในวันที่นิยามพัง ซึ่งไม่มีใครจับได้ */
  assert.match(ก้อน, /if \(!เข้า\.length\) return null;/);
  assert.match(ก้อน, /ห้ามเอา null ไปแสดงเป็น 0/);
  // ต้องบอกด้วยว่านับมาจากช่องไหนบ้าง ⇒ คนตรวจย้อนได้โดยไม่ต้องเดา
  assert.match(ก้อน, /ช่องที่นับ:/);
});

test("การ์ดที่ยังไม่ตรงกับ ZORT ต้องประกาศตัว ห้ามติดป้ายว่าตรงกัน", () => {
  const j = ก้อน.indexOf("นิยามการ์ด");
  const นิยาม = ก้อน.slice(j, j + 1400);
  assert.match(นิยาม, /ค้างโอนสินค้า[\s\S]{0,400}ยังไม่ตรงกับ ZORT/);
  assert.match(นิยาม, /ห้ามติดป้ายว่าตรงกัน/);
  // ใบที่ตรงแล้วต้องมีหลักฐานกำกับ (ใครวัด เมื่อไหร่ ได้เท่าไหร่)
  assert.match(นิยาม, /ค้างชำระเงิน[\s\S]{0,300}27 ใบ 56,522/);
});

test("ร้านเดียวต่อคำขอ — all/ค่าแปลก ตอบ 400 ไม่ใช่เหมารวมเงียบ ๆ", () => {
  assert.match(ก้อน, /parseSingleStore\(url\.searchParams\.get\("store"\)\)/);
  assert.match(ก้อน, /if \(storeParsed\.error\) return json\(\{ error: storeParsed\.error \}, 400\);/);
});

test("ดัชนีคลุมต้องมีครบทุกคอลัมน์ที่คำสั่งนั้นแตะ", () => {
  const db = fs.readFileSync("netlify/lib/coredb.mjs", "utf8");
  const m = /CREATE INDEX IF NOT EXISTS idx_orders_source_status_pay ON orders\(([^)]+)\)/.exec(db);
  assert.ok(m, "ไม่เจอดัชนีคลุมของเส้น ?cards=1");
  const คอลัมน์ = m[1].split(",").map((x) => x.trim());
  // ขาดคอลัมน์ไหนก็ไม่ใช่ index-only scan อีกต่อไป ⇒ กลับไปอ่านแถวจริงทั้งตาราง
  for (const c of ["source", "status", "pay_status", "amount"]) assert.ok(คอลัมน์.includes(c), `ดัชนีต้องมี ${c}`);
  assert.equal(คอลัมน์[0], "source", "ตัวกรองต้องนำหน้า ไม่งั้น seek ไม่ได้");
});
