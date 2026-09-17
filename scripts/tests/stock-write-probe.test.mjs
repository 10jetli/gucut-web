// รัน: node --experimental-test-module-mocks --test scripts/tests/stock-write-probe.test.mjs
// 17 ก.ย. 2569 · gucut2 — ตรวจสิทธิ์เขียนสต็อก Shopee/TikTok ด้วยรหัสปลอม (ท่านประธานสั่ง "ทำให้ครบ" ข้อ ①)
// 🔴 สิ่งที่เฝ้า: ① อ่านเจอรหัสปลอมในร้าน / อ่านไม่ได้ ⇒ **ไม่มีคำขอเขียนออกไปเลย**
//    ② แยก มีสิทธิ์ / ไม่มีสิทธิ์ / ไม่รู้ จากคำตอบจริง — คำตอบแปลก ๆ ต้องเป็น "ไม่รู้" ไม่ใช่ "มีสิทธิ์"
//    ③ เส้น HTTP เป็น GET เท่านั้น
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

let shopeeRead = { response: { item_list: [] } };
let shopeeWrite = { error: 'product.error_item_not_found', message: 'item not found', request_id: 'r1' };
let tiktokRead = () => { throw new Error('12052048: product not found'); };
let tiktokWrite = () => { throw new Error('12052048: product not found'); };
const writes = [];

mock.module('../../netlify/lib/shopee.mjs', { namedExports: {
  shopeeReady: () => true,
  validToken: async () => ({ accessToken: 'tok', shopId: 99 }),
  shopUrl: (path) => `https://shopee.test${path}`,
} });
mock.module('../../netlify/lib/tiktok.mjs', { namedExports: {
  tiktokReady: () => true,
  VERSION: '202309',
  ensureShop: async () => ({ accessToken: 'tok', shopCipher: 'c' }),
  shopCall: async (path, opts = {}) => {
    if (opts.method === 'POST') { writes.push({ platform: 'tiktok', path, body: opts.body }); return tiktokWrite(); }
    return tiktokRead();
  },
} });
mock.method(globalThis, 'fetch', async (url, init = {}) => {
  if (init.method === 'POST') { writes.push({ platform: 'shopee', url, body: JSON.parse(init.body) }); return { status: 200, json: async () => shopeeWrite }; }
  return { status: 200, json: async () => shopeeRead };
});

const { ตรวจShopee, ตรวจTikTok, แปลผล, รหัสปลอม } = await import('../../netlify/lib/stock-write-probe.mjs');

test('แปลผล — จับเฉพาะคำที่ชัด ที่เหลือไม่รู้', () => {
  assert.equal(แปลผล('product.error_item_not_found', 'item not found'), 'มีสิทธิ์');
  assert.equal(แปลผล('error_permission', 'no permission to access'), 'ไม่มีสิทธิ์');
  assert.equal(แปลผล('105005', 'Access denied: insufficient scope'), 'ไม่มีสิทธิ์');
  assert.equal(แปลผล('error_param', 'stock_list is invalid'), 'ไม่รู้');
  assert.equal(แปลผล(null, ''), 'ไม่รู้');
});

test('Shopee: อ่านไม่เจอ ⇒ ยิงเขียนด้วยรหัสปลอม · ตอบหาไม่เจอ ⇒ มีสิทธิ์', async () => {
  writes.length = 0; shopeeRead = { response: { item_list: [] } };
  shopeeWrite = { error: 'product.error_item_not_found', message: 'item not found' };
  const r = await ตรวจShopee();
  assert.equal(r.ผล, 'มีสิทธิ์');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.item_id, Number(รหัสปลอม));
});

test('Shopee: ตอบเรื่องสิทธิ์ ⇒ ไม่มีสิทธิ์ · ไม่มี error เลย ⇒ ไม่รู้ + เตือน', async () => {
  shopeeWrite = { error: 'error_permission', message: 'no permission' };
  assert.equal((await ตรวจShopee()).ผล, 'ไม่มีสิทธิ์');
  shopeeWrite = { response: {} };
  const r = await ตรวจShopee();
  assert.equal(r.ผล, 'ไม่รู้');
  assert.match(r.เตือน, /ผิดคาด/);
});

test('Shopee: อ่านเจอรหัสปลอมในร้าน หรืออ่านไม่ได้ ⇒ ไม่ยิงเขียนเลย', async () => {
  writes.length = 0;
  shopeeRead = { response: { item_list: [{ item_id: 1 }] } };
  assert.match((await ตรวจShopee()).ไม่ได้ยิง, /มีอยู่ในร้านจริง/);
  shopeeRead = { error: 'error_server', message: 'boom' };
  assert.match((await ตรวจShopee()).ไม่ได้ยิง, /ยืนยันไม่ได้/);
  assert.equal(writes.length, 0);
});

test('TikTok: อ่านไม่เจอ ⇒ ยิงเขียนรหัสปลอม · หาไม่เจอ = มีสิทธิ์ · scope = ไม่มีสิทธิ์', async () => {
  writes.length = 0;
  tiktokRead = () => { throw new Error('12052048: product not found'); };
  tiktokWrite = () => { throw new Error('12052048: product not found'); };
  const r = await ตรวจTikTok();
  assert.equal(r.ผล, 'มีสิทธิ์');
  assert.equal(writes.length, 1);
  assert.match(writes[0].path, /\/products\/1\/inventory\/update$/);
  tiktokWrite = () => { throw new Error('105005: Access denied, insufficient scope'); };
  assert.equal((await ตรวจTikTok()).ผล, 'ไม่มีสิทธิ์');
});

test('TikTok: อ่านเจอรหัสปลอม หรืออ่านพังแบบไม่ใช่คำตอบแพลตฟอร์ม ⇒ ไม่ยิงเขียน', async () => {
  writes.length = 0;
  tiktokRead = () => ({ data: { id: '1' } });
  assert.match((await ตรวจTikTok()).ไม่ได้ยิง, /มีอยู่ในร้านจริง/);
  tiktokRead = () => { throw new Error('fetch failed'); };
  assert.match((await ตรวจTikTok()).ไม่ได้ยิง, /ยืนยันไม่ได้/);
  assert.equal(writes.length, 0);
});

test('เส้น ?stockwriteprobe=1 รับ GET เท่านั้น', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const i = src.indexOf('url.searchParams.get("stockwriteprobe")');
  assert.ok(i > 0);
  assert.match(src.slice(i, i + 200), /req\.method !== "GET"/);
});
