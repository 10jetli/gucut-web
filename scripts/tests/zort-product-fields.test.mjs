// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-product-fields.test.mjs
// 19 ก.ย. 2569 · ใบ t_mu7aduin — ตอบว่า ZORT ส่งช่องอะไรมากับสินค้า (properties? รูปหลายรูป?)
// 🔴 สิ่งที่เฝ้า:
//    · **คืนแค่ชื่อช่อง+ชนิด ห้ามคืนค่า** (ตัวตรวจไม่ควรพาข้อมูลสินค้าออกมา)
//    · ไม่พบ sku = found:false **ไม่ใช่** "ZORT ไม่มีช่องนั้น" (สองเรื่องคนละเรื่อง)
//    · ถามไม่สำเร็จ/ไม่ใช่ JSON = unknown ห้ามแปลว่าไม่มีช่อง
//    · เรียกฟังก์ชันจริง ⇒ จับชื่อฟังก์ชันที่ไม่มีอยู่ ซึ่ง `node --check` มองไม่เห็น
//      (รอบแรกผมเขียน `zortHeaders()` ทั้งที่ของจริงชื่อ `creds()` — .mjs ไม่มีตาข่ายชนิดข้อมูล)
import { test } from "node:test";
import assert from "node:assert/strict";

/* 🔴 ต้องตั้งรหัสปลอมก่อน import — ไม่ตั้ง ด่านรหัสจะตีกลับทุกเคส
   ⇒ ตัวทดสอบจะ "ล้มเพราะไม่ถึงโค้ดที่ตั้งใจทดสอบ" ซึ่งดูเหมือนฟังก์ชันพัง
   (เจอกับตัวเองรอบแรก 19 ก.ย. 2569 — ผลถูกแต่ไม่ได้แตะ path ที่ตั้งใจ [[test-must-hit-the-path]]) */
process.env.ZORT_STORENAME = "ทดสอบ";
process.env.ZORT_APIKEY = "ทดสอบ";
process.env.ZORT_APISECRET = "ทดสอบ";

const เดิม = globalThis.fetch;
const ปลอม = (payload, { status = 200, json = true } = {}) => {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => { if (!json) throw new Error("not json"); return payload; },
  });
};
const คืน = () => { globalThis.fetch = เดิม; };

const { zortProductFields } = await import("../../netlify/lib/zort-write.mjs");

test("ไม่ส่ง sku ⇒ ตีกลับ", async () => {
  assert.equal((await zortProductFields("")).ok, false);
});

test("เจอสินค้า ⇒ คืนชื่อช่อง+ชนิด และ **ไม่คืนค่า**", async () => {
  ปลอม({ list: [{ sku: "A1", name: "ชื่อลับ", sellprice: 5, producttype: 0,
    properties: [{ k: "สี" }], imagepath: null, tag: ["x"] }] });
  const r = await zortProductFields("A1");
  คืน();
  assert.equal(r.found, true);
  assert.equal(r.fields.producttype, "number");
  assert.equal(r.fields.properties, "array(1)");
  assert.equal(r.fields.imagepath, "null");
  assert.equal(r.fields.tag, "array(1)");
  /* 🔒 ค่าต้องไม่หลุดออกมาเลย — ตรวจจากข้อความ JSON ทั้งก้อน */
  const s = JSON.stringify(r);
  assert.ok(!s.includes("ชื่อลับ"), "ห้ามคืนค่าในช่อง name");
  assert.ok(!s.includes('"สี"'), "ห้ามคืนค่าข้างใน properties");
});

test("ไม่พบ sku ⇒ found:false พร้อมคำกำกับว่าไม่ได้แปลว่า ZORT ไม่มีช่อง", async () => {
  ปลอม({ list: [{ sku: "อื่น" }] });
  const r = await zortProductFields("A1");
  คืน();
  assert.equal(r.found, false);
  assert.ok(/ไม่ได้แปลว่า/.test(r.note));
  assert.ok(!("fields" in r), "ไม่พบแล้วห้ามส่ง fields ว่างออกไป (จะอ่านว่าไม่มีช่องเลย)");
});

test("HTTP ไม่ 2xx ⇒ unknown ไม่ใช่ found:false", async () => {
  ปลอม({}, { status: 500 });
  const r = await zortProductFields("A1");
  คืน();
  assert.equal(r.unknown, true);
  assert.equal(r.found, undefined);
});

test("ตอบไม่ใช่ JSON ⇒ unknown", async () => {
  ปลอม({}, { json: false });
  const r = await zortProductFields("A1");
  คืน();
  assert.equal(r.unknown, true);
});
