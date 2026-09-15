// รัน: node --experimental-test-module-mocks --test scripts/tests/products-image-path.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu2u6eg6 (ท่านประธานสั่ง "รูปต้องขึ้นทุกรหัส") — เก็บ imagepath จาก ZORT GetProducts
// 🔴 สิ่งที่เฝ้า: ① เขียน image_path ทั้งแถวใหม่และตอนชน ② ZORT ไม่มีรูป = '' ไม่ใช่ null
//    ③ แถวในฐานที่ยัง NULL นับว่าเปลี่ยน (รอบแรกกวาดครบ) ④ list=stock ส่ง imagePath สามสถานะ ไม่ยุบ null เป็น ''
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

let prevRows = [];
const sqls = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => { sqls.push(String(sql)); return /FROM products/.test(sql) && /^\s*SELECT/.test(sql) ? prevRows : []; },
} });
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({ get: async () => null, setJSON: async () => {} }) } });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';
const base = { name: 'ของ', sellprice: 10, purchaseprice: 5, producttype: 0, active: true, unittext: 'ชิ้น', stock: 1, availablestock: 1, category: 'หมวด', categoryid: '1', subCategory: '', weight: 0 };
globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => ({
  list: /page=1\b/.test(String(url)) ? [
    { ...base, sku: 'A', imagepath: ' https://img.example/a.png ' },
    { ...base, sku: 'B', imagepath: null },
  ] : [],
}) });
const { syncProducts } = await import('../../netlify/lib/core-products.mjs');

test('ซิงก์เขียน image_path · ไม่มีรูป = ค่าว่าง · ตอนชนอัปเดตด้วย', async () => {
  prevRows = []; sqls.length = 0;
  const r = await syncProducts();
  assert.equal(r.written, 2);
  const ins = sqls.find((s) => /INSERT INTO products/.test(s));
  assert.match(ins, /weight,image_path,updated_at\)/);
  assert.match(ins, /'https:\/\/img\.example\/a\.png',datetime\('now'\)\)/);
  assert.match(ins, /'B',[\s\S]*?,'',datetime\('now'\)\)/);
  assert.match(ins, /image_path=excluded\.image_path/);
  assert.match(sqls.find((s) => /SELECT sku, name/.test(s)), /weight, image_path\s+FROM products/);
});

test('แถวเดิมที่ image_path ยัง NULL ต้องถูกเขียนใหม่ · ตรงกันแล้วข้าม', async () => {
  const same = (sku, img) => ({ sku, name: 'ของ', sellprice: 10, purchase_price: 5, product_type: 0, active: 1, unit: 'ชิ้น', onhand: 1, available: 1, category: 'หมวด', category_id: '1', sub_category: '', weight: null, image_path: img });
  prevRows = [same('A', null), same('B', null)];
  assert.equal((await syncProducts()).written, 2, 'NULL = ยังไม่เคยซิงก์ ต้องเขียน');
  prevRows = [same('A', 'https://img.example/a.png'), same('B', '')];
  assert.equal((await syncProducts()).written, 0, 'ตรงกันทุกช่องต้องข้าม ไม่เผาโควตาเขียน');
});

test('list=stock ส่ง imagePath สามสถานะ ไม่ยุบ null', () => {
  const src = readFileSync(new URL('../../netlify/lib/core-stock.mjs', import.meta.url), 'utf8');
  assert.match(src, /p\.image_path AS imagePath/);
  assert.match(src, /imagePath: r\.imagePath === null \|\| r\.imagePath === undefined \? null : String\(r\.imagePath\)/);
  const db = readFileSync(new URL('../../netlify/lib/coredb.mjs', import.meta.url), 'utf8');
  assert.match(db, /ALTER TABLE products ADD COLUMN image_path TEXT/);
});
