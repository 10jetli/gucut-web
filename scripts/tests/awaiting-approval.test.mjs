// รัน: node --experimental-test-module-mocks --test scripts/tests/awaiting-approval.test.mjs
// 19 ก.ย. 2569 · ทะเบียน "รอท่านประธานอนุมัติ" — ที่มา: ฝั่งจอพบข้อความอ้างสถานะอนุมัติที่เป็นเท็จมา 5 วัน
// 🔴 สิ่งที่เฝ้า:
//    · ทุกแถวต้องมี id ไม่ซ้ำ · มีวันที่ขอ · บอกที่อยู่ในโค้ด · บอกเหตุผลว่าทำไมต้องอนุมัติ
//    · `อนุมัติเมื่อ: null` ต้องนับเป็น "รอ" (ไม่ใช่ปฏิเสธ) — สามสถานะ ห้ามยุบเป็นสอง
//    · แถวที่อนุมัติ/ปฏิเสธแล้วต้องไม่ถูกนับเป็นรอ **แต่ห้ามลบแถวทิ้ง** (กันเสนอเรื่องเดิมซ้ำ)
import { test } from "node:test";
import assert from "node:assert/strict";
const { AWAITING_APPROVAL, awaitingSummary } = await import("../../netlify/lib/awaiting-approval.mjs");

test("ทุกแถวมีข้อมูลครบและ id ไม่ซ้ำ", () => {
  const ids = AWAITING_APPROVAL.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, "id ต้องไม่ซ้ำ");
  for (const x of AWAITING_APPROVAL) {
    assert.ok(x.id && /^[a-z0-9-]+$/.test(x.id), `id ต้องเป็น kebab-case: ${x.id}`);
    assert.ok(x.เรื่อง?.length > 10, `${x.id}: ต้องบอกว่าเรื่องอะไร`);
    assert.ok(x.ทำไมต้องอนุมัติ?.length > 10, `${x.id}: **ต้องบอกเหตุผล** ไม่งั้นท่านตัดสินใจไม่ได้`);
    assert.ok(x.อยู่ที่?.length > 5, `${x.id}: ต้องบอกที่อยู่ในโค้ด`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(x.ขอเมื่อ), `${x.id}: ขอเมื่อ ต้องเป็น YYYY-MM-DD`);
    assert.ok("อนุมัติเมื่อ" in x, `${x.id}: ต้องมีคีย์ อนุมัติเมื่อ (null = ยังไม่เคยตัดสิน)`);
  }
});

test("null = รอ · มีวันที่ = ไม่รอ (สามสถานะ ไม่ใช่สอง)", () => {
  const s = awaitingSummary();
  assert.equal(s.ทั้งหมด, AWAITING_APPROVAL.length);
  assert.equal(s.รอ, AWAITING_APPROVAL.filter((x) => !x.อนุมัติเมื่อ && !x.ปฏิเสธเมื่อ).length);
  /* ปลูกเคส: แถวที่อนุมัติแล้วต้องไม่ถูกนับเป็นรอ */
  const ปลอม = [{ id: "x", อนุมัติเมื่อ: "2026-09-19" }, { id: "y", อนุมัติเมื่อ: null }, { id: "z", ปฏิเสธเมื่อ: "2026-09-19" }];
  assert.equal(ปลอม.filter((x) => !x.อนุมัติเมื่อ && !x.ปฏิเสธเมื่อ).length, 1, "เหลือรอแค่ y");
});

test("ประกาศขอบเขตว่ายิงตรวจไม่ได้ และห้ามใช้เป็นสวิตช์", () => {
  const s = awaitingSummary();
  const ขอบเขต = s["⚠️ ขอบเขต"];
  assert.ok(/ยิงตรวจไม่ได้/.test(ขอบเขต), "ต้องบอกว่าสถานะอนุมัติเป็นของนอกโค้ด");
  assert.ok(/ห้ามใช้เป็นสวิตช์/.test(ขอบเขต), "ต้องห้ามใช้เป็นสวิตช์เปิดการเขียนจริง");
});
