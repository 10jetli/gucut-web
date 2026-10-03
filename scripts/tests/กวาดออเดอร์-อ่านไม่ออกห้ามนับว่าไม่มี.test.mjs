// รัน: node --experimental-test-module-mocks --test "scripts/tests/กวาดออเดอร์-อ่านไม่ออกห้ามนับว่าไม่มี.test.mjs"
// t_musmc7an · B21 — คำตอบ 200 ที่อ่านไม่ออก/ไม่มีกล่อง ห้ามกลายเป็น "ไม่มีออเดอร์"
//
// 🔑 ใบนี้อันตรายเพราะ **ตัวที่ใช้ตัดสินว่าสำเร็จไหม พังไปทางเดียวกับปัญหา**
//    Shopee ดูช่อง `error` · TikTok ดูช่อง `code` · ทั้งคู่ "ไม่มีช่องนั้น" = ผ่านด่าน
//    ⇒ ยิ่งอ่านคำตอบไม่ออก ยิ่งดูเหมือนไม่มีความผิดพลาด
//    และ `orders: 0` เป็นคำตอบที่ **สมเหตุสมผลจริงในหลายวัน** ⇒ ไม่มีใครสงสัย
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

process.env.SHOPEE_PARTNER_ID = '123456';
process.env.SHOPEE_PARTNER_KEY = 'คีย์ทดสอบ';
process.env.TIKTOK_APP_KEY = 'appkey';
process.env.TIKTOK_APP_SECRET = 'secret';

const ไกล = Math.floor(Date.now() / 1000) + 99999;
const โทเคน = new Map([
  ['token', { accessToken: 'A', refreshToken: 'R', shopId: 1, expireAt: ไกล, shopCipher: 'C' }],
]);
mock.module('@netlify/blobs', {
  namedExports: {
    getStore: () => ({
      get: async (k) => (โทเคน.has(k) ? structuredClone(โทเคน.get(k)) : null),
      setJSON: async (k, v) => โทเคน.set(k, structuredClone(v)),
      set: async (k, v) => โทเคน.set(k, v),
      delete: async (k) => โทเคน.delete(k),
      list: async () => ({ blobs: [...โทเคน.keys()].map((key) => ({ key })) }),
    }),
  },
});
/* ไม่แตะฐานข้อมูลจริง — ใบนี้วัดแค่ "กวาดแล้วสรุปว่าอะไร"
   ⚠️ `coreQuery` คืน **อาร์เรย์ของแถวตรง ๆ** ไม่ใช่ก้อน `{results}` — ผู้เรียกทำ `.map` ทันที
      (ม็อกที่คืน `{results: []}` ทำให้ตก `.map is not a function` ซึ่งไม่เกี่ยวกับใบนี้เลย
       คลาสเดิมที่ทีมเคยเจอ: ไฟล์ที่อ่าน `.results` ได้ 0 แถวเงียบ ๆ แล้วตอบ 200) */
mock.module('../../netlify/lib/coredb.mjs', {
  namedExports: { coreReady: () => true, coreQuery: async () => [] },
});

// คิวคำตอบปลอมของ fetch — body === undefined หมายถึง "แกะ JSON ไม่ได้"
const คิว = [];
globalThis.fetch = async () => {
  const ตัว = คิว.shift() ?? { body: '{}' };
  return {
    status: ตัว.status ?? 200,
    ok: (ตัว.status ?? 200) < 400,
    json: async () => {
      if (ตัว.body === undefined) throw new SyntaxError('แกะ JSON ไม่ได้ (จำลอง)');
      return JSON.parse(ตัว.body);
    },
    text: async () => (ตัว.body === undefined ? '<html>502 Bad Gateway</html>' : ตัว.body),
  };
};

const { syncShopeeOrders } = await import('../../netlify/lib/shopee-orders.mjs');
const { syncTiktokOrders } = await import('../../netlify/lib/tiktok-orders.mjs');

const ป้อน = (...xs) => { คิว.length = 0; คิว.push(...xs); };

/* ───────── Shopee ───────── */

test('B21 Shopee ตอบ 200 แต่แกะ JSON ไม่ได้: ต้องโยน ไม่ใช่ orders:0', async () => {
  ป้อน({ body: undefined });
  await assert.rejects(
    () => syncShopeeOrders(3),
    /แกะ JSON ไม่ได้|ไม่รู้/,
    'ของเดิมได้ {} ⇒ ไม่มีช่อง error ⇒ ผ่านด่าน ⇒ รายงานว่ากวาดสำเร็จ 0 ใบ',
  );
});

test('B21 Shopee ตอบสำเร็จแต่ไม่มีกล่อง response: ต้องโยน', async () => {
  ป้อน({ body: JSON.stringify({ error: '', message: '' }) });
  await assert.rejects(() => syncShopeeOrders(3), /ไม่มีกล่อง response/);
});

