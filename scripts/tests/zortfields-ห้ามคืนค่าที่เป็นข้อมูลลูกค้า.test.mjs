// `?zortfields=1` — เส้นสำรวจชื่อช่องของ ZORT · **ห้ามคืนค่าที่เป็นข้อมูลลูกค้า**
//
// ที่มา (ของจริง 4 ก.ย. 2569): ตัวกรองรอบแรกเขียน regex /ship/ ไว้เพื่อจับ shippingstatus
//   แต่มันไปจับ shippingname · shippingaddress · shippingphone ด้วย
//   ⇒ ชื่อ/ที่อยู่/เบอร์ลูกค้าหลุดออกมาทาง API โดยไม่มีอะไรฟ้อง
// 🔑 เส้นนี้มีสองชุดที่ทำงานคนละแบบ และ **ความผิดพลาดราคาไม่เท่ากัน**:
//   · SAFE        → คืน **ตัวอย่างค่า** (statusFields) ⇒ ใส่ช่องข้อมูลลูกค้าลงไป = ข้อมูลหลุด
//   · HEADER_PROBE → คืน **จำนวนใบที่มีค่า ไม่คืนค่า** ⇒ ใส่ช่องจังหวัดได้ ปลอดภัย
// ⇒ ด่านนี้เฝ้าเส้นแบ่งนั้น ไม่ใช่เฝ้า "มีคำว่า province อยู่ในไฟล์ไหม"
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("netlify/functions/core.mjs", "utf8");
const ชุด = (ชื่อ) => {
  const i = src.indexOf(`const ${ชื่อ} = new Set([`);
  assert.ok(i > 0, `ไม่เจอชุด ${ชื่อ}`);
  const ก้อน = src.slice(i, src.indexOf("]);", i));
  return [...ก้อน.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};

/* รายชื่อตรงตัว — **ห้ามใช้ regex จับชื่อช่อง** ด้วยเหตุผลเดียวกับที่ทำให้ของหลุดรอบนั้น
   (no-substring-classification: ชื่อที่คนตั้งเองมีคำของประเภทอื่นปนเสมอ) */
const ห้ามคืนค่า = [
  "customername", "customeraddress", "customerstreetAddress", "customerphone", "customeremail",
  "customeridnumber", "customerpostcode", "customerprovince", "customerdistrict", "customersubdistrict",
  "shippingname", "shippingaddress", "shippingstreetAddress", "shippingphone", "shippingpostcode",
  "shippingprovince", "shippingdistrict", "shippingsubdistrict",
  "integrationCustomer", "integrationCustomerId",
];

test("SAFE (คืนตัวอย่างค่า) ต้องไม่มีช่องข้อมูลลูกค้าสักช่อง", () => {
  const safe = ชุด("SAFE");
  assert.ok(safe.length > 0);
  for (const k of ห้ามคืนค่า) {
    assert.ok(!safe.includes(k), `🔴 ${k} อยู่ใน SAFE — เส้นนี้จะคืนค่าจริงของลูกค้าออกไป`);
  }
});

test("HEADER_PROBE คืนแค่จำนวน ⇒ ช่องจังหวัด/ชื่อมาร์เก็ตเพลสอยู่ได้", () => {
  const probe = ชุด("HEADER_PROBE");
  for (const k of ["shippingprovince", "customerprovince", "integrationCustomer"]) {
    assert.ok(probe.includes(k), `${k} ต้องอยู่ใน HEADER_PROBE เพื่อวัดว่า ZORT ส่งมากี่ใบ`);
  }
});

test("ตัวกรองต้องเทียบชื่อตรงตัว ห้ามใช้ regex จับชื่อช่อง", () => {
  /* 🔑 ข้อนี้คือเหตุของการหลุดรอบ 4 ก.ย. 2569 โดยตรง
     ถ้าใครกลับไปใช้ .test(k) หรือ /ship/ กรองชื่อช่อง ⇒ แดงทันที */
  const i = src.indexOf('if (url.searchParams.get("zortfields"))');
  const จบ = src.indexOf('if (url.searchParams.get("channelcompare"))', i);
  const ก้อน = src.slice(i, จบ);
  assert.ok(ก้อน.includes("SAFE.has(k)"), "ต้องกรองด้วย Set.has ไม่ใช่ regex");
  assert.ok(ก้อน.includes("HEADER_PROBE.has(k)"), "ต้องกรองด้วย Set.has ไม่ใช่ regex");
  const ตัวกรองมั่ว = ก้อน.match(/\/[a-z|]*ship[a-z|]*\/[a-z]*\.test\(/i);
  assert.equal(ตัวกรองมั่ว, null, `🔴 เจอ regex จับชื่อช่อง: ${ตัวกรองมั่ว?.[0]}`);
});
