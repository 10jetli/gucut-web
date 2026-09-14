// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-batch-import.test.mjs
// งานกระดาน t_mu0qikag: นำเข้า Excel 4 ชนิดด้วยตัวกลางเดียว (zortBatch) — ZORT ปลอม ไม่ยิงเน็ตจริง
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
const { zortBatch } = await import('../../netlify/lib/zort-write.mjs');

const rows = {
  sale: { ref: 'IS-1', items: [{ sku: '00313', name: 'หัวเทียน', qty: 2, price: 45 }] },
  po: { ref: 'IP-1', vendor: 'โรงงาน', items: [{ sku: '00313', qty: 10, price: 12 }] },
  product: { ref: 'IPR-1', sku: 'NEW-1', name: 'สินค้าใหม่', price: 100 },
  contact: { ref: 'IC-1', code: 'CUS-1', name: 'ร้านทดสอบ' },
};

test('ทั้ง 4 ชนิดใช้ตัวเขียนเดิมของตัวเอง · ซ้อมไม่ยิงเน็ต · บอกชนิดกลับมา', async () => {
  calls = [];
  for (const [kind, row] of Object.entries(rows)) {
    const r = await zortBatch(kind, { rows: [row] });
    assert.equal(r.kind, kind);
    assert.deepEqual([r.ok, r.complete, r.dryRun, r.done], [true, true, true, 1], kind);
    assert.equal(r.results[0].dryRun, true, kind);
  }
  assert.equal(calls.length, 0);
});

test('ด่านของตัวเขียนเดิมยังทำงานรายแถว: แถวผิดไม่ทำให้แถวถูกหาย และบอกเลขแถว', async () => {
  const r = await zortBatch('contact', { rows: [rows.contact, { ref: 'IC-2', code: 'X', name: 'y', taxId: '123' }] });
  assert.equal(r.ok, false);
  assert.equal(r.counts.ok, 1);
  assert.equal(r.results[1].row, 1);
  assert.match(r.results[1].error, /13 หลัก/);
});

test('ชนิดที่ไม่รู้จัก / ชื่อที่เป็น key ของ Object ⇒ ตีกลับพร้อมรายการที่รับ', async () => {
  for (const kind of ['orders', '', 'constructor', '__proto__', 'toString']) {
    const r = await zortBatch(kind, { rows: [rows.sale] });
    assert.equal(r.ok, false, kind);
    assert.deepEqual(r.accepts, ['sale', 'po', 'product', 'contact', 'quotation'], kind);
  }
});

test('ยืนยันจริง: ยิงเส้นของชนิดนั้นทีละแถว · ส่งซ้ำด้วย ref เดิมไม่ยิงซ้ำ', async () => {
  calls = [];
  const two = [{ ...rows.po, ref: 'IP-R1' }, { ...rows.po, ref: 'IP-R2' }];
  const r = await zortBatch('po', { rows: two, confirm: true });
  assert.deepEqual([r.ok, r.done, r.counts.ok], [true, 2, 2]);
  assert.equal(calls.filter((c) => /PurchaseOrder\/AddPurchaseOrder$/.test(c.url)).length, 2);
  const again = await zortBatch('po', { rows: two, confirm: true });
  assert.equal(again.counts.duplicate, 2);
  assert.equal(calls.length, 2, 'ref เดิมต้องไม่ยิง ZORT ซ้ำ');
});
