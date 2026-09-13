// รัน: node --experimental-test-module-mocks --test scripts/tests/ship-report.test.mjs
// ทดสอบตัวจริง buildShipReport — แยกอายุใบ · รวมเป็นรหัส · ไม่รู้ ≠ ศูนย์
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('../../netlify/lib/coredb.mjs', { namedExports: { coreReady: () => true, coreQuery: async () => [] } });
const { buildShipReport, FRESH_DAYS, OLD_DAYS } = await import('../../netlify/lib/ship-report.mjs');

const today = '2026-09-13';
const orders = [
  { id: 'fresh', number: 'F', channel: 'Shopee', day: '2026-09-12', status: 'Pending' },    // 1 วัน ⇒ ใหม่
  { id: 's5', number: 'S5', channel: 'Lazada', day: '2026-09-08', status: 'Pending' },      // 5 วัน ⇒ ค้าง
  { id: 's40', number: 'S40', channel: 'Lazada', day: '2026-08-04', status: 'Waiting' },    // 40 วัน ⇒ ค้าง
  { id: 'old', number: 'O', channel: 'TIKTOK', day: '2023-07-06', status: 'Waiting' },      // 1,165 วัน ⇒ เก่า
  { id: 'noitems', number: 'N', channel: 'Shopify', day: '2026-09-01', status: 'Pending' }, // 12 วัน ไม่มีรายการ
];
const items = [
  { order_id: 'fresh', sku: 'A', name: 'ของใหม่', qty: 1 },
  { order_id: 's5', sku: '00313', name: 'หัวเทียน', qty: 2 },
  { order_id: 's40', sku: '00313', name: 'หัวเทียน', qty: 1 },
  { order_id: 's40', sku: 'GHOST', name: 'รหัสที่คลังไม่รู้จัก', qty: 1 },
  { order_id: 'old', sku: 'ANCIENT', name: 'ของใบเก่า', qty: 1 },
];
const snap = new Map([['00313', 700], ['A', 5], ['ANCIENT', 3]]);

test('แยกอายุ: ใหม่ / ค้าง / เก่า และนับเฉพาะใบค้างเป็นรหัส', () => {
  const r = buildShipReport({ orders, items, snap, today });
  assert.deepEqual(r.counts, { fresh: 1, stuck: 3, old: 1, skus: 2, stuckNoItems: 1 });
  assert.deepEqual(r.skus.map((s) => s.sku), ['00313', 'GHOST'].sort((a, b) => (a === '00313' ? -1 : 1)));
  const p = r.skus.find((s) => s.sku === '00313');
  assert.deepEqual([p.orders, p.qty, p.oldestDays, p.systemQty], [2, 3, 40, 700]);
  assert.equal(r.skus.find((s) => s.sku === 'GHOST').systemQty, null);
  assert.ok(!r.skus.some((s) => s.sku === 'ANCIENT' || s.sku === 'A'), 'ใบใหม่/ใบเก่าต้องไม่โผล่ในรายการนับ');
  assert.match(r.text, /ระบบไม่รู้จัก/);
  assert.match(r.text, /ไม่ต้องนับของ/);
});

test('ตัวควบคุม: ถ้าไม่แยกอายุ (ทุกใบนับเป็นค้าง) ผลต้องเปลี่ยน', () => {
  const allStuck = orders.map((o) => ({ ...o, day: '2026-09-01' }));
  const r = buildShipReport({ orders: allStuck, items, snap, today });
  assert.equal(r.counts.old, 0);
  assert.ok(r.skus.some((s) => s.sku === 'ANCIENT'));
  assert.ok(FRESH_DAYS < OLD_DAYS);
});

test('ไม่มีใบค้าง ต้องพูดออกมา ไม่เงียบ', () => {
  const r = buildShipReport({ orders: [], items: [], snap, today });
  assert.match(r.text, /ไม่มีรหัสที่ต้องนับวันนี้/);
});
