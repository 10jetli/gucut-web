// รัน: node --experimental-test-module-mocks --test scripts/tests/orders-tag-creator-warehouse.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu2tzeb1 — กระจกออเดอร์เก็บ Tag · ผู้สร้าง · คลัง (ZORT ส่งมาใน GetOrders: tag 65/640 · createusername 41 · warehousecode 640)
// 🔴 สิ่งที่เฝ้า: ① เขียนลง INSERT + ON CONFLICT ② อยู่ในตัวเทียบ same() ไม่งั้นใบนิ่งไม่เคยได้ค่า
//    ③ tag รับได้ทั้งข้อความและรายการ ④ list=orders / orderfacets รับตัวกรองทั้งสองเส้น
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

const sqls = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => { sqls.push({ s: String(sql), params }); return []; },
} });
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({ get: async () => null, setJSON: async () => {} }) } });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';
delete process.env.ZORT_STORENAME_2;
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ list: [{
  number: 'SO-TAG-1', status: 'Success', amount: 100, saleschannel: 'ทดสอบ', customername: 'ลูกค้า',
  orderdateString: '14/09/2026', discountamount: 0, shippingamount: 0,
  tag: ['VIP', ' ส่งด่วน ', { x: 1 }], createusername: 'แอดมินหน้าร้าน', warehousecode: 'W0001',
  list: [{ sku: 'A', name: 'ของ A', number: 1, pricepernumber: 100, totalprice: 100 }],
}] }) });

const { syncOrders, tagText } = await import('../../netlify/lib/core-sync.mjs');
const { listOrders, listOrderFacets } = await import('../../netlify/lib/core-orders.mjs');

test('tagText — ข้อความ · ตัวเลข · รายการ · ของแปลกทิ้ง', () => {
  assert.equal(tagText(' VIP '), 'VIP');
  assert.equal(tagText(['VIP', ' ส่งด่วน ', { x: 1 }, '', null]), 'VIP, ส่งด่วน');
  assert.equal(tagText(null), '');
  assert.equal(tagText({ a: 1 }), '');
  assert.equal(tagText(7), '7');
});

test('ซิงก์เขียน tag · create_user · warehouse_code ทั้งแถวใหม่และตอนชน', async () => {
  const r = await syncOrders(1, { from: '2026-09-14', to: '2026-09-14' });
  assert.equal(r.stores.z1.written, 1);
  const ins = sqls.find((c) => /INSERT INTO orders/.test(c.s));
  assert.ok(ins);
  assert.match(ins.s, /bill_discount,ship_amount,tag,create_user,warehouse_code\)/);
  assert.match(ins.s, /'VIP, ส่งด่วน','แอดมินหน้าร้าน','W0001'\)/);
  for (const c of ['tag', 'create_user', 'warehouse_code']) assert.match(ins.s, new RegExp(`${c}=excluded\\.${c}`));
  const prev = sqls.find((c) => /SELECT id, channel, status/.test(c.s));
  assert.match(prev.s, /tag, create_user, warehouse_code FROM orders/);
});

test('ตัวเทียบ same() มีสามช่องใหม่ (ไม่งั้นใบนิ่งไม่เคยได้ค่า)', () => {
  const src = readFileSync(new URL('../../netlify/lib/core-sync.mjs', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('const same = (o) =>'), src.indexOf('const changed = orders.filter'));
  assert.match(body, /String\(p\.tag \?\? ""\) === tagText\(o\.tag\)/);
  assert.match(body, /String\(p\.create_user \?\? ""\) === String\(o\.createusername \?\? ""\)\.slice\(0, 80\)/);
  assert.match(body, /String\(p\.warehouse_code \?\? ""\) === String\(o\.warehousecode \?\? ""\)\.slice\(0, 40\)/);
});

test('list=orders / orderfacets กรอง tag · ผู้สร้าง · คลัง + สะท้อนค่า', async () => {
  sqls.length = 0;
  const r = await listOrders({ from: '2026-09-01', to: '2026-09-14', tag: 'VIP', createUser: 'แอดมิน', warehouse: 'W0001' });
  const sale = sqls.find((c) => /FROM orders WHERE/.test(c.s) && /SUM\(amount\)/.test(c.s));
  assert.match(sale.s, /instr\(lower\(tag\)/);
  assert.match(sale.s, /instr\(lower\(create_user\)/);
  assert.match(sale.s, /warehouse_code = \?/);
  for (const v of ['VIP', 'แอดมิน', 'W0001']) assert.ok(sale.params.includes(v), v);
  assert.equal(r.advancedFilters.tag, 'VIP'); assert.equal(r.advancedFilters.warehouse, 'W0001');
  sqls.length = 0;
  await listOrderFacets({ from: '2026-09-01', to: '2026-09-14', warehouse: 'W0001' });
  assert.ok(sqls.filter((c) => /FROM orders WHERE/.test(c.s)).every((c) => /warehouse_code = \?/.test(c.s)));
});

test('core.mjs ส่งพารามิเตอร์ tag · createuser · warehouse ทั้ง orders และ orderfacets', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  for (const [name, start] of [['orderfacets', '...(await listOrderFacets({'], ['orders', 'listOrders({\n          from: p.get("from")']]) {
    const i = src.indexOf(start); assert.ok(i > 0, name);
    const blk = src.slice(i, src.indexOf('includeCancelled', i));
    for (const k of ['tag: p.get("tag")', 'createUser: p.get("createuser")', 'warehouse: p.get("warehouse")']) assert.ok(blk.includes(k), `${name} ขาด ${k}`);
  }
});
