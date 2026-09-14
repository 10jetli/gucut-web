// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-find-purchase-order.test.mjs
// งานกระดาน t_mu0tx40g: หาใบสั่งซื้อใน ZORT ด้วยเลขที่ใบ → id สำหรับ ?poreceive (ZORT ปลอม ไม่ยิงเน็ตจริง)
// ⚠️ เอกสาร V4: numberlist เป็น header · เลขที่ใบซ้ำกันได้จริง ต้องกรองตรงตัวและห้ามเดา
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('@netlify/blobs', { namedExports: { getStore: () => ({ get: async () => null, setJSON: async () => {} }) } });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';

let calls = [];
let list = [];
let fails = false;
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), headers: init.headers || {}, method: init.method || 'GET' });
  if (fails) throw new Error('network down');
  return { ok: true, status: 200, json: async () => ({ list, count: list.length }) };
};
const { zortFindPurchaseOrder } = await import('../../netlify/lib/zort-write.mjs');

test('ส่งเลขที่ใบผ่าน header numberlist (ไม่ใช่ query) · GET เท่านั้น · ได้ id ของใบที่ตรงตัว', async () => {
  calls = [];
  list = [{ id: 10, number: 'PO-2026-001X', status: 'Pending' },
    { id: 11, number: 'PO-2026-001', status: 'Waiting', warehousecode: 'KLD', amount: 500, list: [{ sku: '00313', name: 'หัวเทียน', number: 4 }] }];
  const r = await zortFindPurchaseOrder('PO-2026-001');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].headers.numberlist, 'PO-2026-001');
  assert.doesNotMatch(calls[0].url, /numberlist/);
  assert.deepEqual(r.purchaseOrder, { id: 11, number: 'PO-2026-001', status: 'Waiting', warehousecode: 'KLD', amount: 500,
    paymentstatus: null, lines: [{ sku: '00313', name: 'หัวเทียน', qty: 4 }] });
});

test('🔴 เลขที่ใบซ้ำหลายใบ ⇒ ตีกลับพร้อม ids ไม่เดา', async () => {
  list = [{ id: 20, number: 'PO-DUP' }, { id: 21, number: 'PO-DUP' }];
  const r = await zortFindPurchaseOrder('PO-DUP');
  assert.equal(r.ok, false);
  assert.equal(r.duplicate, true);
  assert.deepEqual(r.ids, [20, 21]);
  assert.equal(r.purchaseOrder, undefined);
});

test('ไม่มีจริง ≠ ถามไม่สำเร็จ · ไม่ระบุเลข = ตีกลับ', async () => {
  list = [{ id: 30, number: 'OTHER' }];
  assert.deepEqual(await zortFindPurchaseOrder('PO-NONE'), { ok: true, found: false, number: 'PO-NONE', returned: 1 });
  fails = true;
  const u = await zortFindPurchaseOrder('PO-NONE');
  fails = false;
  assert.equal(u.ok, false);
  assert.equal(u.unknown, true);
  assert.match((await zortFindPurchaseOrder('  ')).error, /เลขที่ใบ/);
});
