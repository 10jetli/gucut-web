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
test("วันสุดท้ายของช่วงคือวันไทยวันนี้", () => {
  const thai = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  assert.equal(returnDateRange({ days: "7" }).to, thai);
});
