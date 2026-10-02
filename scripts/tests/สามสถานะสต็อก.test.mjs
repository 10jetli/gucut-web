#!/usr/bin/env node
/* สถานะสต็อกมีสามสถานะ ไม่ใช่สอง — ตรึงกติกาที่ `src/lib/stock-state-core.js` (แอปเรียกผ่าน `stock-state.ts`)
 *
 * 🔴 ที่มา 2 ต.ค. 2569 — ท่านประธานถ่ายจอมาเอง:
 *    การ์ด `00313 หัวเทียน NEWWAVE` ขึ้น "สินค้าหมด" ทั้งที่ ZORT มี 641 ชิ้น
 *    วัดครบแคตตาล็อก 2,505 ใบ: ขึ้นป้ายหมด 631 ใบ ⇒ 26 โกหก (3,958 ชิ้น) · 373 หมดจริง · 232 ไม่รู้
 *    (227 ใน 232 ใบ **ไม่มีช่อง sku เลย** รหัสฝังอยู่ในชื่อสินค้า ⇒ ไม่มีกุญแจจะถามสต็อก)
 *
 * 🔑 เทสนี้ตรึง **ทิศที่พลาดแล้วเสียเงิน** ไว้ทั้งสองทาง
 *    · ไม่รู้ ⇒ ห้ามขึ้นว่าหมด  (เสียยอดขาย — อาการที่ท่านเจอ)
 *    · ไม่รู้ ⇒ ห้ามบอกว่ามีของ (รับออเดอร์ของที่ไม่มี — โกหกกลับทาง)
 *    มีแต่ทิศเดียวไม่พอ: ตะแกรงที่ปล่อยทุกอย่างผ่านก็สอบผ่านทิศเดียวได้
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  สถานะจากค่า, สถานะของสินค้า, สถานะของตัวเลือก,
  ขึ้นป้ายหมดได้, ยังขายได้, availabilityของ,
} from "../../src/lib/stock-state-core.js";

test("แกนกลาง: ไม่รู้ ห้ามกลายเป็นศูนย์", () => {
  for (const v of [null, undefined, NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(สถานะจากค่า(v), "ไม่รู้", `${String(v)} ต้องเป็น ไม่รู้`);
  }
  /* 🟢 ทิศตรงข้าม — ค่าที่รู้จริงต้องไม่กลายเป็น "ไม่รู้" */
  assert.equal(สถานะจากค่า(0), "หมดจริง");
  assert.equal(สถานะจากค่า(-8), "หมดจริง");
  assert.equal(สถานะจากค่า(1), "มีของ");
  assert.equal(สถานะจากค่า(641), "มีของ");
});

test("ระดับสินค้า: stKnown=false ชนะตัวเลขที่แช่ไว้", () => {
  /* 🔴 นี่คือหัวใจของบั๊ก — ตัวเลขที่แช่ไว้ตั้งแต่ 15 ส.ค. ห้ามถูกใช้ตัดสิน */
  assert.equal(สถานะของสินค้า({ st: 0, stKnown: false }), "ไม่รู้");
  assert.equal(สถานะของสินค้า({ st: 999, stKnown: false }), "ไม่รู้");
  assert.equal(สถานะของสินค้า({ st: 0, stKnown: true }), "หมดจริง");
  assert.equal(สถานะของสินค้า({ st: 641, stKnown: true }), "มีของ");
});

test("ระดับตัวเลือก: ไม่ใส่ sKnown = รู้ (ของเดิมไม่พังทั้งก้อน)", () => {
  assert.equal(สถานะของตัวเลือก({ s: 3 }), "มีของ");
  assert.equal(สถานะของตัวเลือก({ s: 0 }), "หมดจริง");
  assert.equal(สถานะของตัวเลือก({ s: 0, sKnown: false }), "ไม่รู้");
  assert.equal(สถานะของตัวเลือก({ s: 12, sKnown: false }), "ไม่รู้");
});

test("ป้าย 'สินค้าหมด' ขึ้นได้เฉพาะหมดจริง", () => {
  assert.equal(ขึ้นป้ายหมดได้("หมดจริง"), true);
  /* 🟢 ตัวควบคุมลบ — สองสถานะนี้ห้ามขึ้นป้าย ไม่งั้นเราได้บั๊กเดิมคืนมา */
  assert.equal(ขึ้นป้ายหมดได้("ไม่รู้"), false);
  assert.equal(ขึ้นป้ายหมดได้("มีของ"), false);
});

test("ไม่รู้ ยังต้องขายได้ (และต้องไม่ถูกซ่อนจากหน้ารวม)", () => {
  assert.equal(ยังขายได้("ไม่รู้"), true);
  assert.equal(ยังขายได้("มีของ"), true);
  assert.equal(ยังขายได้("หมดจริง"), false);
});

test("schema.org: ไม่รู้ ห้ามบอก Google ว่า OutOfStock", () => {
  assert.equal(availabilityของ("มีของ"), "https://schema.org/InStock");
  assert.equal(availabilityของ("หมดจริง"), "https://schema.org/OutOfStock");
  const ไม่รู้ = availabilityของ("ไม่รู้");
  assert.notEqual(ไม่รู้, "https://schema.org/OutOfStock");
  assert.equal(ไม่รู้, "https://schema.org/LimitedAvailability");
});

test("ไฟล์สต็อกสดที่อบไว้ ต้องบอกตัวเองว่าสดแค่ไหน และไม่มีค่าเสีย", () => {
  const j = JSON.parse(readFileSync(new URL("../../src/data/stock-live.json", import.meta.url), "utf8"));
  assert.ok(["live", "cached", "baked"].includes(j.source), `source ต้องเป็นสามค่านี้ · ได้ ${j.source}`);
  assert.equal(typeof j.map, "object");
  /* ค่าเสียในแมป = "ไม่รู้" ที่ปลอมตัวเป็นตัวเลข ⇒ ห้ามมี */
  const เสีย = Object.entries(j.map).filter(([, v]) => typeof v !== "number" || !Number.isFinite(v));
  assert.equal(เสีย.length, 0, `พบค่าเสีย ${เสีย.length} รายการ เช่น ${JSON.stringify(เสีย[0])}`);
  if (j.source === "baked") {
    assert.equal(Object.keys(j.map).length, 0, "source=baked แต่มีข้อมูลในแมป ⇒ ป้ายกับของไม่ตรงกัน");
  }
});
