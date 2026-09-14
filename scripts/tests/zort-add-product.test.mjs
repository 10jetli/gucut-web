// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-add-product.test.mjs
// งานกระดาน t_mu0tx2wj: เพิ่มสินค้า → Product/AddProduct · ชนิดข้อมูลตามเอกสาร ZORT API V4 ทางการ (ZORT ปลอม ไม่ยิงเน็ตจริง)
// ⚠️ เอกสารกำหนด sellprice · purchaseprice · weight · width · length · height เป็น **String** (ไม่ใช่ตัวเลข)
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
  return { ok: true, status: 200, json: async () => ({ res: { resCode: '200' }, detail: { id: 99 } }) };
};
const { zortAddProduct } = await import('../../netlify/lib/zort-write.mjs');

const base = { ref: 'P-1', sku: 'NEW-001', name: 'สินค้าใหม่' };

test('ชนิดข้อมูลตามเอกสาร: ราคา/ขนาดเป็น String · vat เป็นเลข 0-3 · ช่องว่างไม่ส่ง · ไม่ยิงเน็ต', async () => {
  calls = [];
  const r = await zortAddProduct({ ...base, price: 1500, cost: 980.5, unit: 'ชิ้น', barcode: '885000', category: 'อะไหล่',
    description: 'ทดสอบ', weight: 850, width: 10, length: 20, height: 5, vat: 1, purchaseVat: 2, tags: ['ใหม่', ' ', 'โซ่'] });
  assert.equal(r.dryRun, true);
  assert.deepEqual(r.willSend, {
    sku: 'NEW-001', name: 'สินค้าใหม่',
    sellprice: '1500', purchaseprice: '980.5',
    weight: '850', width: '10', length: '20', height: '5',
    sell_vat_status: 1, purchase_vat_status: 2,
    unittext: 'ชิ้น', barcode: '885000', category: 'อะไหล่', description: 'ทดสอบ', tag: ['ใหม่', 'โซ่'],
  });
  assert.equal(calls.length, 0);
});

test('🔴 ไม่ส่งสต็อกตั้งต้นเด็ดขาด — สต็อกต้องเกิดจากเอกสาร (ใบซื้อ/ปรับยอด) ไม่ใช่ตอนสร้างสินค้า', async () => {
  const r = await zortAddProduct({ ...base, stock: 50 });
  assert.equal(r.willSend.stock, undefined);
  assert.match(r.warnings?.join(' ') ?? '', /สต็อก/);
});

test('ด่าน: ไม่มี ref/sku/name · ราคาไม่ใช่ตัวเลข/ติดลบ · vat นอกช่วงเอกสาร (ขาย 0-3 · ซื้อ 0-2)', async () => {
  assert.match((await zortAddProduct({ ...base, ref: '' })).error, /ref/);
  assert.match((await zortAddProduct({ ...base, sku: '' })).error, /sku/);
  assert.match((await zortAddProduct({ ...base, price: 'abc' })).error, /price/);
  assert.match((await zortAddProduct({ ...base, cost: -1 })).error, /cost/);
  assert.match((await zortAddProduct({ ...base, vat: 4 })).error, /vat/);
  assert.match((await zortAddProduct({ ...base, purchaseVat: 3 })).error, /purchaseVat/);
});

test('ยืนยันจริง: ยิง Product/AddProduct ครั้งเดียว ส่งราคาเป็น String · กดซ้ำไม่ยิงซ้ำ', async () => {
  calls = [];
  const r = await zortAddProduct({ ...base, ref: 'P-REAL', price: 10, confirm: true });
  assert.equal(r.added, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/Product\/AddProduct$/);
  assert.equal(JSON.parse(calls[0].body).sellprice, '10');
  const again = await zortAddProduct({ ...base, ref: 'P-REAL', price: 10, confirm: true });
  assert.equal(again.duplicate, true);
  assert.equal(calls.length, 1);
});
