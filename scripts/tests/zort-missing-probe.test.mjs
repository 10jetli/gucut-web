import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeMissing } from "../../netlify/lib/zort-missing-products-probe.mjs";

/* ต้องแยกสี่ผลออกจากกัน — ยุบเป็น "ขยับ/ไม่ขยับ" เมื่อไหร่ เราจะเชื่อพารามิเตอร์ที่กรองของออก
   ว่าเป็นตัวปลดล็อก ซึ่งพาไปแก้ผิดทางทั้งสาย */
test("count เท่าฐาน ⇒ ถูกเมิน", () => {
  assert.match(judgeMissing(2674, 2674, 2900), /ถูกเมิน/);
});

test("count ตรงเลขบนจอ ⇒ ปลดล็อกได้", () => {
  assert.match(judgeMissing(2900, 2674, 2900), /^✅/);
  assert.match(judgeMissing(2899, 2674, 2900), /^✅/, "ต่าง 1 ยังถือว่าตรง (ร้านเพิ่มสินค้าระหว่างวัด)");
});

test("count เพิ่มแต่ไม่ตรงเลขบนจอ ⇒ ยังตัดสินไม่ได้ ห้ามนับเป็นคำตอบ", () => {
  const r = judgeMissing(14084, 2674, 2900);
  assert.match(r, /ยังตัดสินไม่ได้/);
  assert.ok(!r.startsWith("✅"), "14,084 คือรวมของที่ถูกลบ ไม่ใช่คำตอบของ 226");
});

test("count ลด ⇒ บอกว่ากรองของออก ไม่ใช่ปลดล็อก", () => {
  assert.match(judgeMissing(500, 2674, 2900), /กรองของออก/);
});

test("อ่าน count ไม่ได้ ⇒ ตัดสินไม่ได้ ไม่ใช่ตกหรือผ่าน", () => {
  const r = judgeMissing(null, 2674, 2900);
  assert.match(r, /ตัดสินไม่ได้/);
  assert.ok(!r.startsWith("✅") && !r.startsWith("❌"));
});

/* ไม่มีเลขบนจอ ⇒ ยังตัดสินได้ว่า "ถูกเมิน" แต่ห้ามประกาศว่าปลดล็อก */
test("ไม่มีเลขบนจอ ⇒ ไม่ประกาศว่าปลดล็อก", () => {
  assert.ok(!judgeMissing(2900, 2674, null).startsWith("✅"));
});