test('B21 Shopee บอกว่ายังมีหน้าต่อ แต่หน้าถัดไปไม่มี order_list: ต้องโยน', async () => {
  ป้อน(
    { body: JSON.stringify({ response: { order_list: [{ order_sn: 'S1' }], more: true, next_cursor: 'c2' } }) },
    { body: JSON.stringify({ response: { more: false } }) },
  );
  await assert.rejects(() => syncShopeeOrders(3), /หน้า 2 ไม่มีช่อง order_list/);
});

test('B21 Shopee คืนรายละเอียดน้อยกว่าที่ถาม: ต้องโยน (ห้ามเอากองที่ขาดไปใช้เป็นของครบ)', async () => {
  ป้อน(
    { body: JSON.stringify({ response: { order_list: [{ order_sn: 'S1' }, { order_sn: 'S2' }], more: false } }) },
    { body: JSON.stringify({ response: { order_list: [{ order_sn: 'S1', order_status: 'READY' }] } }) },
  );
  await assert.rejects(() => syncShopeeOrders(3), /ขาด 1 ใบ/);
});

test('B21 Shopee ไม่คืน order_list ตอนถามรายละเอียด: ต้องโยน', async () => {
  ป้อน(
    { body: JSON.stringify({ response: { order_list: [{ order_sn: 'S1' }], more: false } }) },
    { body: JSON.stringify({ response: {} }) },
  );
  await assert.rejects(() => syncShopeeOrders(3), /ไม่คืน order_list ทั้งที่ถามรายละเอียดไป/);
});

test('ตัวควบคุมลบ: Shopee บอกว่าไม่มีออเดอร์จริง (order_list ว่าง) ⇒ orders:0 **ไม่โยน**', async () => {
  ป้อน({ body: JSON.stringify({ response: { order_list: [], more: false } }) });
  const ผล = await syncShopeeOrders(3);
  assert.equal(ผล.orders, 0, 'ว่างจริงต้องยังตอบ 0 ได้ — ไม่งั้นแดงลวงทุกวันที่ร้านไม่มีออเดอร์');
});

test('ตัวควบคุมลบ: Shopee ส่งของครบตามที่ถาม ⇒ สำเร็จ ไม่โยน', async () => {
  ป้อน(
    { body: JSON.stringify({ response: { order_list: [{ order_sn: 'S1' }], more: false } }) },
    { body: JSON.stringify({ response: { order_list: [{ order_sn: 'S1', order_status: 'READY', total_amount: 100, create_time: 1700000000, item_list: [] }] } }) },
  );
  const ผล = await syncShopeeOrders(3);
  assert.equal(ผล.orders, 1);
});

/* ───────── TikTok — รูปเดียวกันเป๊ะ ───────── */

test('B21 TikTok ตอบ 200 แต่แกะ JSON ไม่ได้: ต้องโยน ไม่ใช่ orders:0', async () => {
  ป้อน({ body: undefined });
  await assert.rejects(() => syncTiktokOrders(3), /แกะ JSON ไม่ได้|ไม่รู้/);
});

test('B21 TikTok ตอบสำเร็จแต่ไม่มีกล่อง data: ต้องโยน', async () => {
  ป้อน({ body: JSON.stringify({ code: 0, message: 'success' }) });
  await assert.rejects(() => syncTiktokOrders(3), /ไม่มีกล่อง data/);
});

test('B21 TikTok หน้าแรกไม่มีช่อง data.orders: ยังตอบ 0 ได้ **แต่ต้องโผล่ใน unmapped**', async () => {
  ป้อน({ body: JSON.stringify({ code: 0, data: { next_page_token: '' } }) });
  const ผล = await syncTiktokOrders(3);
  assert.equal(ผล.orders, 0);
  assert.ok(
    (ผล.unmapped || []).includes('data.orders'),
    'ของเดิมเงียบสนิท — 0 ที่ไม่มีหมายเหตุ แยกจาก 0 ที่แปลว่าไม่มีออเดอร์ไม่ได้',
  );
});

test('ตัวควบคุมลบ: TikTok บอกว่าไม่มีออเดอร์จริง (orders ว่าง) ⇒ orders:0 และ **ไม่มีหมายเหตุ**', async () => {
  ป้อน({ body: JSON.stringify({ code: 0, data: { orders: [], next_page_token: '' } }) });
  const ผล = await syncTiktokOrders(3);
  assert.equal(ผล.orders, 0);
  assert.ok(!(ผล.unmapped || []).includes('data.orders'), 'ว่างจริงห้ามถูกรายงานว่าอ่านไม่ได้');
});
