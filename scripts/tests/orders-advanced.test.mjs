// รัน: node --experimental-test-module-mocks --test scripts/tests/orders-advanced.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu2sy2fu — ตัวกรองค้นหาขั้นสูงของ list=orders / orderfacets
// 🔴 สิ่งที่เฝ้า: ทุกตัวกรองลง WHERE ชุดเดียว (ยอดขาย · แถว · ยอดหักคืน · แท็บสถานะ) · แท็บสถานะได้ตัวกรองใหม่ด้วย ·
//    ค้นสินค้าในบรรทัดใช้ EXISTS order_items · ช่วงวันส่งตัดใบที่ยังไม่ส่ง · สะท้อน advancedFilters
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let calls = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => { calls.push({ s: String(sql), params }); return []; },
} });
const { listOrders, listOrderFacets } = await import('../../netlify/lib/core-orders.mjs');
const ADV = { payStatus: 'Paid', cod: '1', product: '00313', shipChannel: 'flash', shipFrom: '2026-09-01', shipTo: '2026-09-10', amountMin: '100', amountMax: '5000', number: 'SO-2026', customer: 'สมชาย' };

test('ยอดขายรวม: ทุกตัวกรองลง WHERE พร้อมพารามิเตอร์ครบ', async () => {
  calls = [];
  const r = await listOrders({ from: '2026-09-01', to: '2026-09-14', ...ADV });
  const sale = calls.find((c) => /SELECT COUNT\(\*\) AS c, ROUND\(COALESCE\(SUM\(amount\),0\),2\) AS s\s+FROM orders WHERE/.test(c.s));
  assert.ok(sale);
  for (const re of [/pay_status = \?/, /is_cod = 1/, /EXISTS \(SELECT 1 FROM order_items oi WHERE oi\.order_id = orders\.id AND \(instr\(lower\(oi\.sku\)/, /instr\(lower\(ship_channel\)/, /COALESCE\(ship_date,''\) <> ''/, /ship_date >= \?/, /ship_date <= \?/, /amount >= \?/, /amount <= \?/, /instr\(lower\(number\)/, /instr\(lower\(customer\)/])
    assert.match(sale.s, re);
  for (const v of ['Paid', '00313', 'flash', '2026-09-01', '2026-09-10', 100, 5000, 'SO-2026', 'สมชาย']) assert.ok(sale.params.includes(v), `ต้องมีพารามิเตอร์ ${v}`);
  assert.deepEqual(r.advancedFilters, { ...ADV, amountMin: 100, amountMax: 5000 });
});

test('แท็บสถานะใช้ตัวกรองใหม่ด้วย (ยกเว้นสถานะ) · ยอดหักคืนฝังเงื่อนไขชุดเดียวกัน', async () => {
  calls = [];
  await listOrders({ from: '2026-09-01', to: '2026-09-14', status: 'Success', ...ADV });
  const tabs = calls.find((c) => /GROUP BY status ORDER BY orders DESC/.test(c.s));
  assert.ok(tabs); assert.match(tabs.s, /EXISTS \(SELECT 1 FROM order_items/); assert.match(tabs.s, /pay_status = \?/);
  // (?<![\w]) กัน pay_status = ? ถูกนับเป็นการกรองสถานะ (รุ่นแรกของเทสต์นี้แดงหลอกเพราะตรงนี้)
  assert.doesNotMatch(tabs.s, /(?<![\w])status = \?/, 'แท็บต้องไม่กรองสถานะเอง');
  const ret = calls.find((c) => /FROM return_orders_v2/.test(c.s) && /EXISTS \(SELECT 1 FROM orders WHERE/.test(c.s));
  assert.ok(ret); assert.match(ret.s, /oi\.order_id = orders\.id/);
});

test('ไม่ส่งตัวกรองใหม่ = เงื่อนไขเดิม · COD 0 = ไม่ใช่ COD · ค่าเพี้ยนไม่ถูกใช้', async () => {
  calls = [];
  const r = await listOrders({ from: '2026-09-01', to: '2026-09-14' });
  const sale = calls.find((c) => /FROM orders WHERE/.test(c.s) && /SUM\(amount\)/.test(c.s));
  assert.doesNotMatch(sale.s, /pay_status|is_cod|order_items|ship_date|amount >=/);
  assert.equal(Object.values(r.advancedFilters).every((v) => v === null), true);
  calls = [];
  const r2 = await listOrders({ from: '2026-09-01', to: '2026-09-14', cod: '0', shipFrom: '2026-13-01', amountMin: 'abc' });
  const s2 = calls.find((c) => /FROM orders WHERE/.test(c.s) && /SUM\(amount\)/.test(c.s));
  assert.match(s2.s, /COALESCE\(is_cod,0\) = 0/); assert.doesNotMatch(s2.s, /ship_date|amount >=/);
  assert.equal(r2.advancedFilters.shipFrom, null); assert.equal(r2.advancedFilters.amountMin, null);
});

test('orderfacets รับตัวกรองชุดเดียวกัน', async () => {
  calls = [];
  await listOrderFacets({ from: '2026-09-01', to: '2026-09-14', ...ADV });
  assert.ok(calls.filter((c) => /FROM orders WHERE/.test(c.s)).every((c) => /EXISTS \(SELECT 1 FROM order_items/.test(c.s) && /pay_status = \?/.test(c.s)));
});
