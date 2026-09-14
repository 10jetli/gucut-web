// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-purchase-return.test.mjs
// soon: buy-return — คืนสินค้าให้ผู้ขาย → ReturnPurchaseOrder/AddReturnPurchaseOrder (ZORT ปลอม ไม่ยิงเน็ตจริง)
// ⚠️ ชื่อช่องมาจากเอกสาร ZORT API V4 ทางการ · เงินต้องคิดที่ท่อ (กฎ zort-sends-all-money-fields)
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const blob = new Map();
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({
  get: async (k) => (blob.has(k) ? blob.get(k) : null),
  setJSON: async (k, v) => { blob.set(k, v); },
}) } });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';
let calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method || 'GET', body: init.body });
  return { ok: true, status: 200, json: async () => ({ res: { resCode: '200' }, detail: { id: 1 } }) };
};
const { zortAddReturnPurchaseOrder } = await import('../../netlify/lib/zort-write.mjs');

const base = {
  ref: 'RPO-1', vendor: 'โรงงาน A', vendorCode: 'V-01', poId: 777, warehouse: 'KLD', day: '2026-09-14',
  items: [{ sku: '00313', name: 'หัวเทียน', qty: 3, price: 45.5 }, { sku: '01209', name: 'โซ่', qty: 2, price: 100 }],
};

test('เงินสามชั้นคิดที่ท่อ · ชื่อช่องตามเอกสาร · ค่าเริ่มต้น Pending · number ใช้ ref ถ้าไม่ส่ง · ไม่ยิงเน็ต', async () => {
  calls = [];
  const r = await zortAddReturnPurchaseOrder({ ...base, discount: 10, shipping: 20, amount: 1 /* ห้ามถูกใช้ */ });
  assert.equal(r.dryRun, true);
  const b = r.willSend;
  assert.deepEqual(b.list, [
    { sku: '00313', name: 'หัวเทียน', number: 3, pricepernumber: 45.5, totalprice: 136.5 },
    { sku: '01209', name: 'โซ่', number: 2, pricepernumber: 100, totalprice: 200 },
  ]);
  assert.equal(r.linesTotal, 336.5);
  assert.equal(b.amount, 346.5, '336.5 − 10 + 20');
  assert.equal(b.discount, '10.00');
  assert.equal(b.shippingamount, 20);
  assert.deepEqual([b.number, b.status, b.returnpurchaseorderdate, b.warehousecode, b.customername, b.customercode, b.referenceid],
    ['RPO-1', 'Pending', '2026-09-14', 'KLD', 'โรงงาน A', 'V-01', 777]);
  assert.equal(calls.length, 0);
});

test('ด่าน: ไม่มีราคา/ชื่อ · status นอกเอกสาร · ส่วนลดเกินยอด · poId ไม่ใช่เลข · จ่ายเกินยอด · วันที่ผิดรูป', async () => {
  const noPrice = { ...base, items: [{ sku: 'A', name: 'x', qty: 1 }] };
  assert.match((await zortAddReturnPurchaseOrder(noPrice)).error, /ไม่มีราคา/);
  assert.match((await zortAddReturnPurchaseOrder({ ...base, items: [{ sku: 'A', qty: 1, price: 1 }] })).error, /ชื่อสินค้า/);
  assert.match((await zortAddReturnPurchaseOrder({ ...base, status: 'Void' })).error, /Pending.*Success/);
  assert.match((await zortAddReturnPurchaseOrder({ ...base, discount: 9999 })).error, /ส่วนลด/);
  assert.match((await zortAddReturnPurchaseOrder({ ...base, poId: 'PO-0001' })).error, /poId/);
  assert.match((await zortAddReturnPurchaseOrder({ ...base, paid: 99999, paymentMethod: 'โอน' })).error, /มากกว่ายอดใบ/);
  assert.match((await zortAddReturnPurchaseOrder({ ...base, paid: 10 })).error, /paymentMethod/);
  assert.match((await zortAddReturnPurchaseOrder({ ...base, day: '14/09/2026' })).error, /yyyy-MM-dd/);
});

test('ยืนยันจริง: ยิงเส้น ReturnPurchaseOrder (ไม่ใช่ ReturnOrder) ครั้งเดียว · กดซ้ำไม่ยิงซ้ำ', async () => {
  calls = [];
  const r = await zortAddReturnPurchaseOrder({ ...base, ref: 'RPO-REAL', status: 'Success', confirm: true });
  assert.equal(r.added, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/ReturnPurchaseOrder\/AddReturnPurchaseOrder$/);
  assert.equal(JSON.parse(calls[0].body).status, 'Success');
  const again = await zortAddReturnPurchaseOrder({ ...base, ref: 'RPO-REAL', status: 'Success', confirm: true });
  assert.equal(again.duplicate, true);
  assert.equal(calls.length, 1);
});
