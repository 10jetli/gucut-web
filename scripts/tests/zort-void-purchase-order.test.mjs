// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-void-purchase-order.test.mjs
// งานกระดาน t_mu1bh3s7 — ยกเลิกใบสั่งซื้อทดสอบ (PurchaseOrder/VoidPurchaseOrder?id=) · ZORT ปลอม ไม่ยิงเน็ตจริง
// 🔴 VoidQuotation ของ ZORT เคยตอบ 'Invalid ID.' ⇒ ห้ามเชื่อ resCode อย่างเดียว ต้องอ่านกลับว่า Voided จริง
// 🔴 ยกเลิกด้วย id + ต้องมีเลขที่ใบที่คาดไว้ตรงกัน · ใบที่รับของแล้วไม่ยกเลิก
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const blob = new Map();
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({
  get: async (k) => (blob.has(k) ? blob.get(k) : null),
  setJSON: async (k, v) => { blob.set(k, v); },
}) } });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';

/* ZORT ปลอม: เก็บสถานะใบไว้ · voidWorks = ยกเลิกแล้วสถานะเปลี่ยนจริงไหม · detailFails = อ่านใบไม่ได้ */
let po, voidWorks, voidCode, detailFails, calls;
const reset = (status = 'Pending') => {
  po = { id: 777, number: 'PO-TEST-0001', status, amount: 1 };
  voidWorks = true; voidCode = '200'; detailFails = false; calls = []; blob.clear();
};
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ url: u, method: init.method || 'GET' });
  if (u.includes('GetPurchaseOrderDetail')) {
    if (detailFails) throw new Error('network down');
    const id = Number(new URL(u).searchParams.get('id'));
    if (id !== po.id) return { ok: true, status: 200, json: async () => ({ resCode: '404', resDesc: 'not found' }) };
    return { ok: true, status: 200, json: async () => ({ ...po }) };
  }
  if (u.includes('VoidPurchaseOrder')) {
    if (voidWorks && voidCode === '200') po.status = 'Voided';
    return { ok: true, status: 200, json: async () => ({ resCode: voidCode, resDesc: voidCode === '200' ? 'Success' : 'Invalid ID.' }) };
  }
  throw new Error(`ไม่คาดว่าจะยิง ${u}`);
};
const { zortVoidPurchaseOrder, zortGetPurchaseOrderById } = await import('../../netlify/lib/zort-write.mjs');
const base = { ref: 'VOID-1', id: 777, number: 'PO-TEST-0001' };

test('โหมดซ้อม: ไม่ยิงอะไรเลย · ต้องมี ref/id/number', async () => {
  reset();
  const r = await zortVoidPurchaseOrder(base);
  assert.equal(r.dryRun, true);
  assert.equal(r.willSend.path, 'PurchaseOrder/VoidPurchaseOrder?id=777');
  assert.equal(calls.length, 0);
  assert.match((await zortVoidPurchaseOrder({ ...base, number: '' })).error, /เลขที่ใบ/);
  assert.match((await zortVoidPurchaseOrder({ ...base, id: 'PO-1' })).error, /id/);
});

test('ยกเลิกสำเร็จ: อ่านก่อน → ยิง void → อ่านกลับยืนยัน Voided', async () => {
  reset();
  const r = await zortVoidPurchaseOrder({ ...base, confirm: true });
  assert.equal(r.ok, true);
  assert.equal(r.verified, true);
  assert.deepEqual(calls.map((c) => c.url.match(/(GetPurchaseOrderDetail|VoidPurchaseOrder)/)[1]),
    ['GetPurchaseOrderDetail', 'VoidPurchaseOrder', 'GetPurchaseOrderDetail']);
  assert.equal(calls[1].method, 'POST');
});

test('🔴 ZORT ตอบ 200 แต่อ่านกลับยังไม่ Voided ⇒ ต้องไม่รายงานว่ายกเลิกแล้ว', async () => {
  reset();
  voidWorks = false;
  const r = await zortVoidPurchaseOrder({ ...base, ref: 'VOID-2', confirm: true });
  assert.equal(r.ok, false);
  assert.equal(r.voidAccepted, true);
  assert.equal(r.statusAfter, 'Pending');
  assert.match(r.error, /ยังไม่ได้ยกเลิกจริง/);
});

test('🔴 เลขที่ใบไม่ตรง ⇒ ไม่ยิง void · ใบรับของแล้ว ⇒ ไม่ยิง · ยกเลิกอยู่แล้ว ⇒ ไม่ยิงซ้ำ', async () => {
  reset();
  const wrong = await zortVoidPurchaseOrder({ ...base, ref: 'VOID-3', number: 'PO-OTHER', confirm: true });
  assert.equal(wrong.mismatch, true);
  assert.equal(calls.filter((c) => c.url.includes('VoidPurchaseOrder')).length, 0);

  reset('Success');
  const received = await zortVoidPurchaseOrder({ ...base, ref: 'VOID-4', confirm: true });
  assert.equal(received.ok, false);
  assert.match(received.error, /รับของเข้าคลังแล้ว/);
  assert.equal(calls.filter((c) => c.url.includes('VoidPurchaseOrder')).length, 0);

  reset('Voided');
  const already = await zortVoidPurchaseOrder({ ...base, ref: 'VOID-5', confirm: true });
  assert.equal(already.alreadyVoided, true);
  assert.equal(calls.filter((c) => c.url.includes('VoidPurchaseOrder')).length, 0);
});

test('🔴 อ่านใบไม่ได้ ⇒ unknown ไม่ยิง void · ZORT ปฏิเสธ ⇒ ไม่สำเร็จ', async () => {
  reset();
  detailFails = true;
  const r = await zortVoidPurchaseOrder({ ...base, ref: 'VOID-6', confirm: true });
  assert.equal(r.ok, false);
  assert.equal(r.unknown, true);
  assert.equal(calls.filter((c) => c.url.includes('VoidPurchaseOrder')).length, 0);

  reset();
  voidCode = '400';
  const rej = await zortVoidPurchaseOrder({ ...base, ref: 'VOID-7', confirm: true });
  assert.equal(rej.ok, false);
  assert.match(rej.error, /ปฏิเสธ/);
});

test('อ่านใบด้วย id: พบ · ไม่พบ · ถามไม่สำเร็จ = unknown', async () => {
  reset();
  const found = await zortGetPurchaseOrderById(777);
  assert.deepEqual(found.purchaseOrder, { id: 777, number: 'PO-TEST-0001', status: 'Pending', amount: 1, paymentstatus: null });
  const miss = await zortGetPurchaseOrderById(999);
  assert.equal(miss.found, false);
  detailFails = true;
  const unk = await zortGetPurchaseOrderById(777);
  assert.equal(unk.unknown, true);
});
