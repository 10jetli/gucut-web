// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-p3521-quickpo-receive-shipping.test.mjs
// งานกระดาน t_mu0p3521: ใบซื้อแบบเร็ว · รับของ/ตรวจนับ · ข้อมูลจัดส่ง · นำเข้าหลายแถว (ZORT ปลอม ไม่ยิงเน็ตจริง)
// ⚠️ ชื่อช่อง/พารามิเตอร์มาจากเอกสาร ZORT API V4 ทางการ
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
  return { ok: true, status: 200, json: async () => ({ res: { resCode: '200' } }) };
};
const { zortAddPurchaseOrder, zortReceivePurchaseOrder, zortOrderShipping, zortAddQuotations, runBatch, BATCH_MAX } =
  await import('../../netlify/lib/zort-write.mjs');

const poBase = { ref: 'PO-1', vendor: 'โรงงาน', items: [{ sku: '00313', qty: 10, price: 12 }, { sku: '01209', qty: 2, price: 5 }] };

test('ใบซื้อแบบเร็ว: status ตามเอกสาร · จ่ายเงินต้องมีวิธีชำระ · ห้ามจ่ายเกิน · ยอดไม่รู้ = ห้ามจ่าย', async () => {
  calls = [];
  const r = await zortAddPurchaseOrder({ ...poBase, status: 'Success', paid: 130, paymentMethod: 'โอน' });
  assert.equal(r.dryRun, true);
  assert.equal(r.willSend.status, 'Success');
  assert.deepEqual([r.willSend.amount, r.willSend.paymentamount, r.willSend.paymentmethod], [130, 130, 'โอน']);
  assert.match((await zortAddPurchaseOrder({ ...poBase, status: 'Done' })).error, /Pending.*Success/);
  assert.match((await zortAddPurchaseOrder({ ...poBase, paid: 50 })).error, /paymentMethod/);
  assert.match((await zortAddPurchaseOrder({ ...poBase, paid: 999, paymentMethod: 'โอน' })).error, /มากกว่ายอดใบ/);
  const noPrice = { ...poBase, items: [{ sku: 'A', qty: 1 }], paid: 1, paymentMethod: 'โอน' };
  assert.match((await zortAddPurchaseOrder(noPrice)).error, /ราคาให้ครบ/);
  const plain = await zortAddPurchaseOrder(poBase);
  assert.equal(plain.willSend.status, undefined, 'ไม่ส่ง status มา = ไม่ใส่ช่อง (ของเดิมไม่เปลี่ยน)');
  assert.equal(calls.length, 0);
});

test('รับของ: มี items = UpdatePartialPurchaseOrder body [{sku, number}] · ไม่มี = UpdatePurchaseOrderStatus status=1', async () => {
  calls = [];
  const part = await zortReceivePurchaseOrder({ ref: 'R-1', id: 55, warehouse: 'KLD', date: '2026-09-14',
    items: [{ sku: '00313', qty: 4 }] });
  assert.equal(part.mode, 'partial');
  assert.equal(part.willSend.path, 'PurchaseOrder/UpdatePartialPurchaseOrder?id=55&warehousecode=KLD&actiondate=2026-09-14');
  assert.deepEqual(part.willSend.body, [{ sku: '00313', number: 4 }]);
  const all = await zortReceivePurchaseOrder({ ref: 'R-2', id: 55, date: '2026-09-14' });
  assert.equal(all.mode, 'all');
  assert.equal(all.willSend.path, 'PurchaseOrder/UpdatePurchaseOrderStatus?id=55&status=1&actionDate=2026-09-14');
  assert.equal(calls.length, 0);
});

test('🔴 รับของ/จัดส่ง: ไม่รับเลขที่ใบแทน id · ด่านข้อมูลผิด', async () => {
  assert.match((await zortReceivePurchaseOrder({ ref: 'R-3', number: 'PO-0001' })).error, /id/);
  assert.match((await zortOrderShipping({ ref: 'S-0', number: 'SO-0001', trackingNo: 'TH1' })).error, /id/);
  assert.match((await zortReceivePurchaseOrder({ ref: 'R-4', id: 5, items: [{ sku: 'A', qty: 0 }] })).error, /มากกว่า 0/);
  assert.match((await zortReceivePurchaseOrder({ ref: 'R-5', id: 5, date: '14/09/2026' })).error, /yyyy-MM-dd/);
  assert.match((await zortReceivePurchaseOrder({ ref: 'R-6', id: 5, warehouse: 'คลัง 1' })).error, /รหัสคลัง/);
  assert.match((await zortOrderShipping({ ref: 'S-1', id: 9 })).error, /อย่างน้อยหนึ่งช่อง/);
});

