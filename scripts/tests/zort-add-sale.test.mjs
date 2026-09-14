// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-add-sale.test.mjs
// sale-create "ขายจริง" → ZORT Order/AddOrder · ทดสอบโดยไม่ยิงเน็ต
// ⚠️ ชื่อช่องมาจากเอกสาร ZORT API V4 ทางการ · เงินต้องคิดที่ท่อ (กฎ zort-sends-all-money-fields)
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
const { zortAddSale } = await import('../../netlify/lib/zort-write.mjs');

const base = {
  ref: 'S-1', number: 'KLD-20260914-001', day: '2026-09-14', warehouse: 'KLD', customer: 'ลูกค้าหน้าร้าน',
  items: [{ sku: '00313', name: 'หัวเทียน', qty: 3, price: 45.5 }, { sku: '01209', name: 'โซ่', qty: 22.5, price: 16 }],
};

test('เงินสามชั้นคิดที่ท่อ: totalprice ต่อบรรทัด · amount = รวม − ส่วนลด + ค่าส่ง', async () => {
  const r = await zortAddSale({ ...base, discount: 20, shipping: 50, amount: 1 /* ตัวเลขจากจอ ต้องไม่ถูกใช้ */ });
  assert.equal(r.dryRun, true);
  const b = r.willSend;
  assert.deepEqual(b.list, [
    { sku: '00313', name: 'หัวเทียน', number: 3, pricepernumber: 45.5, totalprice: 136.5 },
    { sku: '01209', name: 'โซ่', number: 22.5, pricepernumber: 16, totalprice: 360 },
  ]);
  assert.equal(r.linesTotal, 496.5);
  assert.equal(b.amount, 526.5, '496.5 − 20 + 50');
  assert.equal(b.discount, '20.00', 'เอกสารกำหนด discount เป็น String');
  assert.equal(b.shippingamount, 50);
  assert.deepEqual([b.number, b.orderdate, b.status, b.warehousecode], ['KLD-20260914-001', '2026-09-14', 'Pending', 'KLD']);
  assert.equal(fetched, 0);
});

test('ชำระเงิน: ต้องมีวิธีชำระ · paymentdate รูป yyyy-MM-dd HH:mm · ห้ามชำระเกินยอด', async () => {
  assert.match((await zortAddSale({ ...base, paid: 100 })).error, /paymentMethod/);
  assert.match((await zortAddSale({ ...base, paid: 99999, paymentMethod: 'เงินสด' })).error, /มากกว่ายอดสุทธิ/);
  const r = await zortAddSale({ ...base, paid: 496.5, paymentMethod: 'เงินสด', status: 'Success' });
  assert.equal(r.willSend.paymentamount, 496.5);
  assert.match(r.willSend.paymentdate, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(r.willSend.status, 'Success');
});

test('ด่านก่อนถึง ZORT: ไม่มีราคา/ชื่อ/ref · ส่วนลดเกินยอด', async () => {
  assert.match((await zortAddSale({ ...base, ref: '' })).error, /ref/);
  assert.match((await zortAddSale({ ...base, items: [{ sku: 'A', name: 'x', qty: 1 }] })).error, /ไม่มีราคา/);
  assert.match((await zortAddSale({ ...base, items: [{ sku: 'A', qty: 1, price: 5 }] })).error, /ชื่อสินค้า/);
  assert.match((await zortAddSale({ ...base, discount: 9999 })).error, /ส่วนลด/);
});

test('ยืนยันส่งจริงแต่ไม่มีรหัส ZORT ⇒ ไม่รายงานสำเร็จ ไม่จดกันซ้ำ ไม่ยิงเน็ต', async () => {
  const r = await zortAddSale({ ...base, ref: 'S-REAL', confirm: true });
  assert.equal(r.ok, false);
  assert.equal(r.added, undefined);
  assert.ok(![...blob.keys()].some((k) => k.includes('S-REAL')));
  assert.equal(fetched, 0);
});
