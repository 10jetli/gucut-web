// รัน: node --test scripts/tests/carrier-aliases-real-names.test.mjs
// 18 ก.ย. 2569 · gucut2 — ชื่อขนส่งดิบที่ **มีอยู่จริงในกระจก** ต้องเข้ากลุ่มให้ถูก
//
// 🔴 เหตุ: ไล่นับให้ CEO แล้วเจอว่า "ไปรษณีย์ไทย EMS" 780 ใบ หลุดกลุ่ม (ungrouped)
//    ⇒ คนกรองด้วยกลุ่ม "ไปรษณีย์ไทย" ไม่เห็น 780 ใบนั้น และไม่มีอะไรฟ้อง
// ⚠️ ชื่อในไฟล์นี้ลอกมาจากผลนับจริงของท่อ (carrierGroups) ไม่ใช่ชื่อสมมติ
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carrierOf, groupCarriers } from '../../netlify/lib/carriers.mjs';

// ชื่อดิบ + จำนวนที่วัดได้จริง 18 ก.ย. 2569
const จริง = [
  ['ไปรษณีย์ไทย EMS', 780, 'ไปรษณีย์ไทย'],
  ['ไปรษณีย์ไทย ThailandPost', 1, 'ไปรษณีย์ไทย'],
  ['Flash express (เรียกเก็บเงินปลายทาง)', 19, 'Flash Express'],
  ['Flash Express (ชำระทั้งหมดแล้ว)', 4, 'Flash Express'],
  ['Flash express (COD)', 2, 'Flash Express'],
  ['Flash (เก็บเงินปลายทาง COD)', 1, 'Flash Express'],
  ['J&Texpress', 1, 'J&T Express'],
];

test('ชื่อดิบที่มีจริงในกระจก เข้ากลุ่มถูกทุกชื่อ', () => {
  for (const [raw, , want] of จริง) assert.equal(carrierOf(raw), want, `ชื่อ "${raw}" ต้องเข้ากลุ่ม ${want}`);
});

test('ชื่อที่ไม่ใช่ขนส่ง ต้องไม่ถูกเดาเข้ากลุ่ม', () => {
  for (const raw of ['ค่าจัดส่ง', 'Order Arrangement On-hold (พักการดำเนินการชั่วคราว)', 'ลูกค้ารับเอง'])
    assert.equal(carrierOf(raw), null, `"${raw}" ไม่ใช่ชื่อขนส่ง ⇒ ต้องปล่อยเป็น ungrouped`);
});

test('นับรวมแล้ว 780 ใบของ EMS ต้องไปอยู่ในกลุ่มไปรษณีย์ไทย ไม่ใช่ ungrouped', () => {
  const rows = จริง.map(([channel, c]) => ({ channel, c })).concat([{ channel: 'ไปรษณีย์ไทย', c: 449 }]);
  const g = groupCarriers(rows);
  const thai = g.groups.find((x) => x.carrier === 'ไปรษณีย์ไทย');
  assert.equal(thai.c, 780 + 1 + 449, 'EMS ต้องรวมเข้ากลุ่มเดียวกับไปรษณีย์ไทย');
  assert.equal(g.ungrouped, 0, 'ชื่อในชุดนี้จัดกลุ่มได้ครบแล้ว');
});
