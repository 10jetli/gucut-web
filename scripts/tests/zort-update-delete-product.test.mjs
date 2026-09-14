// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-update-delete-product.test.mjs
// งานกระดาน t_mu0m97e5 ขั้น ③ แก้/ลบสินค้า → ZORT Product/UpdateProduct · DeleteProduct (ระบุด้วย id ของ ZORT)
// ⚠️ ชื่อช่องมาจากเอกสาร ZORT API V4 ทางการ · ZORT ในเทสนี้เป็นของปลอมทั้งหมด ไม่ยิงเน็ตจริง
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const blob = new Map();
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({
  get: async (k) => (blob.has(k) ? blob.get(k) : null),
  setJSON: async (k, v) => { blob.set(k, v); },
}) } });
delete process.env.ZORT_STORENAME; delete process.env.ZORT_APIKEY; delete process.env.ZORT_APISECRET;

let calls = [];
let product = null;      // สิ่งที่ ZORT ปลอมคืนจาก GetProductDetail
let detailFails = false;
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method || 'GET' });
  if (String(url).includes('GetProductDetail')) {
    if (detailFails) throw new Error('network down');
    return { ok: true, status: 200, json: async () => product };
  }
  return { ok: true, status: 200, json: async () => ({ res: { resCode: '200', resDesc: 'OK' } }) };
};
const posts = () => calls.filter((c) => c.method === 'POST');
const withZort = () => { process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x'; };
const noZort = () => { delete process.env.ZORT_STORENAME; delete process.env.ZORT_APIKEY; delete process.env.ZORT_APISECRET; };

const { zortUpdateProduct, zortDeleteProduct } = await import('../../netlify/lib/zort-write.mjs');

test('แก้สินค้า โหมดซ้อม: id ไปอยู่ query · ตัวเลขเป็น String ตามเอกสาร · ช่องว่างไม่ส่ง · ไม่ยิงเน็ต', async () => {
  noZort(); calls = [];
  const r = await zortUpdateProduct({ ref: 'U-1', id: '1234', sku: '00313', price: 45.5, cost: 0, unit: 'ชิ้น',
    barcode: '', weight: 120, vat: 1 });
  assert.equal(r.dryRun, true);
  assert.deepEqual(r.willSend, { query: { id: 1234 },
    body: { sellprice: '45.5', purchaseprice: '0', weight: '120', sell_vat_status: 1, unittext: 'ชิ้น' } });
  assert.equal(calls.length, 0);
});

test('ด่านก่อนถึง ZORT: ref · id ต้องเป็นตัวเลขของ ZORT · ต้องมี sku คู่ · ราคาติดลบ · vat · ไม่มีช่องให้แก้', async () => {
  const base = { ref: 'U-2', id: 5, sku: 'A', name: 'x' };
  assert.match((await zortUpdateProduct({ ...base, ref: '' })).error, /ref/);
  assert.match((await zortUpdateProduct({ ...base, id: 'SKU-1' })).error, /id/);
  assert.match((await zortUpdateProduct({ ...base, sku: '' })).error, /sku/);
  assert.match((await zortUpdateProduct({ ...base, price: -1 })).error, /ไม่ติดลบ/);
  assert.match((await zortUpdateProduct({ ...base, vat: 7 })).error, /vat/);
  assert.match((await zortUpdateProduct({ ref: 'U-2', id: 5, sku: 'A' })).error, /ไม่มีช่อง/);
  assert.match((await zortDeleteProduct({ ref: 'D-0', sku: 'A' })).error, /id/);
});

test('🔴 ยืนยันแก้: id ใน ZORT เป็นสินค้าคนละตัว ⇒ ไม่ยิง UpdateProduct และไม่จดกันซ้ำ', async () => {
  withZort(); calls = []; detailFails = false;
  product = { id: 5, sku: 'OTHER', name: 'ของคนละตัว', stock: '0' };
  const r = await zortUpdateProduct({ ref: 'U-MIS', id: 5, sku: '00313', price: 10, confirm: true });
  assert.equal(r.ok, false);
  assert.equal(r.mismatch, true);
  assert.equal(posts().length, 0);
  assert.ok(![...blob.keys()].some((k) => k.includes('U-MIS')));
});

test('ยืนยันแก้: ถาม ZORT ไม่สำเร็จ ⇒ "ไม่รู้" ไม่ใช่ "ตรง" · ไม่ยิง', async () => {
  withZort(); calls = []; detailFails = true;
  const r = await zortUpdateProduct({ ref: 'U-UNK', id: 5, sku: '00313', price: 10, confirm: true });
  assert.equal(r.ok, false);
  assert.equal(r.unknown, true);
  assert.equal(posts().length, 0);
  detailFails = false;
});

test('ยืนยันแก้: id ตรง sku ⇒ ยิง UpdateProduct?id= ครั้งเดียว แล้วจดกันซ้ำ', async () => {
  withZort(); calls = [];
  product = { id: 5, sku: '00313', name: 'หัวเทียน', stock: '9' };
  const r = await zortUpdateProduct({ ref: 'U-OK', id: 5, sku: '00313', price: 10, confirm: true });
  assert.equal(r.updated, true);
  assert.equal(posts().length, 1);
  assert.match(posts()[0].url, /Product\/UpdateProduct\?id=5$/);
  const again = await zortUpdateProduct({ ref: 'U-OK', id: 5, sku: '00313', price: 10, confirm: true });
  assert.equal(again.duplicate, true);
  assert.equal(posts().length, 1, 'กดซ้ำต้องไม่ยิงซ้ำ');
});

test('🔴 ยืนยันลบ: สต็อกไม่เป็น 0 หรืออ่านสต็อกไม่ได้ ⇒ ไม่ลบ', async () => {
  withZort();
  for (const stock of ['3', '-1', undefined, '']) {
    calls = [];
    product = { id: 7, sku: '01209', name: 'โซ่', stock };
    const r = await zortDeleteProduct({ ref: `D-S${stock}`, id: 7, sku: '01209', confirm: true });
    assert.equal(r.ok, false, `stock=${stock}`);
    assert.equal(posts().length, 0, `stock=${stock} ต้องไม่ยิง DeleteProduct`);
  }
});

test('ลบ: โหมดซ้อมไม่ยิงเน็ต · ยืนยันแล้ว id ตรง + สต็อก 0 ⇒ ยิง DeleteProduct?id= ครั้งเดียว', async () => {
  noZort(); calls = [];
  const dry = await zortDeleteProduct({ ref: 'D-1', id: 7, sku: '01209' });
  assert.equal(dry.dryRun, true);
  assert.equal(calls.length, 0);
  withZort(); calls = [];
  product = { id: 7, sku: '01209', name: 'โซ่', stock: '0' };
  const r = await zortDeleteProduct({ ref: 'D-OK', id: 7, sku: '01209', confirm: true });
  assert.equal(r.deleted, true);
  assert.equal(posts().length, 1);
  assert.match(posts()[0].url, /Product\/DeleteProduct\?id=7$/);
  noZort();
});
