// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-update-bundle.test.mjs
// งาน t_mu1w2rth: Bundle/UpdateBundle · ZORT ในเทสเป็นของปลอมทั้งหมด ไม่ยิงเน็ตจริง
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
  calls.push({ url: String(url), method: init.method || 'GET', body: init.body });
  if (String(url).includes('GetBundleDetail')) {
    if (detailFails) throw new Error('network down');
    if (detailRejects) return { ok: true, status: 200, json: async () => ({ res: { resCode: '400', resDesc: 'denied' } }) };
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

const { zortUpdateBundle } = await import('../../netlify/lib/zort-write.mjs');

test('dry-run ส่งเฉพาะ 3 ช่องตามเอกสารและไม่ยิงเน็ต', async () => {
  calls = [];
  const r = await zortUpdateBundle({ ref: 'BU-1', id: 804372, sku: 'KIT-1', name: 'ชุดใหม่', price: '1200.50', vat: 4,
    before: { name: 'ชุดเดิม', sellprice: '1000', sell_vat_status: 1 } });
  assert.equal(r.dryRun, true);
  assert.deepEqual(r.willSend, { query: { id: 804372 },
    body: { name: 'ชุดใหม่', sellprice: '1200.5', sell_vat_status: 4 } });
  assert.equal(calls.length, 0);
});

test('ด่าน input ปฏิเสธ ref/id/sku/ชื่อ/ราคา/vat/ค่าก่อนแก้ที่ไม่ครบ', async () => {
  const base = { ref: 'BU-X', id: 7, sku: 'KIT', name: 'ใหม่', before: { name: 'เดิม' } };
  assert.match((await zortUpdateBundle({ ...base, ref: '' })).error, /ref/);
  assert.match((await zortUpdateBundle({ ...base, id: 'KIT' })).error, /id/);
  assert.match((await zortUpdateBundle({ ...base, sku: '' })).error, /sku/);
  assert.match((await zortUpdateBundle({ ...base, name: '' })).error, /ชื่อ/);
  assert.match((await zortUpdateBundle({ ...base, name: { text: 'ใหม่' } })).error, /ชื่อ/);
  assert.match((await zortUpdateBundle({ ...base, name: undefined, price: -1, before: { sellprice: 1 } })).error, /ราคา/);
  assert.match((await zortUpdateBundle({ ...base, name: undefined, price: [], before: { sellprice: 1 } })).error, /ราคา/);
  assert.match((await zortUpdateBundle({ ...base, name: undefined, vat: 8, before: { sell_vat_status: 1 } })).error, /vat/);
  assert.match((await zortUpdateBundle({ ...base, name: undefined, vat: null, before: { sell_vat_status: 1 } })).error, /vat/);
  assert.match((await zortUpdateBundle({ ...base, before: {} })).error, /ค่าก่อนแก้/);
});

test('id ชี้ชุดคนละรหัส หรือค่าเดิมเปลี่ยน ต้องไม่ยิง UpdateBundle', async () => {
  withZort(); detailFails = false;
  calls = []; bundle = { id: 7, sku: 'OTHER', name: 'เดิม', sellprice: '1000' };
  const mismatch = await zortUpdateBundle({ ref: 'BU-M', id: 7, sku: 'KIT', name: 'ใหม่', before: { name: 'เดิม' }, confirm: true });
  assert.equal(mismatch.mismatch, true);
  assert.equal(posts().length, 0);

  calls = []; bundle = { id: 7, sku: 'KIT', name: 'มีคนแก้แล้ว', sellprice: '1000' };
  const conflict = await zortUpdateBundle({ ref: 'BU-C', id: 7, sku: 'KIT', name: 'ใหม่', before: { name: 'เดิม' }, confirm: true });
  assert.equal(conflict.conflict, true);
  assert.equal(posts().length, 0);
});

test('ถามตัวตนล้มก่อน POST ต้องบอกว่ายังไม่ได้แก้และไม่ติด unknown', async () => {
  withZort(); calls = []; detailFails = true; detailRejects = false;
  const r = await zortUpdateBundle({ ref: 'BU-E', id: 7, sku: 'KIT', name: 'ใหม่', before: { name: 'เดิม' }, confirm: true });
  assert.equal(r.ok, false);
  assert.equal(r.unknown, undefined);
  assert.match(r.error, /ยังไม่ได้แก้อะไร/);
  assert.equal(posts().length, 0);
  detailFails = false;

  calls = []; detailRejects = true;
  const rejected = await zortUpdateBundle({ ref: 'BU-R', id: 7, sku: 'KIT', name: 'ใหม่', before: { name: 'เดิม' }, confirm: true });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /ZORT ปฏิเสธ.*ยังไม่ได้แก้อะไร/);
  assert.equal(posts().length, 0);
  detailRejects = false;
});

test('id+sku+ค่าเดิมตรงจึงยิง UpdateBundle ครั้งเดียว และ ref เดิมไม่ยิงซ้ำ', async () => {
  withZort(); calls = [];
  bundle = { id: 7, sku: 'KIT', name: 'เดิม', sellprice: '1000', sell_vat_status: 1 };
  const input = { ref: 'BU-OK', id: 7, sku: 'KIT', price: 1200,
    before: { sellprice: '1000' }, confirm: true };
  const first = await zortUpdateBundle(input);
  assert.equal(first.updated, true);
  assert.equal(posts().length, 1);
  assert.match(posts()[0].url, /Bundle\/UpdateBundle\?id=7$/);
  assert.deepEqual(JSON.parse(posts()[0].body), { sellprice: '1200' });
  const again = await zortUpdateBundle(input);
  assert.equal(again.duplicate, true);
  assert.equal(posts().length, 1);
  noZort();
});
