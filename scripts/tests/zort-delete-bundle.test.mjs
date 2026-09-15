// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-delete-bundle.test.mjs
// งาน t_mu1uptzd: ลบชุดผ่าน ZORT Bundle/DeleteBundle · ZORT ในเทสนี้เป็นของปลอมทั้งหมด
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const blob = new Map();
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({
  get: async (k) => (blob.has(k) ? blob.get(k) : null),
  setJSON: async (k, v) => { blob.set(k, v); },
}) } });

let calls = [];
let bundle = null;
let detailFails = false;
let detailRejects = false;
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method || 'GET' });
  if (String(url).includes('GetBundleDetail')) {
    if (detailFails) throw new Error('network down');
    if (detailRejects) return { ok: true, status: 200, json: async () => ({ resCode: '100', resDesc: 'Access Denied.' }) };
    return { ok: true, status: 200, json: async () => bundle };
  }
  return { ok: true, status: 200, json: async () => ({ resCode: '200', resDesc: 'OK' }) };
};
const posts = () => calls.filter((c) => c.method === 'POST');
const withZort = () => {
  process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';
};
const noZort = () => {
  delete process.env.ZORT_STORENAME; delete process.env.ZORT_APIKEY; delete process.env.ZORT_APISECRET;
};
noZort();

const { zortDeleteBundle } = await import('../../netlify/lib/zort-write.mjs');

test('โหมดซ้อมตรวจ input และไม่ยิง ZORT', async () => {
  calls = [];
  const r = await zortDeleteBundle({ ref: 'BD-1', id: '804372', sku: '00023-24NW' });
  assert.equal(r.dryRun, true);
  assert.deepEqual(r.willSend, { query: { id: 804372 }, body: null });
  assert.equal(calls.length, 0);
  assert.match((await zortDeleteBundle({ ref: '', id: 1, sku: 'A' })).error, /ref/);
  assert.match((await zortDeleteBundle({ ref: 'BD-X', id: 'A', sku: 'A' })).error, /id/);
  assert.match((await zortDeleteBundle({ ref: 'BD-X', id: 1, sku: '' })).error, /sku/);
});

test('ยืนยันแล้ว id เป็นชุดคนละรหัส ต้องไม่ยิง DeleteBundle', async () => {
  withZort(); calls = []; detailFails = false;
  bundle = { id: 804372, sku: 'OTHER', name: 'ชุดคนละตัว' };
  const r = await zortDeleteBundle({ ref: 'BD-MISMATCH', id: 804372, sku: '00023-24NW', confirm: true });
  assert.equal(r.ok, false);
  assert.equal(r.mismatch, true);
  assert.equal(posts().length, 0);
  assert.ok(![...blob.keys()].some((k) => k.includes('BD-MISMATCH')));
});

test('ถามตัวตนชุดไม่สำเร็จก่อนยิงลบ ต้องบอกว่ายังไม่ได้ลบและไม่ใช้สถานะ unknown', async () => {
  withZort(); calls = []; detailFails = true; detailRejects = false;
  const r = await zortDeleteBundle({ ref: 'BD-UNKNOWN', id: 804372, sku: '00023-24NW', confirm: true });
  assert.equal(r.ok, false);
  assert.equal(r.unknown, undefined);
  assert.match(r.error, /ยังไม่ได้ลบอะไร/);
  assert.equal(posts().length, 0);
  detailFails = false;

  calls = []; detailRejects = true;
  const rejected = await zortDeleteBundle({ ref: 'BD-REJECTED', id: 804372, sku: '00023-24NW', confirm: true });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /ZORT ปฏิเสธ.*ยังไม่ได้ลบอะไร/);
  assert.equal(posts().length, 0);
  detailRejects = false;
});

test('id+sku ตรงจึงยิง DeleteBundle ครั้งเดียว และ ref เดิมไม่ยิงซ้ำ', async () => {
  withZort(); calls = [];
  bundle = { id: 804372, sku: '00023-24NW', name: 'ชุดทดสอบ' };
  const first = await zortDeleteBundle({ ref: 'BD-OK', id: 804372, sku: '00023-24NW', confirm: true });
  assert.equal(first.deleted, true);
  assert.equal(posts().length, 1);
  assert.match(posts()[0].url, /Bundle\/DeleteBundle\?id=804372$/);
  const again = await zortDeleteBundle({ ref: 'BD-OK', id: 804372, sku: '00023-24NW', confirm: true });
  assert.equal(again.duplicate, true);
  assert.equal(posts().length, 1);
  noZort();
});
