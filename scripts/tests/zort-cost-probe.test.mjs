import { test } from "node:test";
import assert from "node:assert/strict";
import { shape, hint } from "../../netlify/lib/zort-product-fields-probe.mjs";

/* ตัวยิงถามนี้คืนคำตอบดิบจาก ZORT ⇒ ต้องพิสูจน์ว่ามัน **ไม่พาเนื้อข้อความออกมา**
   (ของสินค้าไม่มี PII แต่คนรอบหน้าจะลอกไฟล์นี้ไปใช้กับ Contact/Order ซึ่งมี) */
test("shape: ไม่คืนเนื้อข้อความ คืนแต่ความยาว", () => {
  const name = "เลื่อยยนต์ NEWWAVE 070";
  const out = shape({ name, phone: "0812345678" });
  // ผูกกับความยาวจริงของสตริง ไม่ใช่เลขที่นับด้วยมือ (นับมือพลาดมาแล้วในเทสนี้เอง)
  assert.equal(out.name, `(ข้อความ ${name.length} ตัวอักษร)`);
  assert.ok(!out.name.includes("NEWWAVE"), "เนื้อข้อความต้องไม่หลุดออกมา");
  assert.ok(!JSON.stringify(out).includes("0812345678"), "เบอร์ต้องไม่หลุดออกมา");
});

test("shape: ตัวเลขคืนค่าจริง เพราะเป็นตัวชี้ว่าช่องไหนคือต้นทุน", () => {
  assert.equal(shape({ purchaseprice: 137.25 }).purchaseprice, 137.25);
});

/* สามสถานะ: ว่าง ≠ 0 ≠ ไม่มีช่อง */
test("shape: null บอกว่าว่าง ไม่แปลงเป็น 0", () => {
  const out = shape({ a: null, b: 0 });
  assert.equal(out.a, "ว่าง");
  assert.equal(out.b, 0);
});

test("hint: จับชื่อที่สื่อถึงต้นทุน และไม่จับชื่ออื่น", () => {
  const got = hint(["sku", "name", "averagecost", "stockvalue", "purchaseprice", "unittext"]);
  assert.deepEqual(got, ["averagecost", "stockvalue", "purchaseprice"]);
});

/* 🧪 ตัวควบคุมของเทสเอง — ถ้าของจริงตรงข้าม ผลต้องเปลี่ยน (กฎ test-must-discriminate) */
test("hint: ไม่มีช่องต้นทุนเลย ⇒ ต้องได้ลิสต์ว่าง ไม่ใช่เดาให้", () => {
  assert.deepEqual(hint(["sku", "name", "unittext"]), []);
});
