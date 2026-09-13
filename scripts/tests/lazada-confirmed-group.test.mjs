// รัน: node --test scripts/tests/lazada-confirmed-group.test.mjs
// กันถอยกลับ: Lazada `confirmed` ต้องไม่ถูกนับเป็น "รอจัดส่ง" อีก
// หลักฐาน (13 ก.ย. 2569): confirmed ทั้งปี 2,853 ใบ มีเลขพัสดุ+วันส่ง+ZORT Success ครบ 2,853 — ยังไม่ส่ง 0 ใบ
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readStatus, groupsFromCounts } from '../../netlify/lib/order-status.mjs';

test('Lazada confirmed อยู่กองสำเร็จ และติดธงว่าอนุมานจากข้อมูล', () => {
  const s = readStatus('confirmed');
  assert.equal(s.platform, 'lazada');
  assert.equal(s.group, 'done');
  assert.equal(s.unverified, true);
});

test('Shopee READY_TO_SHIP กับ Lazada ready_to_ship ยังเป็นรอจัดส่งเหมือนเดิม', () => {
  assert.equal(readStatus('READY_TO_SHIP').group, 'waiting_ship');
  assert.equal(readStatus('ready_to_ship').group, 'waiting_ship');
});

test('รูปข้อมูลจริง: กองรอจัดส่งต้องไม่ใหญ่กว่ากองสำเร็จเพราะ confirmed', () => {
  const g = Object.fromEntries(
    groupsFromCounts([
      { st: 'confirmed', c: 2853 },
      { st: 'delivered', c: 176 },
      { st: 'ready_to_ship', c: 4 },
      { st: 'READY_TO_SHIP', c: 2 },
      { st: 'COMPLETED', c: 1924 },
    ]).map((x) => [x.group, x.count]),
  );
  assert.equal(g.waiting_ship, 6);
  assert.equal(g.done, 2853 + 176 + 1924);
});
