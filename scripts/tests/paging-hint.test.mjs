import { test } from "node:test";
import assert from "node:assert/strict";
import { withPagingHint, rowsOf } from "../../netlify/lib/paging-hint.mjs";

const rows = (n) => Array.from({ length: n }, (_, i) => ({ i }));

/* 🔴 เคสของจริงที่ทำให้เกิดไฟล์นี้: ผู้เรียกขอ 300 · ท่อให้ 200
   ถ้าผู้เรียกบวก 300 เอง จะข้ามแถวรอบละ 100 — ท่อต้องบอกจุดถัดไปที่ถูกให้เลย */
test("ขอ 300 ได้ 200 ⇒ nextOffset ต้องเป็น 200 ไม่ใช่ 300", () => {
  const out = withPagingHint({ rows: rows(200), limitApplied: 200 }, 200, { offset: "0" });
  assert.equal(out.nextOffset, 200);
  assert.equal(out.pagingDone, false);
});

test("รอบที่สอง: offset 200 ⇒ nextOffset 400 (บวกจำนวนแถวที่ได้จริง)", () => {
  const out = withPagingHint({ rows: rows(200) }, 200, { offset: "200" });
  assert.equal(out.nextOffset, 400);
});

test("ได้แถวน้อยกว่าเพดาน ⇒ จบชุด และ nextOffset เป็น null ไม่ใช่เลขต่อไป", () => {
  const out = withPagingHint({ rows: rows(73) }, 200, { offset: "2600" });
  assert.equal(out.pagingDone, true);
  assert.equal(out.nextOffset, null);
});

/* ⚠️ กรองบางแถวออกแล้วยังไม่จบ — บวก applied จะข้ามแถว ต้องบวกจำนวนแถวจริง
   (ที่นี่ applied=200 แต่คืน 150 ⇒ pagingDone=true ตามกติกา "น้อยกว่าที่ให้ = จบ"
    เทสนี้ยืนยันว่าเราไม่แอบเดาว่า "ยังมีต่อ" จากการกรอง) */
test("คืนน้อยกว่าเพดาน = ประกาศจบ ไม่เดาต่อ", () => {
  assert.equal(withPagingHint({ rows: rows(150) }, 200, {}).pagingDone, true);
});

test("เส้นที่ไล่ด้วย page ⇒ ได้ nextPage ไม่ใช่ nextOffset", () => {
  const out = withPagingHint({ items: rows(200) }, 200, { page: "3" });
  assert.equal(out.nextPage, 4);
  assert.equal(out.nextOffset, undefined);
});

/* ข้อห้าม 1: ห้ามทับค่าที่ payload รู้ดีกว่าเรา */
test("payload ที่ส่ง pageToken เอง ⇒ ห้ามแตะเลย", () => {
  const src = { rows: rows(200), pageToken: "abc" };
  assert.deepEqual(withPagingHint(src, 200, {}), src);
});

test("payload ที่ส่ง nextOffset เอง ⇒ ห้ามทับ", () => {
  const out = withPagingHint({ rows: rows(200), nextOffset: 999 }, 200, { offset: "0" });
  assert.equal(out.nextOffset, 999);
});

/* สามสถานะ: ไม่มีอาเรย์แถว = ไม่รู้ ⇒ ต้องไม่เติมอะไรเลย (ห้ามเดาว่าจบ) */
test("ไม่มีอาเรย์แถว ⇒ ไม่เติมคีย์ใด ๆ", () => {
  const src = { total: 5 };
  assert.deepEqual(withPagingHint(src, 200, {}), src);
});

test("ไม่มี limit ที่ใช้จริง ⇒ ไม่เติมคีย์ใด ๆ", () => {
  const src = { rows: rows(3) };
  assert.deepEqual(withPagingHint(src, NaN, {}), src);
});

test("rowsOf รู้จักชื่อคีย์ที่ใช้จริง และไม่เดาคีย์อื่น", () => {
  assert.equal(rowsOf({ list: rows(2) })?.length, 2);
  assert.equal(rowsOf({ ตาราง: rows(2) }), null);
});
