import { test } from "node:test";
import assert from "node:assert/strict";

/* 🔴 คลาสที่ฝั่งจอเจอในจอหมวดหมู่ 18 ก.ย. 2569: Number(x) || 0 ทำให้ "ยังไม่รู้" กลายเป็น 0
   ฝั่งท่อมีจุดเดียวกันที่ zortAmount (ยอดเงินจาก ZORT ที่จอเอาไปเทียบกับกระจก)
   ถ้าเป็น 0 ⇒ ส่วนต่างเท่ากับยอดฝั่งเราทั้งก้อน = แดงลวงเต็มจำนวน
   และตัวรวมสองร้านที่บวก null ⇒ NaN ซึ่งแย่กว่า 0 อีก

   เทสนี้ยิงตรรกะเดียวกับที่ใช้ในไฟล์จริง (คัดมาเป็นฟังก์ชันย่อย) เพื่อบังคับสามข้อ:
   ① ไม่มีค่า ⇒ null ไม่ใช่ 0 · ② 0 จริง ⇒ 0 (ไม่กลายเป็น null) · ③ รวมแล้วมีตัวไม่รู้ ⇒ null + บอกร้าน */
/* ตรรกะเดียวกับ numOrNull ในไฟล์จริง — เทสสองข้อแรกที่ผมเขียนจับได้ว่ารุ่นแรกผิด
   เพราะ Number(null) และ Number("") ให้ 0 และ isFinite(0) เป็นจริง */
const numOrNull = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const amountOf = (d) => numOrNull(d.totalAmount);
const sumStores = (parts, key) => {
  const unknown = parts.filter((p) => numOrNull(p?.[key]) === null).map((p) => p.store);
  return unknown.length ? [null, unknown] : [parts.reduce((n, p) => n + numOrNull(p[key]), 0), []];
};

test("ZORT ไม่ส่งยอดมา ⇒ null ไม่ใช่ 0", () => {
  assert.equal(amountOf({}), null);
  assert.equal(amountOf({ totalAmount: null }), null);
  assert.equal(amountOf({ totalAmount: "" }), null);
  assert.equal(amountOf({ totalAmount: "ไม่ใช่เลข" }), null);
});

test("ZORT บอกว่าศูนย์จริง ⇒ ต้องเป็น 0 ไม่ใช่ null", () => {
  assert.equal(amountOf({ totalAmount: 0 }), 0);
  assert.equal(amountOf({ totalAmount: "0" }), 0);
});

test("ยอดปกติ ⇒ เป็นตัวเลขตามเดิม", () => {
  assert.equal(amountOf({ totalAmount: "12345.67" }), 12345.67);
});

test("รวมสองร้าน: ครบทั้งคู่ ⇒ บวกกันปกติ", () => {
  assert.deepEqual(sumStores([{ store: "z1", a: 10 }, { store: "z2", a: 5 }], "a"), [15, []]);
});

test("รวมสองร้าน: ร้านหนึ่งไม่รู้ ⇒ null + บอกชื่อร้าน (ห้ามเป็น NaN และห้ามกลืนเป็น 0)", () => {
  const [v, unknown] = sumStores([{ store: "z1", a: 10 }, { store: "z2", a: null }], "a");
  assert.equal(v, null);
  assert.deepEqual(unknown, ["z2"]);
  assert.ok(!Number.isNaN(v), "ห้ามเป็น NaN");
});

test("รวมสองร้าน: ศูนย์จริงทั้งคู่ ⇒ 0 ไม่ใช่ null", () => {
  assert.deepEqual(sumStores([{ store: "z1", a: 0 }, { store: "z2", a: 0 }], "a"), [0, []]);
});
