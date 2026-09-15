// รัน: node --experimental-test-module-mocks --test scripts/tests/core-sync-header-only.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu2tzeb1 — ?sync=&items=none เขียนเฉพาะหัวใบ (กวาดย้อนหลัง tag/คลัง โดยไม่เผาโควตาเขียน D1)
// 🔴 สิ่งที่เฝ้า: ① ใบที่มีในกระจกแล้ว + หัวใบเปลี่ยน ⇒ ไม่แตะ order_items ② ใบใหม่ (ไม่มีในกระจก) ⇒ ยังเขียนบรรทัดเสมอ
//    ③ ไม่ส่ง items ⇒ พฤติกรรมเดิม (เขียนบรรทัดของใบที่เปลี่ยน)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

let prevRows = [];
const sqls = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => { sqls.push(String(sql)); return /SELECT id, channel, status/.test(sql) ? prevRows : []; },
} });
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({ get: async () => null, setJSON: async () => {} }) } });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';
delete process.env.ZORT_STORENAME_2;
const order = (number) => ({ number, status: 'Success', amount: 100, saleschannel: 'ทดสอบ', customername: 'ลูกค้า', orderdateString: '14/09/2026',
  discountamount: 0, shippingamount: 0, warehousecode: 'NEW', list: [{ sku: 'A', name: 'ของ', number: 1, pricepernumber: 100, totalprice: 100 }] });
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ list: [order('OLD-1'), order('NEW-1')] }) });
const { syncOrders } = await import('../../netlify/lib/core-sync.mjs');
// ใบ OLD-1 มีในกระจกแล้วแต่ยังไม่มีคลัง (ก่อนกวาด) ⇒ หัวใบเปลี่ยน
const oldRow = { id: 'z1/OLD-1', channel: 'ทดสอบ', status: 'Success', amount: 100, customer: 'ลูกค้า', order_date: '2026-09-14', tracking_no: '', pay_status: '', integration_status: '', bill_discount: 0, ship_amount: 0, tag: null, create_user: null, warehouse_code: null };

test('items=none ⇒ ใบเดิมไม่แตะบรรทัด · ใบใหม่ยังเขียนบรรทัด', async () => {
  prevRows = [oldRow]; sqls.length = 0;
  const r = await syncOrders(1, { from: '2026-09-14', to: '2026-09-14', items: 'none' });
  assert.equal(r.stores.z1.written, 2, 'หัวใบเขียนทั้งสองใบ');
  assert.equal(r.stores.z1.itemsHeaderOnly, true);
  const del = sqls.filter((s) => /DELETE FROM order_items/.test(s)).join('\n');
  assert.doesNotMatch(del, /OLD-1/, 'ใบเดิมห้ามลบบรรทัด');
  assert.match(del, /NEW-1/, 'ใบใหม่ต้องเขียนบรรทัด');
  assert.equal(r.stores.z1.items, 1);
});

test('ไม่ส่ง items ⇒ เขียนบรรทัดของใบที่เปลี่ยนทุกใบ (พฤติกรรมเดิม)', async () => {
  prevRows = [oldRow]; sqls.length = 0;
  const r = await syncOrders(1, { from: '2026-09-14', to: '2026-09-14' });
  assert.equal(r.stores.z1.items, 2);
  assert.equal('itemsHeaderOnly' in r.stores.z1, false);
});

test('core.mjs ส่ง items=none ต่อให้ตัวซิงก์ (ค่าอื่นเมิน)', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  assert.match(src, /items: \["all", "none"\]\.includes\(url\.searchParams\.get\("items"\)\) \? url\.searchParams\.get\("items"\) : undefined,/);
});
