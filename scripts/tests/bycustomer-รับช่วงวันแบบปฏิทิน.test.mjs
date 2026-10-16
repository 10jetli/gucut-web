// `?bycustomer=1` / `?daily=1` — รับ from/to ไม่ใช่มีแต่ days
//
// ที่มา: ฝั่งจอ 16 ต.ค. 2569 — ZORT คิด "3 เดือน" เป็น **เดือนปฏิทิน** (เปิดจอ 16 ต.ค. เริ่ม 1 ก.ค.)
//   `days=90` คือนับถอยหลัง ⇒ เริ่ม 18 ก.ค. ⇒ ขาดครึ่งเดือนแรก ⇒ เทียบกับ ZORT ไม่ได้
//   ทั้งที่สองฝั่งเขียนว่า "3 เดือน" เหมือนกัน
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("netlify/functions/core.mjs", "utf8");
/* ขอบของบล็อก — ตัดที่เส้นถัดไป ห้ามใช้ความยาวคงที่ */
const i = src.indexOf('if (url.searchParams.get("daily") || url.searchParams.get("bycustomer")) {');
const j = src.indexOf('if (url.searchParams.get("monthly"))', i);
assert.ok(i > 0 && j > i, "หาขอบของบล็อก daily/bycustomer ไม่เจอ");
const ก้อน = src.slice(i, j);

test("รับ from/to และให้ชนะ days", () => {
  assert.match(ก้อน, /const fromRaw = String\(url\.searchParams\.get\("from"\)/);
  assert.match(ก้อน, /const toRaw = String\(url\.searchParams\.get\("to"\)/);
  assert.match(ก้อน, /const from = fromRaw \|\|/, "ส่ง from มาต้องชนะการนับถอยหลัง");
  assert.match(ก้อน, /const today = toRaw \|\|/, "ส่ง to มาต้องชนะวันนี้");
});

test("วันผิดรูปต้อง 400 ห้ามถอยไปใช้ days เงียบ ๆ", () => {
  /* 🔴 เงียบ = จอส่ง from ไปแล้วเชื่อว่าได้ช่วงนั้น ทั้งที่ได้ 90 วันนับถอย
     ⇒ เทียบกับ ZORT ผิดทั้งหน้า โดยไม่มีอะไรฟ้อง (filter-looks-applied-but-is-not) */
  /* 🔴 **ข้อนี้รุ่นแรกเขียวทั้งที่ปลูกบั๊กลงแล้ว** — ผมตรวจแต่ "ข้อความ error มีอยู่ในซอร์ส"
     ซึ่งยังอยู่ครบแม้ปิดเงื่อนไขทิ้ง ⇒ ด่านที่ไม่เคยเห็นแดง ไม่ใช่ด่าน
     ⇒ ต้องตรึง **ตัวเงื่อนไขที่ตัดสิน** ไม่ใช่ตรึงถ้อยคำที่มันพิมพ์ออกมา */
  assert.match(ก้อน, /if \(v && !วันรูปถูก\(v\)\) \{/, "เงื่อนไขตีกลับวันผิดรูปหายไป");
  assert.match(ก้อน, /ต้องเป็นวันจริงรูป YYYY-MM-DD/);
  assert.match(ก้อน, /\}, 400\);/);
  // ต้องตรวจทั้งสองช่อง ไม่ใช่ช่องเดียว
  assert.match(ก้อน, /\[\["from", fromRaw\], \["to", toRaw\]\]/);
  // ต้องเป็น "วันจริง" ไม่ใช่แค่รูปถูก — 2026-13-40 ผ่านรูปแต่ไม่ใช่วัน
  assert.match(ก้อน, /!Number\.isNaN\(Date\.parse\(v\)\)/);
});

test("from อยู่หลัง to ⇒ 400 (ว่างโดยโครงสร้าง ไม่ใช่ตอบ 0)", () => {
  assert.match(ก้อน, /if \(from > today\) \{[\s\S]{0,260}?\}, 400\);/);
  assert.match(ก้อน, /ว่างโดยโครงสร้าง/);
});

test("scope.days ต้องเป็นวันของช่วงที่ใช้จริง ไม่ใช่เลขที่ส่งมา", () => {
  /* ส่ง from/to มาแล้ว days ที่ส่งมาไม่มีผล ⇒ คืนเลขที่ส่งมา = สองช่องขัดกันเองในคำตอบเดียว */
  assert.match(ก้อน, /days: วันในช่วง,/);
  assert.ok(!/\n        days,\n/.test(ก้อน), "ยังคืน days ดิบที่ผู้เรียกส่งมาอยู่");
  assert.match(ก้อน, /const วันในช่วง = Math\.round\(\(Date\.parse\(today\) - Date\.parse\(from\)\)/);
});

test("ต้องบอกว่าช่วงมาจากไหน — จอจะได้รู้ว่าเทียบกับ ZORT ได้หรือยัง", () => {
  assert.match(ก้อน, /ช่วงมาจาก:/);
  assert.match(ก้อน, /ไม่ใช่เดือนปฏิทิน/);
});

test("ไม่ไปแตะเส้นอื่นที่มีโค้ดหน้าตาเหมือนกัน (?noitems=1)", () => {
  /* 🔴 ของจริงเมื่อครู่: `days/today/from` สามบรรทัดนี้ซ้ำกันเป๊ะกับเส้น ?noitems=1
     ⇒ แทนด้วย anchor สั้นไปลงเส้นผิด แล้วโค้ดพังคาบเกี่ยวสองเส้น (same-shape-other-direction) */
  const n = src.indexOf('if (url.searchParams.get("noitems")) {');
  assert.ok(n > 0);
  const เส้นnoitems = src.slice(n, src.indexOf("\n    }\n", n));
  assert.ok(!/fromRaw|วันในช่วง|ช่วงมาจาก/.test(เส้นnoitems), "ของใหม่ไปโผล่ในเส้น ?noitems=1");
  assert.match(เส้นnoitems, /const from = new Date\(Date\.now\(\) \+ 7 \* 3600e3 - days \* 864e5\)/);
});
