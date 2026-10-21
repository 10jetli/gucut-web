// รัน: node --experimental-test-module-mocks --test scripts/tests/returnorder-line-amount.test.mjs
//
// 🔴 **สิ่งที่เทสนี้เฝ้า: ยอดต่อบรรทัดของใบคืน ต้องมีช่องแบนและต้องไม่ถูกคิดแทน**
//    ของเดิม `?returnorder=` ให้บรรทัดแค่ sku/name/qty/unit · ยอดซ่อนใต้ `ทุกช่องในบรรทัด`
//    และเส้นพี่น้อง `?order=` ใช้คีย์ `items` ไม่ใช่ `lines`
//    ⇒ ฝั่งจอเขียนตัวยิงอ่าน `items[].amount` **ได้ 0 บรรทัด จึงสรุปว่า "ไม่มีใบคืน"**
//       ซึ่งเป็น **ลบลวง** (เจอจริง 21 ต.ค. 2569 23:4x) ⇒ เกือบทำให้ปิดเคสผิด
//    🔑 สัญญาที่ให้ปลายทางเดาชื่อคีย์ จะถูกเดาผิด **แล้วรายงานว่า "ไม่มีของ"**
//
// ⚠️ ข้อที่สองสำคัญกว่าข้อแรก: **ไม่มี `totalprice` ⇒ ต้องเป็น `null` ห้ามคิดแทน**
//    ยอดคืนที่คิดแทนแล้วผิด = ยอดขายทั้งร้านผิด (เส้นขายมีตัวซ่อมแบบนั้นโดยตั้งใจ เส้นคืนไม่มี)
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.ZORT_STORENAME = 's';
process.env.ZORT_APIKEY = 'k';
process.env.ZORT_APISECRET = 'x';

let ก้อนจากZORT = null;
globalThis.fetch = async () => ({
  ok: true, status: 200,
  json: async () => ก้อนจากZORT,
  text: async () => JSON.stringify(ก้อนจากZORT),
});

const { getReturnOrderDetail } = await import('../../netlify/lib/core-purchases.mjs');

function ตั้งใบ(บรรทัด) {
  ก้อนจากZORT = {
    resCode: '200', resDesc: 'success',
    id: 311781073, number: 'CN-TEST-1', status: 'Success',
    list: บรรทัด,
  };
}

test('① มีช่อง amount แบน และค่ามาจาก totalprice ของ ZORT', async () => {
  ตั้งใบ([{ sku: '00370', name: 'โซ่ทดสอบ', number: 22.5, unittext: 'PCS',
            pricepernumber: 16, totalprice: 370 }]);
  const d = await getReturnOrderDetail('311781073');
  assert.ok(Array.isArray(d.lines), 'ต้องมีอาเรย์ lines');
  assert.equal(d.lines.length, 1);
  // 🔑 ช่องแบน — ปลายทางไม่ต้องเดาคีย์ซ้อน
  assert.equal(d.lines[0].amount, 370, 'amount ต้องเท่า totalprice');
  assert.equal(d.lines[0].sku, '00370');
  assert.equal(d.lines[0].qty, 22.5);
  // ของเดิมต้องยังอยู่ (เพิ่มอย่างเดียว ไม่ทับ)
  assert.equal(d.lines[0]['ทุกช่องในบรรทัด'].totalprice, 370);
});

test('② ไม่มี totalprice ⇒ amount = null **ห้ามคิดแทนด้วย ราคา × จำนวน**', async () => {
  // ของปลูกที่อันตรายที่สุด: มีราคาต่อหน่วยกับจำนวนครบ ⇒ คิดแทนได้ง่าย แต่ห้ามคิด
  ตั้งใบ([{ sku: '00894', name: 'โซ่ทดสอบสอง', number: 38, unittext: 'PCS',
            pricepernumber: 17.1 }]);
  const d = await getReturnOrderDetail('311781073');
  assert.equal(d.lines[0].amount, null,
    'ZORT ไม่ส่ง totalprice ⇒ ต้องเป็น null (ไม่ใช่ 649.8 ที่คิดแทน)');
  assert.notEqual(d.lines[0].amount, 38 * 17.1);
});

test('③ totalprice = 0 ต้องเป็น 0 ไม่ใช่ null (ของแถม/คืนราคาศูนย์มีจริง)', async () => {
  // 🔑 สามสถานะ: 0 = ZORT บอกว่าศูนย์ · null = ZORT ไม่ส่งช่องนี้ · เลข = ยอดจริง
  ตั้งใบ([{ sku: '03385', name: 'โซ่ทดสอบสาม', number: 1, unittext: 'PCS', totalprice: 0 }]);
  const d = await getReturnOrderDetail('311781073');
  assert.equal(d.lines[0].amount, 0, '0 ของ ZORT ต้องมาถึงปลายทางเป็น 0');
  assert.notEqual(d.lines[0].amount, null);
});

test('④ ตัวควบคุมลบ: ใบที่ไม่มีบรรทัดเลย ⇒ lines เป็น [] ไม่ใช่ล้ม', async () => {
  ตั้งใบ([]);
  const d = await getReturnOrderDetail('311781073');
  assert.ok(Array.isArray(d.lines), 'ใบไม่มีของ ⇒ ต้องเป็นอาเรย์ว่าง');
  assert.equal(d.lines.length, 0);
});
