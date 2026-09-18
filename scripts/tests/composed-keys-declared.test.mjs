// รัน: node --experimental-test-module-mocks --test scripts/tests/composed-keys-declared.test.mjs
// 19 ก.ย. 2569 · ที่มา: ด่านคีย์ท่อฝั่งจอฟ้องจอที่อ่านคีย์ที่ท่อส่งมาจริง
//   เพราะท่อประกอบชื่อคีย์ตอนรัน ⇒ grep ในซอร์สไม่เจอชื่อเต็มตลอดกาล
// 🔴 สิ่งที่เฝ้า: **รายชื่อที่ประกาศ ต้องตรงกับชื่อที่ฟังก์ชันคืนจริง**
//    รายชื่อที่ไม่ตรง = ปลายทางยกเว้นชื่อผิด แล้วด่านกลับมาฟ้องของที่ถูกอีก
import { test } from "node:test";
import assert from "node:assert/strict";
const m = await import("../../netlify/lib/core-freshness.mjs");

test("ทุก prefix ที่ประกาศ คืนคีย์ตรงกับที่ประกาศไว้", async () => {
  for (const p of m.PREFIXES_รอบที่คาดหวัง) {
    /* งานที่ไม่มีจริง ⇒ ฟังก์ชันคืนชุด "ยังไม่รู้รอบ" ซึ่งก็ต้องใช้ชื่อตาม prefix เหมือนกัน */
    const r = await m.รอบที่คาดหวัง("งานที่ไม่มีจริง-zzz", p);
    for (const k of Object.keys(r))
      assert.ok(m.คีย์ที่ประกอบขึ้น.includes(k), `คีย์ ${k} ไม่อยู่ในรายชื่อที่ประกาศ (prefix=${p})`);
    assert.ok(Object.keys(r).some((k) => k.startsWith(p)), `prefix ${p} ต้องปรากฏในชื่อคีย์`);
  }
});

test("รายชื่อที่ประกาศไม่มีชื่อเกินที่ใช้จริง (กันรายชื่อบวมแล้วยกเว้นเกิน)", async () => {
  const ใช้จริง = new Set();
  for (const p of m.PREFIXES_รอบที่คาดหวัง) {
    for (const k of Object.keys(await m.รอบที่คาดหวัง("bundle-recipe-sync", p))) ใช้จริง.add(k);
    for (const k of Object.keys(await m.รอบที่คาดหวัง("งานที่ไม่มีจริง-zzz", p))) ใช้จริง.add(k);
  }
  for (const k of m.คีย์ที่ประกอบขึ้น)
    assert.ok(ใช้จริง.has(k), `ประกาศ ${k} ไว้แต่ไม่มีทางไหนคืนชื่อนี้ ⇒ ปลายทางจะยกเว้นเกินจริง`);
});
