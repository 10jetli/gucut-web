import { test } from "node:test";
import assert from "node:assert/strict";
import { returnDateRange } from "../../netlify/lib/core-purchases.mjs";

test("ไม่ส่งอะไร ⇒ ไม่มีช่วงวัน (ยังใช้ทาง ZORT สดเหมือนเดิม)", () => {
  assert.deepEqual(returnDateRange({}), { from: null, to: null, days: null });
});

test("from/to ที่ถูกรูป ⇒ ผ่านตรงตัว", () => {
  assert.deepEqual(returnDateRange({ from: "2026-01-01", to: "2026-01-31" }),
    { from: "2026-01-01", to: "2026-01-31", days: null });
});

test("รูปวันผิด ⇒ ตีกลับ ไม่ใช่เมินเงียบ", () => {
  assert.match(returnDateRange({ from: "1/1/2026" }).error, /YYYY-MM-DD/);
  assert.match(returnDateRange({ to: "2026-1-1" }).error, /YYYY-MM-DD/);
});

/* 🔴 ข้อสำคัญ: ฟิลด์ที่ตอบคำถามเดียวกันสองทาง ห้ามเลือกอันหนึ่งเงียบ ๆ */
test("days + from/to พร้อมกัน ⇒ ตีกลับ", () => {
  assert.match(returnDateRange({ days: "30", from: "2026-01-01" }).error, /อย่างใดอย่างหนึ่ง/);
});

test("days นอกช่วง ⇒ ตีกลับ", () => {
  assert.ok(returnDateRange({ days: "0" }).error);
  assert.ok(returnDateRange({ days: "401" }).error);
  assert.ok(returnDateRange({ days: "สามสิบ" }).error);
});

test("days=1 ⇒ ช่วงเป็นวันเดียว (วันไทย) ไม่ใช่ศูนย์วัน", () => {
  const r = returnDateRange({ days: "1" });
  assert.equal(r.from, r.to, "days=1 ต้องได้ from เท่ากับ to");
  assert.equal(r.days, 1);
});

test("days=30 ⇒ ช่วงกว้าง 30 วันพอดี (นับวันแรกด้วย)", () => {
  const r = returnDateRange({ days: "30" });
  const diff = (Date.parse(r.to + "T00:00:00Z") - Date.parse(r.from + "T00:00:00Z")) / 864e5;
  assert.equal(diff, 29, "ห่างกัน 29 วัน = ครอบ 30 วันรวมวันนี้");
});

/* วันไทย: ต้องคิดจาก now+7 ชม. ไม่ใช่ UTC — เทสนี้จะแดงถ้าใครถอด +7 ออก */
/* 🔴 **เทสรุ่นเดิมวูบได้จริง** — มันอ่านนาฬิกาเป็นครั้งที่สาม หลังฟังก์ชันอ่านไปแล้วสองครั้ง
   ⇒ ถ้าวันไทยข้ามเส้นระหว่างนั้น (00:00 ไทย) ค่าต่างกันหนึ่งวัน ⇒ แดงโดยไม่มีบั๊ก
   ⇒ และ "แดงลวง" แพงกว่าเขียวลวง เพราะคนจะไปไล่แก้ของที่ยังดี
   ⇒ ตรึงเวลาด้วย `now` แล้วเลือกเวลาที่ **วันไทยต่างจากวัน UTC** ⇒ ยังพิสูจน์เรื่อง +7 ได้เต็ม
     แต่ผลไม่ขึ้นกับว่ารันตอนไหน */
test("วันสุดท้ายของช่วงคือวันไทยวันนี้ (ตรึงเวลา — พิสูจน์ +7 โดยไม่วูบ)", () => {
  /* 2026-10-16T17:30:00Z = 17 ต.ค. 00:30 เวลาไทย ⇒ วันไทยต้องเป็น 2026-10-17 ไม่ใช่ 2026-10-16 */
  const now = Date.parse("2026-10-16T17:30:00Z");
  assert.equal(returnDateRange({ days: "7", now }).to, "2026-10-17");
  assert.equal(returnDateRange({ days: "7", now }).from, "2026-10-11");
  /* ⏱️ เรียกซ้ำด้วยเวลาเดิมต้องได้ค่าเดิมเสมอ — ข้อนี้จะแดงถ้าใครเอา Date.now() กลับมาใช้ข้างใน */
  assert.deepEqual(returnDateRange({ days: "7", now }), returnDateRange({ days: "7", now }));
});
