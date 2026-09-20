/* 🔢 ด่าน: **ตัวเลขที่ชื่อ `bytes`/`ไบต์` ต้องวัดเป็นไบต์ ไม่ใช่อักขระ**
 *
 * 🔴 ที่มา 20 ก.ย. 2569 — ฝั่งจอรายงานขนาดคำตอบหนึ่ง 19,680 ไบต์ · ผมวัดได้ 9,886
 *    ⇒ ผมตีความว่า "ท่อคนละยุค" ซึ่งเข้ากับบริบทวันนั้นพอดี (เจอเรื่องยุคจริงมาแล้ว 6 ข้อ)
 *    📏 ของจริง: `stat -c%s` = 19,680 **ตรงกัน** — เลขผมคือ `len()` = **จำนวนอักขระ**
 *       คำตอบเป็นไทยเกือบทั้งก้อน ⇒ UTF-8 ตัวละ 3 ไบต์
 *    🔑 หน่วยผิดให้ **อัตราส่วนคงที่** ⇒ *อัตราส่วนสวย ๆ ระหว่างสองการวัด = สัญญาณเรื่องหน่วย*
 *       ⇒ **เลขสองฝั่งไม่ตรง ⇒ ถามเรื่องหน่วยก่อนถามเรื่องยุค** (ฝั่งจอสรุปประโยคนี้)
 *
 * 🔴 และไล่ทั้งคลาสแล้วเจอของจริงในโค้ดที่ **ตัดสินใจด้วยเลขนั้น** ไม่ใช่แค่รายงาน:
 *    · `backup.mjs` — `size = text.length` เทียบกับ `BATCH_BYTES`/`MAX_ONE` ที่ตั้งใจเป็นไบต์
 *    · `stock-moves.mjs` — `pr.length` เทียบกับ `MAX_SQL` (คอมเมนต์เขียนว่า "ไบต์")
 *    · `core-products.mjs` — `bytes: text.length` ส่งออกให้จอ
 *    ⇒ ⇒ **เลขที่ต่ำกว่าจริง 2–3 เท่า ถูกใช้เป็นเพดาน** ⇒ ก้อนจริงใหญ่กว่าที่ระบบคิดตลอดมา
 *
 * 🚫 ด่านนี้ **ไม่ได้อ้างว่าเป็นเหตุของ `backup-run` ล้ม** — ตรวจแล้วยังแยกไม่ออก
 *    (`gucut-coupon` ใหญ่กว่าแต่สำเร็จ) ⇒ เรื่องนั้นยังเป็น "ยังไม่รู้" ตามที่จดไว้
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const อ่าน = (p) => readFileSync(p, "utf8");

/** ไทยล้วน: 1 อักขระ = 3 ไบต์ — ใช้เป็น "ของที่รู้คำตอบอยู่ก่อน" */
const ตัวอย่างไทย = "สำรองข้อมูลออเดอร์";

test("🔬 ตัวควบคุม: ของที่รู้คำตอบอยู่ก่อน — สองวิธีต้องให้เลขต่างกันจริง", () => {
  assert.equal(ตัวอย่างไทย.length, 18, "จำนวนอักขระ");
  assert.equal(Buffer.byteLength(ตัวอย่างไทย, "utf8"), 54, "จำนวนไบต์ = 3 เท่า");
  /* 🔑 ถ้าข้อนี้เคยเท่ากัน แปลว่าเลือกตัวอย่างเป็น ASCII ⇒ เทสทั้งไฟล์จะแยกแยะอะไรไม่ได้เลย */
  assert.notEqual(ตัวอย่างไทย.length, Buffer.byteLength(ตัวอย่างไทย, "utf8"));
});

test("จุดที่ตัดสินใจด้วยขนาด ต้องใช้ Buffer.byteLength ไม่ใช่ .length", () => {
  const จุด = [
    ["netlify/lib/backup.mjs", /const size = Buffer\.byteLength\(text, "utf8"\)/, /const size = text\.length/],
    ["netlify/lib/stock-moves.mjs", /const ขนาดpr = Buffer\.byteLength\(pr, "utf8"\)/, /bytes \+= pr\.length/],
    ["netlify/lib/core-products.mjs", /bytes: Buffer\.byteLength\(text, "utf8"\)/, /bytes: text\.length/],
  ];
  for (const [ไฟล์, ต้องมี, ต้องไม่มี] of จุด) {
    const s = อ่าน(ไฟล์);
    assert.match(s, ต้องมี, `${ไฟล์} ต้องวัดเป็นไบต์`);
    assert.doesNotMatch(s, ต้องไม่มี, `${ไฟล์} ยังมีรูปที่นับอักขระแล้วเรียกว่าไบต์`);
  }
});

test("🔬 พลังแยกแยะ: ถ้าใครเปลี่ยนกลับเป็น .length เทสข้างบนต้องแดง", () => {
  /* ปลูกในหน่วยความจำ (ไม่แตะไฟล์) — พิสูจน์ว่า assertion ข้างบนไม่ใช่ประโยคที่ผ่านเสมอ */
  const ปลอม = อ่าน("netlify/lib/backup.mjs").replace(
    'const size = Buffer.byteLength(text, "utf8")', "const size = text.length",
  );
  assert.doesNotMatch(ปลอม, /const size = Buffer\.byteLength\(text, "utf8"\)/);
  assert.match(ปลอม, /const size = text\.length/, "ของปลูกต้องอยู่ในรูปที่เทสข้างบนจับ");
});

test("⚠️ ขอบเขต: `.length` บน Buffer และบน base64 **ถูกอยู่แล้ว** — ห้ามไปแก้", () => {
  /* 📏 ไล่คลาสรอบนั้นเจอ 13 จุดในตะแกรงหยาบ แต่ **ของจริงมี 3 จุด**
     บวกลวงที่เจอ: `buf.length` ของ Buffer (คือไบต์จริง) · `b64.length * 0.75` (base64 เป็น ASCII)
     ⇒ 🔑 **เจอในตะแกรง ≠ ต้องแก้** — ถ้าแก้ตามตะแกรงจะทำของที่ถูกอยู่ให้ผิด */
  const buf = Buffer.from(ตัวอย่างไทย, "utf8");
  assert.equal(buf.length, 54, "Buffer.length คือไบต์ ⇒ ใช้ได้เลย");
  const b64 = buf.toString("base64");
  assert.equal(b64.length, Buffer.byteLength(b64, "utf8"), "base64 เป็น ASCII ⇒ อักขระ = ไบต์");
});
