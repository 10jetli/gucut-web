/* 🔴 ด่าน: **กติกา "สินค้าใหม่ต้องมีรูป"** (ท่านประธานอนุมัติ 28 ก.ย. 2569)
 *
 * ที่มา: ฝั่งจอไล่ครบ 2,674 รหัส ⇒ สินค้าจริงที่ไม่มีรูปเลย **566 รหัส**
 * 🔑 ของค้างแก้ครั้งเดียวจบ **แต่ของที่ไหลเข้ามาใหม่จะไม่มีวันจบ** ถ้าไม่ปิดประตูที่ขั้นตอนสร้าง
 * ⚠️ ZORT `AddProduct` **ไม่มีช่องรูป** ⇒ ประตูนี้บังคับที่ฝั่งเรา และต้องพูดความจริงข้อนั้นในคำตอบ
 *    (ไม่งั้นคนเข้าใจว่าใส่ URL แล้วรูปจะไปโผล่ใน ZORT เอง ซึ่งไม่เกิดขึ้น)
 * 🚫 "ลืม" ต้องไม่ใช่ทางที่ง่ายที่สุด ⇒ ไม่ส่งอะไรเลย = **ตีกลับ** ไม่ใช่ผ่านเงียบ
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { zortAddProduct } from "../../netlify/lib/zort-write.mjs";

const ฐาน = { ref: "ทดสอบกติการูป", sku: "TEST-PHOTO-1", name: "สินค้าทดสอบ" };

test("🔴 ไม่ส่งรูปและไม่ส่งเหตุผล ⇒ **ตีกลับ** (ลืมต้องไม่ใช่ทางที่ง่ายที่สุด)", async () => {
  delete process.env.ALLOW_PRODUCT_WITHOUT_PHOTO;
  const r = await zortAddProduct({ ...ฐาน });
  assert.equal(r.ok, false);
  assert.match(String(r.error), /ต้องมีรูป/);
  assert.ok(r["กติกา"], "ต้องบอกที่มาของกติกา ไม่ใช่ปฏิเสธเปล่า ๆ");
});

test("✅ ส่ง `รูป` ⇒ ผ่าน และคำตอบต้องบอกความจริงว่าไม่ได้ส่งไป ZORT", async () => {
  const r = await zortAddProduct({ ...ฐาน, "รูป": "https://gucut.com/img/x.jpg" });
  assert.notEqual(r.ok, false);
  assert.equal(r["📸 รูป"], "https://gucut.com/img/x.jpg");
  assert.match(String(r["⚠️ ZORT ไม่มีช่องรูป"]), /ไม่ได้ส่งไป ZORT/);
});

test("✅ ส่ง `ไม่มีรูปเพราะ` ⇒ ผ่าน **แต่ต้องถูกจดว่าเป็นหนี้**", async () => {
  const r = await zortAddProduct({ ...ฐาน, "ไม่มีรูปเพราะ": "รอของเข้าคลังก่อนถ่าย" });
  assert.notEqual(r.ok, false);
  assert.equal(r["📸 ยังไม่มีรูป"], "รอของเข้าคลังก่อนถ่าย");
  assert.match(String(r["⚠️ นับเป็นหนี้"]), /ไม่มีรูป/);
});

test("⚠️ เปิดประตูด้วย env ⇒ ผ่าน **แต่ต้องประกาศตัวในคำตอบ** (กันลืมปิด)", async () => {
  process.env.ALLOW_PRODUCT_WITHOUT_PHOTO = "1";
  try {
    const r = await zortAddProduct({ ...ฐาน });
    assert.notEqual(r.ok, false);
    assert.match(String(r["🚫 ผ่านเพราะเปิดประตูไว้"]), /ALLOW_PRODUCT_WITHOUT_PHOTO/);
  } finally { delete process.env.ALLOW_PRODUCT_WITHOUT_PHOTO; }
});

test("🔑 ประตูนี้ต้องอยู่ **หลัง** การตรวจ sku/name — ของที่ผิดร้ายแรงกว่าต้องตอบก่อน", async () => {
  const r = await zortAddProduct({ ref: "x" });
  assert.match(String(r.error), /sku|name/, `ขาด sku/name ต้องตอบเรื่องนั้นก่อนเรื่องรูป · ได้ ${r.error}`);
});

test("🚫 ยังเป็นโหมดซ้อมเป็นค่าเริ่มต้น — กติการูปต้องไม่เปลี่ยนข้อนี้", async () => {
  const r = await zortAddProduct({ ...ฐาน, "รูป": "ถ่ายแล้ว" });
  assert.equal(r.dryRun, true, "ไม่ส่ง confirm:true ⇒ ต้องยังเป็นโหมดซ้อม");
});
