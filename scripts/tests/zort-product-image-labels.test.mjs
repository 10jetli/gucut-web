// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-product-image-labels.test.mjs
// งานกระดาน t_mu0m98gq: หาสินค้าด้วย sku · ข้อมูลฉลากบาร์โค้ด · รูปสินค้า → ZORT (ของปลอมทั้งหมด ไม่ยิงเน็ตจริง)
// ⚠️ ชื่อช่องมาจากเอกสาร ZORT API V4 ทางการ
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const blob = new Map();
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({
  get: async (k) => (blob.has(k) ? blob.get(k) : null),
  setJSON: async (k, v) => { blob.set(k, v); },
}) } });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';

let calls = [];
let list = [];            // GetProducts ปลอม
let product = null;       // GetProductDetail ปลอม
let listFails = new Set(); // sku ที่ถามแล้วล้ม
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ url: u, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
  if (u.includes('GetProducts')) {
    const sku = decodeURIComponent(/searchsku=([^&]*)/.exec(u)?.[1] || '');
    if (listFails.has(sku)) throw new Error('network down');
    return { ok: true, status: 200, json: async () => ({ list: list.filter((p) => p.sku.startsWith(sku)), count: 0 }) };
  }
  if (u.includes('GetProductDetail')) return { ok: true, status: 200, json: async () => product };
  return { ok: true, status: 200, json: async () => ({ res: { resCode: '200' } }) };
};
const posts = () => calls.filter((c) => c.method === 'POST');
const { zortFindProduct, zortProductLabels, zortUpdateProductImage, LABEL_MAX } =
  await import('../../netlify/lib/zort-write.mjs');

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 1)]).toString('base64');

test('หาสินค้า: ต้องตรงตัวเป๊ะ (00313 ห้ามได้ 00313-A) · ไม่มีจริง ≠ ถามไม่สำเร็จ', async () => {
  list = [{ id: 1, sku: '00313-A', name: 'ของคล้าย' }, { id: 2, sku: '00313', name: 'หัวเทียน', barcode: '885', stock: '4', purchaseprice: '20' }];
  const r = await zortFindProduct('00313');
  assert.equal(r.product.id, 2);
  assert.equal(r.product.purchaseprice, 20);
  assert.deepEqual(await zortFindProduct('99999'), { ok: true, found: false, sku: '99999' });
  listFails = new Set(['00627']);
  const u = await zortFindProduct('00627');
  assert.equal(u.ok, false);
  assert.equal(u.unknown, true, 'ถามไม่สำเร็จต้องไม่ตอบว่า "ไม่มีสินค้า"');
  listFails = new Set();
  list = [{ id: 3, sku: 'DUP' }, { id: 4, sku: 'DUP' }];
  assert.match((await zortFindProduct('DUP')).error, /ไม่เดา/);
});

test('ฉลาก: เพดานจำนวน · แยก rows / missing / failed · ไม่มีบาร์โค้ดต้องติดธง', async () => {
  const many = Array.from({ length: LABEL_MAX + 1 }, (_, i) => `S${i}`).join(',');
  assert.match((await zortProductLabels(many)).error, /ไม่เกิน/);
  list = [{ id: 2, sku: '00313', name: 'หัวเทียน', barcode: '885', sellprice: '45' }, { id: 5, sku: '01209', name: 'โซ่' }];
  listFails = new Set(['BROKEN']);
  const r = await zortProductLabels('00313, 01209,NOPE,BROKEN,00313');
  listFails = new Set();
  assert.deepEqual(r.rows.map((x) => [x.sku, x.noBarcode]), [['00313', false], ['01209', true]]);
  assert.deepEqual(r.missing, ['NOPE']);
  assert.deepEqual(r.failed.map((f) => f.sku), ['BROKEN']);
  assert.equal(r.complete, false);
});

test('รูป โหมดซ้อม: ตรวจชนิดจากเนื้อไฟล์ · ไม่ยิงเน็ต', async () => {
  calls = [];
  const r = await zortUpdateProductImage({ ref: 'I-1', id: 2, sku: '00313', image: `data:image/png;base64,${jpeg}` });
  assert.equal(r.dryRun, true);
  assert.equal(r.willSend.file.type, 'image/jpeg', 'ต้องเชื่อเนื้อไฟล์ ไม่เชื่อ data URL ที่บอกว่า png');
  assert.equal(r.willSend.file.name, '00313.jpg');
  assert.equal(calls.length, 0);
});

test('รูป ด่าน: ไม่ใช่รูป · เล็กผิดปกติ · ใหญ่เกิน · ไม่ใช่ base64 · ไม่มี id/sku', async () => {
  const base = { ref: 'I-2', id: 2, sku: '00313' };
  assert.match((await zortUpdateProductImage({ ...base, image: Buffer.alloc(3000, 7).toString('base64') })).error, /ไม่ใช่รูป/);
  assert.match((await zortUpdateProductImage({ ...base, image: Buffer.from([0xff, 0xd8, 0xff, 1]).toString('base64') })).error, /เล็ก/);
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(4 * 1024 * 1024)]).toString('base64');
  assert.match((await zortUpdateProductImage({ ...base, image: big })).error, /ใหญ่เกิน/);
  assert.match((await zortUpdateProductImage({ ...base, image: 'ไม่ใช่!!' })).error, /base64/);
  assert.match((await zortUpdateProductImage({ ...base, sku: '', image: jpeg })).error, /sku/);
});

test('🔴 รูป ยืนยัน: id ไม่ตรง sku ⇒ ไม่ยิง · ตรง ⇒ ส่ง multipart ช่อง file ครั้งเดียว ไม่ตั้ง content-type เอง', async () => {
  calls = [];
  product = { id: 2, sku: 'OTHER', stock: '0' };
  const bad = await zortUpdateProductImage({ ref: 'I-MIS', id: 2, sku: '00313', image: jpeg, confirm: true });
  assert.equal(bad.mismatch, true);
  assert.equal(posts().length, 0);
  product = { id: 2, sku: '00313', stock: '4' };
  const r = await zortUpdateProductImage({ ref: 'I-OK', id: 2, sku: '00313', image: jpeg, confirm: true });
  assert.equal(r.updated, true);
  assert.equal(posts().length, 1);
  const p = posts()[0];
  assert.match(p.url, /Product\/UpdateProductImage\?id=2$/);
  assert.ok(p.body instanceof FormData);
  assert.equal(p.body.get('file').size, Buffer.from(jpeg, 'base64').length);
  assert.equal(p.headers['content-type'], undefined, 'multipart ต้องให้ fetch ใส่ boundary เอง');
});

test('ช่องทางเดิมยังส่ง JSON ตามปกติหลังแก้ zortPost', async () => {
  calls = [];
  product = { id: 2, sku: '00313', stock: '4' };
  const { zortUpdateProduct } = await import('../../netlify/lib/zort-write.mjs');
  await zortUpdateProduct({ ref: 'U-JSON', id: 2, sku: '00313', price: 10, confirm: true });
  const p = posts()[0];
  assert.equal(p.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(p.body), { sellprice: '10' });
});
