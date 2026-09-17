// รัน: node --experimental-test-module-mocks --test scripts/tests/manual-push-ledger.test.mjs
// 17 ก.ย. 2569 · gucut2 — ยิงมือต้องลงสมุด push_state (ท่านประธานสั่ง)
// 🔴 สิ่งที่เฝ้า: จดเฉพาะ pushed/rejected (not_sent ไม่นับข้อผิดพลาด) · ยิงใหม่ล้าง verified_* · ไม่แตะ planned/skip
//    ตัวแปรต่อคำสั่ง ≤ 100 (D1) · เส้น HTTP จดหลังยิง และจดพลาดไม่ทำให้ผลยิงหาย · โหมดตรวจไม่จด
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

const คำสั่ง = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => { คำสั่ง.push({ sql: String(sql), params }); return []; },
} });
const { จดยิงมือลงสมุด } = await import('../../netlify/lib/stock-push-sweep.mjs');

test('จดเฉพาะที่ยิงออกจริง · rejected มี last_error · not_sent ไม่จด', async () => {
  คำสั่ง.length = 0;
  const r = await จดยิงมือลงสมุด('tiktok', [
    { sku: 'A', to: 5, result: 'pushed' },
    { sku: 'B', to: 7, result: 'rejected', why: '12052700: locked' },
    { sku: 'C', result: 'not_sent', why: 'ทิศลง' },
  ], '2026-09-17T15:40:00.000Z');
  assert.equal(r.เขียนแล้ว, 2);
  const ins = คำสั่ง.filter((c) => /INSERT INTO push_state/.test(c.sql));
  assert.equal(ins.length, 1);
  assert.deepEqual(ins[0].params, ['A', 'tiktok', 5, '2026-09-17T15:40:00.000Z', 'pushed', null, null,
    'B', 'tiktok', 7, '2026-09-17T15:40:00.000Z', 'rejected', '12052700: locked', '2026-09-17T15:40:00.000Z']);
  assert.match(ins[0].sql, /verified_at\s*= NULL/);
  assert.match(ins[0].sql, /verified_qty\s*= NULL/);
  assert.doesNotMatch(ins[0].sql, /planned_|skip_/, 'ห้ามแตะช่องของตัวกวาด');
});

test('ตัวแปรต่อคำสั่งไม่เกิน 100 (D1)', async () => {
  คำสั่ง.length = 0;
  const rows = Array.from({ length: 30 }, (_, i) => ({ sku: `S${i}`, to: 1, result: 'pushed' }));
  const r = await จดยิงมือลงสมุด('shopee', rows);
  assert.equal(r.เขียนแล้ว, 30);
  for (const c of คำสั่ง.filter((x) => /INSERT INTO push_state/.test(x.sql))) assert.ok(c.params.length <= 100, `${c.params.length} ตัวแปร`);
});

test('เส้น HTTP: จดหลังยิง · ไม่จดโหมดตรวจ/error · จดพลาดยังคืนผลยิง', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const i = src.indexOf('จดยิงมือลงสมุด');
  assert.ok(i > src.indexOf('url.searchParams.get("stockpushlive")'));
  const ช่วง = src.slice(src.lastIndexOf('if (r && ', i), i + 400);
  assert.match(ช่วง, /!r\.error && !r\.dryCheck && Array\.isArray\(r\.results\)/);
  assert.match(ช่วง, /catch \(e\)[\s\S]*ledgerError/);
});

const { เติมสมุดจากประวัติ } = await import('../../netlify/lib/stock-push-sweep.mjs');
const ประวัติ = async () => [
  { at: '2026-09-17T15:32:39.775Z', platform: 'tiktok', rows: [{ sku: 'T2', to: 9, result: 'pushed' }, { sku: 'T1', to: 6, result: 'pushed' }] },
  { at: '2026-09-17T15:30:00.000Z', platform: 'lazada', rows: [{ sku: 'L1', to: 3, result: 'pushed' }] },
  { at: '2026-09-17T15:13:52.557Z', platform: 'shopee', rows: [{ sku: 'S1', to: 4, result: 'pushed' }, { sku: 'SX', result: 'not_sent' }] },
  { at: '2026-09-17T15:13:55.612Z', platform: 'tiktok', rows: [{ sku: 'T1', to: 5, result: 'pushed' }] },
];

test('เติมย้อนหลัง: ค่าเริ่มต้นดูอย่างเดียว ไม่เขียน · ไม่เอา Lazada · ไม่นับ not_sent', async () => {
  คำสั่ง.length = 0;
  const r = await เติมสมุดจากประวัติ({}, ประวัติ);
  assert.equal(r.รวม, 4);
  assert.ok(!r.รอบ.some((x) => x.platform === 'lazada'));
  assert.equal(คำสั่ง.filter((c) => /INSERT INTO push_state/.test(c.sql)).length, 0);
});

test('เติมย้อนหลัง apply: ใช้เวลาของรอบเดิม · เรียงเก่า→ใหม่ ให้รอบล่าสุดชนะ', async () => {
  คำสั่ง.length = 0;
  const r = await เติมสมุดจากประวัติ({ apply: true }, ประวัติ);
  assert.equal(r.เขียนแล้ว, 4);
  const ins = คำสั่ง.filter((c) => /INSERT INTO push_state/.test(c.sql)).map((c) => c.params);
  assert.equal(ins.length, 3);
  assert.deepEqual(ins[0].slice(0, 5), ['S1', 'shopee', 4, '2026-09-17T15:13:52.557Z', 'pushed']);
  assert.deepEqual(ins[1].slice(0, 5), ['T1', 'tiktok', 5, '2026-09-17T15:13:55.612Z', 'pushed']);
  assert.equal(ins[2][3], '2026-09-17T15:32:39.775Z');
});
