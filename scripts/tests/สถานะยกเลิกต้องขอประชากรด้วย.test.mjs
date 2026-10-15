/* ทดสอบ: ขอ `status` ที่เป็นใบยกเลิกทั้งหมด โดยไม่ส่ง `cancelled=1` ⇒ ต้อง **400** ห้ามตอบ 0
 *
 * 🔴 ที่มา (16 ต.ค. 2569 · ใบ t_mva0li5s) — ความผิดของ CTO เอง ครั้งที่สองของคลาสเดียวกันในวันเดียว:
 *    ยิง `?list=orders&store=z1&status=Voided&from=..&to=..` ได้ **0** แล้วเขียนลงจดหมายถึงฝั่งจอว่า
 *    "Voided 0 · สี่กองรวมได้ 1,865 = total พอดี ⇒ ไม่มีกองตกหล่น"
 *    ของจริง: **137 ใบ** (ฝั่งจอยิงด้วย `cancelled=1` แล้วเจอ) ⇒ ประโยคผมผิดทั้งประโยค
 *    และ "สี่กองรวมได้พอดี" ก็พอดีเพราะ **ทุกกองถูกตัดใบยกเลิกออกเหมือนกัน** ⇒ ไม่พิสูจน์อะไร
 *
 * 🔑 กฎ: **คำขอที่ตอบ 0 โดยโครงสร้าง ต้องไม่ตอบ 0 เฉย ๆ** — เซตว่างโดยนิยาม ≠ ข้อค้นพบ
 * ⚠️ ทิศที่ต้องจับทั้งคู่ ไม่ใช่ทิศเดียว:
 *    ① ยกเลิกล้วน + ไม่ส่ง cancelled ⇒ ต้องมีด่าน
 *    ② ยกเลิกล้วน + ส่ง cancelled=1 ⇒ **ต้องผ่าน** (ไม่งั้นแท็บ "ยกเลิก" ของจอใช้ไม่ได้เลย)
 *    ③ สถานะผสม (Success,Voided) ⇒ **ต้องผ่าน** เพราะยังมีกองที่ตอบได้จริง
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isCancelLike, CANCEL_WORDS } from "../../netlify/lib/param-guard.mjs";

const ซอร์ส = readFileSync("netlify/functions/core.mjs", "utf8");

test("ด่านต้องอยู่ในทางเดิน และอยู่ก่อนการเรียกเส้น", () => {
  const ด่าน = ซอร์ส.indexOf("ต้องส่งcancelled: true");
  assert.ok(ด่าน > 0, "ไม่มีด่าน 'ต้องส่งcancelled' ในทางเดิน");
  const เรียกจริง = ซอร์ส.indexOf("...(await listOrderFacets({");
  assert.ok(เรียกจริง > 0 && ด่าน < เรียกจริง, "ด่านต้องอยู่ก่อนการเรียกเส้น ไม่ใช่หลัง");
  assert.ok(ซอร์ส.includes("every(isCancelLike)"), "ด่านต้องใช้ isCancelLike (แหล่งเดียวกับ CANCEL_SQL)");
});

test("ด่านต้องไม่จับเมื่อส่ง cancelled=1 หรือเมื่อสถานะผสม", () => {
  /* อ่านเงื่อนไขจริงจากซอร์ส: ต้องมีทั้ง !ธงยกเลิก และ every(...)
     ⇒ ขาดข้อใดข้อหนึ่ง = ด่านจะไปจับแท็บที่ควรใช้งานได้ */
  /* ⚠️ อ่าน **ทั้งบรรทัด** ไม่ใช่ `([^)]*)` — รอบแรกเทสนี้แดงเพราะตัวมันเอง:
     `[^)]*` หยุดที่วงเล็บปิดตัวแรกซึ่งอยู่ใน `every(isCancelLike)` ⇒ จับไม่ติด
     (เทสที่แดงเพราะ regex ของตัวเอง = แดงลวง ซึ่งทำให้คนไปแก้โค้ดที่ยังดีอยู่) */
  const เงื่อนไข = ซอร์ส.split("\n").filter((บรรทัด) => บรรทัด.includes("ค่าสถานะ.length &&"));
  assert.equal(เงื่อนไข.length, 1, "หาเงื่อนไขของด่านไม่เจอ หรือเจอหลายที่");
  assert.ok(/!ธงยกเลิก/.test(เงื่อนไข[0]), "ขาดเงื่อนไข !ธงยกเลิก ⇒ ส่ง cancelled=1 แล้วยังโดนด่าน");
  assert.ok(/every\(/.test(เงื่อนไข[0]), "ต้องเป็น every ไม่ใช่ some ⇒ สถานะผสมต้องผ่าน");
});

test("ตัวตัดสิน 'ใบยกเลิก' ต้องเป็นแหล่งเดียวกับ SQL ที่ตัดกองออก", () => {
  const orders = readFileSync("netlify/lib/core-orders.mjs", "utf8");
  /* 🔑 ถ้า CANCEL_SQL กลับไปพิมพ์คำเองอีกชุด สองฝั่งจะต่างกันได้เงียบ ๆ
     อาการวันนั้น: ด่านบอกว่า "ถามได้" แต่ SQL ตัดกองออกแล้ว ⇒ ตอบ 0 โดยไม่มีอะไรฟ้อง */
  assert.ok(
    /const CANCEL_SQL = CANCEL_WORDS\.map\(/.test(orders),
    "CANCEL_SQL ต้องสร้างจาก CANCEL_WORDS ห้ามพิมพ์คำซ้ำอีกชุด"
  );
  assert.ok(orders.includes("CANCEL_WORDS } from \"./param-guard.mjs\"") || /CANCEL_WORDS[^\n]*param-guard/.test(orders),
    "core-orders ต้อง import CANCEL_WORDS จาก param-guard");
});

test("isCancelLike: สะกดแบบที่ ZORT ใช้จริงต้องจับได้ และคำปกติต้องไม่โดนจับ", () => {
  for (const v of ["Voided", "voided", "Cancelled", "CANCEL", "ยกเลิกแล้ว"]) {
    assert.ok(isCancelLike(v), `ควรจับ "${v}" ได้`);
  }
  /* ⚠️ ตัวควบคุมลบ — สำคัญกว่าตัวบวก: ถ้ามันจับคำปกติ แท็บที่ใช้งานได้จะโดนด่านปิดทั้งแท็บ */
  for (const v of ["Success", "Pending", "Waiting", "", null, "สำเร็จ"]) {
    assert.ok(!isCancelLike(v), `ไม่ควรจับ "${v}"`);
  }
  assert.deepEqual(CANCEL_WORDS, ["cancel", "void", "ยกเลิก"], "ชุดคำเปลี่ยน ⇒ ต้องตามไปดู CANCEL_SQL ด้วย");
});
