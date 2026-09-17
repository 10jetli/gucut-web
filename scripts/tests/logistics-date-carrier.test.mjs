// รัน: node --experimental-test-module-mocks --test scripts/tests/logistics-date-carrier.test.mjs
// 17 ก.ย. 2569 · gucut2 — list=logistics เดิมเมิน from/to/carrier เงียบ
// 🔴 สิ่งที่เฝ้า: ① วันที่ใช้ฐานเดียวกับคอลัมน์วันที่ของแถว และตัด 10 ตัว (กันวันสุดท้ายหลุด)
//    ② ขนส่งชื่อกลุ่มต้องกรองชื่อสะกดทุกแบบในกลุ่ม ③ ขนส่งที่ไม่รู้จัก = ไม่กรอง + บอกใน ignored ไม่ใช่ 0 แถวเงียบ
//    ④ ตัวเลขแท็บกับแถวใช้ WHERE ชุดเดียวกัน (ตัวกรองวัน/ขนส่งต้องอยู่ในทั้งคู่)
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { badParamError } from '../../netlify/lib/param-guard.mjs';

let calls = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => {
    const s = String(sql); calls.push({ s, params });
    if (/GROUP BY COALESCE\(NULLIF\(ship_channel/.test(s) && !/ORDER BY c DESC/.test(s))
      return [{ channel: 'Flash Express', c: 5 }, { channel: 'FLASH', c: 2 }, { channel: 'Kerry', c: 1 }];
    return [];
  },
} });
const { listLogistics } = await import('../../netlify/lib/core-orders.mjs');

test('ช่วงวันที่ — ฐานเดียวกับคอลัมน์วันที่ · ตัด 10 ตัว · สะท้อนค่าที่ใช้จริง', async () => {
  calls = [];
  const r = await listLogistics({ from: '2026-09-01', to: '2026-09-14' });
  const rowsQ = calls.find((c) => /FROM orders o WHERE/.test(c.s));
  assert.match(rowsQ.s, /substr\(COALESCE\(NULLIF\(ship_date,''\), order_date\),1,10\) >= \?/);
  assert.match(rowsQ.s, /substr\(COALESCE\(NULLIF\(ship_date,''\), order_date\),1,10\) <= \?/);
  assert.deepEqual(rowsQ.params, ['2026-09-01', '2026-09-14']);
  const countQ = calls.find((c) => /SUM\(CASE WHEN COALESCE\(tracking_no/.test(c.s));
  assert.deepEqual(countQ.params, ['2026-09-01', '2026-09-14'], 'ตัวเลขแท็บต้องกรองวันด้วย');
  assert.equal(r.applied.from, '2026-09-01');
  assert.equal(r.applied.to, '2026-09-14');
  const bad = await listLogistics({ from: '2026-13-40' });
  assert.equal(bad.applied.from, null);
});

test('ขนส่งชื่อกลุ่ม — กรองชื่อสะกดทุกแบบในกลุ่ม', async () => {
  calls = [];
  const r = await listLogistics({ carrier: 'Flash Express' });
  const rowsQ = calls.find((c) => /FROM orders o WHERE/.test(c.s));
  assert.match(rowsQ.s, /IN \(\?,\?\)/);
  assert.deepEqual([...rowsQ.params].sort(), ['FLASH', 'Flash Express']);
  assert.equal(r.applied.carrier, 'Flash Express');
  assert.equal(r.ignored, undefined);
});

test('ขนส่งที่ไม่รู้จัก — ไม่กรอง และบอกตรง ๆ', async () => {
  calls = [];
  const r = await listLogistics({ carrier: 'ไม่มีเจ้านี้' });
  const rowsQ = calls.find((c) => /FROM orders o WHERE/.test(c.s));
  assert.doesNotMatch(rowsQ.s, / IN \(/);
  assert.equal(r.applied.carrier, null);
  assert.equal(r.ignored.carrier, 'ไม่มีเจ้านี้');
  assert.match(r.note, /ไม่ได้กรองขนส่ง/);
});

test('ด่านพารามิเตอร์ — list=logistics วันเพี้ยน = 400', () => {
  assert.match(badParamError(new URLSearchParams('list=logistics&from=2026-13-40')), /from/);
  assert.equal(badParamError(new URLSearchParams('list=logistics&from=2026-09-01&to=2026-09-14')), null);
});

test('only ที่ไม่รู้จัก — คำเตือนไม่ถูก note ปกติเขียนทับ', async () => {
  const r = await listLogistics({ only: 'อะไรไม่รู้' });
  assert.equal(r.ignored.only, 'อะไรไม่รู้');
  assert.match(r.note, /ไม่รู้จักตัวกรอง/);
});
