// รัน: node --experimental-test-module-mocks --test scripts/tests/สามสถานะของการเชื่อมช่องทาง.test.mjs
//
// 🔴 **ใบ B28 (t_mv4z4a3l)** — "ตรวจสถานะการเชื่อมไม่ได้" ถูกแปลเป็น "ยังไม่ได้กดอนุญาต"
//    ⇒ จอสั่งให้ร้านไปกดอนุญาตสิ่งที่กดไปแล้ว · และช่องทางนั้นหายจากรายงานทั้งใบ
//
// 🔑 **สิ่งที่ไฟล์นี้ตรวจ ไม่ใช่สิ่งที่ใบชี้**: จุดที่ใบชี้ (Lazada) แก้ไปแล้ว 4 ต.ค.
//    ของที่ยังค้างคือ **ฝาแฝด** — กฎเขียนไว้ที่หัว `notConnected` ว่า
//      *"เจ้าที่ยังเชื่อมไม่ได้ต้องไม่เข้าลูป ไม่งั้นมันจะไปโผล่ใน `failed` ซึ่งอ่านว่าล่ม"*
//    แต่บังคับกับ **Lazada เจ้าเดียว** · shopee/tiktok เข้าลูปตรง ๆ
//    ⇒ ร้านที่ยังไม่เคยกดอนุญาต Shopee เห็นว่า **"Shopee ล่ม"** = อาการกลับด้านของ B28
//
// ⚠️ ขอบเขต: ตรวจ **การจัดกองสามสถานะ** ไม่ได้ตรวจว่ารายชื่อรหัสถูก
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const โทเคน = { accessToken: 'x', expireAt: Date.now() / 1000 + 86400, expiresAt: Date.now() + 86400e3 };
let อาการ = {};   // ต่อเจ้า: 'ok' | 'ยังไม่เชื่อม' | 'อ่านไม่ได้'
const ตัวอ่าน = (tag) => async () => {
  const a = อาการ[tag] || 'ok';
  if (a === 'อ่านไม่ได้') throw new Error(`อ่าน token ไม่ได้ (${tag})`);
  return a === 'ยังไม่เชื่อม' ? null : โทเคน;
};

mock.module('@netlify/blobs', { namedExports: {
  getStore: () => ({ async get() { return null; }, async setJSON() {} }),
} });
mock.module('../../netlify/lib/shopee.mjs', { namedExports: { validToken: ตัวอ่าน('shopee') } });
mock.module('../../netlify/lib/tiktok.mjs', { namedExports: {
  validToken: ตัวอ่าน('tiktok'),
  ensureShop: async () => {},
  shopCall: async () => ({ data: { products: [{ skus: [{ seller_sku: 'TT-1' }] }] } }),
} });
mock.module('../../netlify/lib/lazada.mjs', { namedExports: {
  validToken: ตัวอ่าน('lazada'),
  listedSkus: async () => new Set(['LZ-1']),
} });
mock.module('../../netlify/lib/shopee-stock.mjs', { namedExports: {
  shopeeListedSkus: async () => new Set(['SP-1']),
} });
mock.module('../../netlify/lib/site.mjs', { namedExports: { SITE_URL: 'https://x' } });
globalThis.fetch = async () => ({ ok: true, status: 200, async json() { return { list: [{ sku: 'W-1' }] }; } });

const { marketplaceListings } = await import('../../netlify/lib/marketplace-listings.mjs');
const เรียก = () => marketplaceListings({ fresh: true });

test('🔴 ทุกเจ้า: ยังไม่ได้กดอนุญาต ⇒ ลง `notConnected` **ไม่ใช่** `failed`', async () => {
  for (const tag of ['shopee', 'tiktok', 'lazada']) {
    อาการ = { [tag]: 'ยังไม่เชื่อม' };
    const r = await เรียก();
    assert.ok(r.notConnected[tag], `${tag}: ต้องอยู่ใน notConnected`);
    assert.equal(r.failed[tag], undefined,
      `${tag}: ห้ามอยู่ใน failed — "ล่ม" กับ "ยังไม่ได้กดอนุญาต" คนละเรื่อง`);
    assert.ok(/กดอนุญาต/.test(r.notConnected[tag]), `${tag}: ข้อความต้องบอกว่าต้องไปกดอนุญาต`);
  }
});

test('🔴 ทุกเจ้า: ตรวจสถานะไม่ได้ ⇒ ลง `failed` และข้อความต้องบอกว่า **ไม่รู้**', async () => {
  for (const tag of ['shopee', 'tiktok', 'lazada']) {
    อาการ = { [tag]: 'อ่านไม่ได้' };
    const r = await เรียก();
    assert.ok(r.failed[tag], `${tag}: ต้องอยู่ใน failed`);
    assert.equal(r.notConnected[tag], undefined,
      `${tag}: ห้ามบอกว่ายังไม่ได้กดอนุญาต — เราไม่รู้`);
    assert.ok(/ไม่รู้ว่าเชื่อมอยู่หรือไม่/.test(r.failed[tag]),
      `${tag}: ข้อความต้องบอกว่าไม่รู้ ไม่ใช่บอกว่าล่ม`);
    assert.ok(!r.checked.includes(tag), `${tag}: ห้ามนับว่าถามได้`);
  }
});

test('⚖️ เชื่อมอยู่ปกติ ⇒ เข้า `checked` และไม่โดนจัดกองไหนเลย (พลังแยกแยะ)', async () => {
  อาการ = {};
  const r = await เรียก();
  for (const tag of ['shopee', 'tiktok', 'lazada']) {
    assert.ok(r.checked.includes(tag), `${tag}: ต้องถูกถามจริง`);
    assert.equal(r.notConnected[tag], undefined);
    assert.equal(r.failed[tag], undefined);
  }
  assert.ok(r.checked.includes('gucut'), 'เว็บเราเองต้องถูกถามเสมอ ไม่ต้องเชื่อมอะไร');
});

test('⚖️ เจ้าหนึ่งยังไม่เชื่อม อีกเจ้าตรวจไม่ได้ ⇒ สามกองแยกกันถูกต้องพร้อมกัน', async () => {
  อาการ = { shopee: 'ยังไม่เชื่อม', lazada: 'อ่านไม่ได้' };
  const r = await เรียก();
  assert.ok(r.notConnected.shopee, 'shopee ⇒ notConnected');
  assert.ok(r.failed.lazada, 'lazada ⇒ failed');
  assert.ok(r.checked.includes('tiktok'), 'tiktok ⇒ ถามได้ปกติ');
  assert.equal(r.notConnected.lazada, undefined);
  assert.equal(r.failed.shopee, undefined);
});