test('จัดส่ง: ส่งเฉพาะช่องจัดส่ง ไป EditOrderInfo?id= · ยืนยันแล้วยิงครั้งเดียว กดซ้ำไม่ยิงซ้ำ', async () => {
  calls = [];
  const dry = await zortOrderShipping({ ref: 'S-2', id: 9, trackingNo: 'TH123', shippingChannel: 'Flash', shippingDate: '2026-09-14',
    customerName: 'ห้ามหลุดไป' });
  assert.deepEqual(dry.willSend, { path: 'Order/EditOrderInfo?id=9',
    body: { trackingno: 'TH123', shippingchannel: 'Flash', shippingdate: '2026-09-14' } });
  assert.equal(calls.length, 0);
  const real = await zortOrderShipping({ ref: 'S-2', id: 9, trackingNo: 'TH123', confirm: true });
  assert.equal(real.updated, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /Order\/EditOrderInfo\?id=9$/);
  assert.deepEqual(JSON.parse(calls[0].body), { trackingno: 'TH123' });
  const again = await zortOrderShipping({ ref: 'S-2', id: 9, trackingNo: 'TH123', confirm: true });
  assert.equal(again.duplicate, true);
  assert.equal(calls.length, 1);
});

test('รับของยืนยันจริง: body เป็น array ส่งถึง ZORT ถูกรูป · กดซ้ำไม่รับของเข้าซ้ำ', async () => {
  calls = [];
  const r = await zortReceivePurchaseOrder({ ref: 'R-REAL', id: 77, items: [{ sku: '00313', qty: 3 }], confirm: true });
  assert.equal(r.received, true);
  assert.deepEqual(JSON.parse(calls[0].body), [{ sku: '00313', number: 3 }]);
  const again = await zortReceivePurchaseOrder({ ref: 'R-REAL', id: 77, items: [{ sku: '00313', qty: 3 }], confirm: true });
  assert.equal(again.duplicate, true);
  assert.equal(calls.length, 1);
});

test('นำเข้าหลายแถว: เพดานจำนวน · confirm ของชุดทับของแถว · ซ้อมไม่ยิงเน็ต', async () => {
  const many = Array.from({ length: BATCH_MAX + 1 }, () => ({}));
  assert.match((await zortAddQuotations({ rows: many })).error, /ไม่เกิน/);
  calls = [];
  const row = (n) => ({ ref: `Q-${n}`, customer: 'ร้าน A', items: [{ sku: '00313', qty: 1, price: 10 }], confirm: true });
  const r = await zortAddQuotations({ rows: [row(1), row(2)] });
  assert.equal(r.dryRun, true, 'แถวส่ง confirm มาเอง แต่ชุดไม่ confirm = ต้องซ้อมทั้งชุด');
  assert.deepEqual([r.done, r.complete, r.counts.ok], [2, true, 2]);
  assert.ok(r.results.every((x) => x.dryRun));
  assert.equal(calls.length, 0);
  const bad = await zortAddQuotations({ rows: [row(3), { ref: 'Q-4', items: [] }] });
  assert.equal(bad.ok, false);
  assert.equal(bad.counts.failed, 1);
});

test('🔴 เพดานเวลา: ยืนยันจริงแล้วเวลาใกล้หมด ⇒ ไม่เริ่มแถวใหม่ · complete:false + nextRow', async () => {
  let t = 0;
  const seen = [];
  const slow = async (row) => { seen.push(row.id); t += 8000; return { ok: true }; };
  const r = await runBatch([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], slow,
    { confirm: true, worstRowMs: 12000, now: () => t });
  assert.deepEqual(seen, [1, 2], 'แถว 3 จะทำให้เกิน 22 วิ (16+12) ต้องไม่เริ่ม');
  assert.deepEqual([r.complete, r.ok, r.done, r.notRun, r.nextRow], [false, false, 2, 2, 2]);
  const dry = await runBatch([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], slow, { confirm: false, now: () => 999999 });
  assert.equal(dry.done, 4, 'โหมดซ้อมไม่ยิงเน็ต ไม่ต้องติดเพดานเวลา');
});
