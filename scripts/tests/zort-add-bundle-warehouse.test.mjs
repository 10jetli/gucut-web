// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-add-bundle-warehouse.test.mjs
// งานกระดาน t_mu0m99go: ตัวเขียนชุดสินค้า/คลังเข้า ZORT — ทดสอบโดยไม่ยิงเน็ต
// ⚠️ ชื่อช่องที่ตรวจข้างล่างมาจากเอกสาร ZORT API V4 ทางการ — เปลี่ยนเมื่อไหร่ต้องเปิดเอกสารยืนยันก่อน
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const blob = new Map();
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({
  get: async (k) => (blob.has(k) ? blob.get(k) : null),
  setJSON: async (k, v) => { blob.set(k, v); },
}) } });
delete process.env.ZORT_STORENAME; delete process.env.ZORT_APIKEY; delete process.env.ZORT_APISECRET;
let fetched = 0;
globalThis.fetch = async () => { fetched++; throw new Error('ห้ามยิงเน็ตในเทส'); };
const { zortAddBundle, zortAddWarehouse } = await import('../../netlify/lib/zort-write.mjs');

test('ชุดสินค้า: โหมดซ้อมส่งชื่อช่องตามเอกสาร V4 และไม่ยิงจริง', async () => {
  const r = await zortAddBundle({ ref: 'B-1', sku: 'KIT-1', name: 'ชุดทดสอบ', price: 1500, vat: 1,
    items: [{ sku: '00313', qty: 2 }, { sku: '01209', qty: 22.5 }] });
  assert.equal(r.dryRun, true);
  assert.deepEqual(r.willSend, { name: 'ชุดทดสอบ', sku: 'KIT-1', sellprice: '1500', sell_vat_status: 1,
    list: [{ sku: '00313', quantity: 2 }, { sku: '01209', quantity: 22.5 }] });
  assert.equal(fetched, 0);
});

test('ชุดสินค้า: ด่านกันข้อมูลผิดก่อนถึง ZORT', async () => {
  const base = { ref: 'B-2', sku: 'KIT-2', name: 'x', price: 10, items: [{ sku: 'A', qty: 1 }] };
  assert.match((await zortAddBundle({ ...base, ref: '' })).error, /ref/);
  assert.match((await zortAddBundle({ ...base, price: 'abc' })).error, /ราคา/);
  assert.match((await zortAddBundle({ ...base, items: [] })).error, /ส่วนประกอบ/);
  assert.match((await zortAddBundle({ ...base, items: [{ sku: 'A', qty: 0 }] })).error, /มากกว่า 0/);
  assert.match((await zortAddBundle({ ...base, items: [{ sku: 'KIT-2', qty: 1 }] })).error, /ตัวเอง/);
  assert.match((await zortAddBundle({ ...base, vat: 1.5 })).error, /vat/);
});

test('คลัง: โหมดซ้อมตามเอกสาร · code ต้องเป็นอักษรอังกฤษ/ตัวเลข', async () => {
  const r = await zortAddWarehouse({ ref: 'W-1', code: 'BKK', name: 'สาขากรุงเทพ', address: 'ทดสอบ' });
  assert.deepEqual(r.willSend, { code: 'BKK', name: 'สาขากรุงเทพ', address: 'ทดสอบ' });
  assert.match((await zortAddWarehouse({ ref: 'W-2', code: 'สาขา 1', name: 'x' })).error, /code/);
  assert.match((await zortAddWarehouse({ ref: 'W-3', code: 'X' })).error, /name/);
});

test('ยืนยันส่งจริงแต่ไม่มีรหัส ZORT ⇒ ต้องไม่รายงานว่าสำเร็จ และไม่จดกันซ้ำ', async () => {
  const r = await zortAddWarehouse({ ref: 'W-REAL', code: 'TST', name: 'x', confirm: true });
  assert.equal(r.ok, false);
  assert.equal(r.added, undefined);
  assert.ok(![...blob.keys()].some((k) => k.includes('W-REAL')), 'ยิงไม่สำเร็จห้ามจดว่าเคยบันทึก');
  assert.equal(fetched, 0);
});
