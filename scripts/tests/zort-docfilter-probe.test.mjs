import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeDateResult } from "../../netlify/lib/zort-docfilter-probe.mjs";

/* ตัวตัดสินต้องแยกสามอย่างออกจากกัน: เมินเงียบ · ใช้ได้จริง · เปลี่ยนแต่ไม่ตรงคำตอบที่รู้
   (ถ้ายุบเป็นสองอย่าง "count ขยับ = ใช้ได้" เราจะเชื่อพารามิเตอร์ที่กรองผิดฟิลด์) */
test("count เท่าฐาน ⇒ เมินเงียบ ๆ", () => {
  assert.match(judgeDateResult(694, 694), /เมินเงียบ/);
});

test("count = 3 ตรงกับที่วัดไว้คนละครั้ง ⇒ ใช้ได้", () => {
  assert.match(judgeDateResult(3, 694), /^✅/);
});

test("count เปลี่ยนแต่ไม่ตรงคำตอบที่รู้ ⇒ ยังตัดสินไม่ได้ ไม่ใช่ผ่าน", () => {
  const r = judgeDateResult(689, 694);
  assert.match(r, /ยังตัดสินไม่ได้/);
  assert.ok(!r.startsWith("✅"), "ห้ามนับเป็นผ่าน");
});

test("อ่าน count ไม่ได้ ⇒ ตัดสินไม่ได้ ไม่ใช่ตกหรือผ่าน", () => {
  const r = judgeDateResult(null, 694);
  assert.match(r, /ตัดสินไม่ได้/);
  assert.ok(!r.startsWith("✅") && !r.startsWith("❌"));
});

/* เคสขอบ: ฐานอ่านไม่ได้ แต่ผลได้ 3 ⇒ ยังถือว่าใช้ได้ (คำตอบที่รู้ล่วงหน้าแข็งกว่าฐาน) */
test("ฐานอ่านไม่ได้ แต่ได้ 3 ⇒ ยังตัดสินว่าใช้ได้", () => {
  assert.match(judgeDateResult(3, null), /^✅/);
});
