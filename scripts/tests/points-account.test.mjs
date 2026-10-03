// รัน: node --experimental-test-module-mocks --test scripts/tests/points-account.test.mjs
// งานกระดาน t_mtxys8je: แต้มต้องหักจาก "คนที่แลกตอนสั่ง" เสมอ ไม่ใช่คนที่มายืนยันเงินเข้า
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const seen = { points: [], coupon: [], couponQuota: 0 };
/* B18 (4 ต.ค. 2569): แยกเป็นสองขั้น — ขั้นที่รับ `user` คือ `นับโค้ดรายคน`
   จึงเป็นขั้นที่ใบนี้ต้องเฝ้า (ตรวจว่าใช้บัญชีผู้ซื้อที่จดไว้ ไม่ใช่คุกกี้ของคำขอ) */
mock.module('../../netlify/lib/coupons.mjs', { namedExports: {
  นับโควตาโค้ด: async () => { seen.couponQuota++; },
  นับโค้ดรายคน: async (code, user) => { seen.coupon.push(user?.phone ?? null); },
  markUsed: async (code, user) => { seen.coupon.push(user?.phone ?? null); },
} });
mock.module('../../netlify/lib/points.mjs', { namedExports: { addPoints: async (_s, phone, n) => { seen.points.push([phone, n]); } } });
mock.module('../../netlify/lib/push.mjs', { namedExports: { pushToAdmins: async () => {}, pushToUser: async () => {} } });
mock.module('../../netlify/lib/marketing.mjs', { namedExports: { sendPurchase: async () => {} } });
mock.module('../../netlify/lib/tg.mjs', { namedExports: { notifyShop: async () => ({ sent: false, why: 'ทดสอบ' }) } });
mock.module('../../netlify/lib/site.mjs', { namedExports: { SITE_URL: 'https://gucut.com' } });
mock.module('../../netlify/lib/notify-customer.mjs', { namedExports: { lineToCustomer: async () => {} } });
const { finalizeOrder } = await import('../../netlify/lib/order-finalize.mjs');

const store = () => { const m = new Map(); return { setJSON: async (k, v) => m.set(k, JSON.stringify(v)) }; };
const base = (extra) => ({
  id: 'X' + Math.random(), total: 400, paymentLabel: 'Beam', couponCode: 'SAVE', pointsUsed: 30, pointDiscount: 30,
  customer: { name: 'ผู้ซื้อ', phone: '0811111111', address: '-', province: '-', zip: '-' },
  items: [{ title: 'ของ', qty: 1, price: 430 }], ...extra,
});
const run = (order, buyer) => finalizeOrder({ order, store: store(), usersStore: () => ({}), buyer, zortAddOrder: async () => ({ ok: true }) });
const reset = () => { seen.points = []; seen.coupon = []; seen.couponQuota = 0; };

test('คนอื่นเปิดลิงก์เช็คสถานะขณะล็อกอิน ⇒ ต้องหักคนที่แลกตอนสั่ง ไม่ใช่คนเปิดลิงก์', async () => {
  reset();
  await run(base({ buyerPhone: '0811111111' }), { phone: '0999999999' });
  assert.deepEqual(seen.points, [['0811111111', -30]]);
  assert.deepEqual(seen.coupon, ['0811111111']);
});

test('webhook ของ Beam ไม่มีคุกกี้ ⇒ ยังต้องหักแต้ม (เดิมไม่หักเลย)', async () => {
  reset();
  const o = base({ buyerPhone: '0811111111' });
  await run(o, null);
  assert.deepEqual(seen.points, [['0811111111', -30]]);
  assert.equal(o.pointsPending, undefined);
});

test('ใบเก่าไม่มี buyerPhone ⇒ ห้ามหักจากคนที่มายืนยัน ติดธงแทน', async () => {
  reset();
  const o = base({});
  await run(o, { phone: '0999999999' });
  assert.deepEqual(seen.points, []);
  assert.equal(o.pointsPending, true);
  /* B18 (4 ต.ค. 2569): `markUsed` ถูกแยกเป็น `นับโควตาโค้ด` + `นับโค้ดรายคน`
     ⇒ เกณฑ์เดิม `seen.coupon === [null]` ("เรียกขั้นรายคนด้วย user = null") วัดไม่ได้แล้ว
     ⇒ เขียนเกณฑ์ใหม่ที่ **แรงกว่าเดิม** และตรงเจตนาของใบนี้มากกว่า:
        โควตารวมต้องถูกนับจริง 1 ครั้ง · และขั้นที่ผูกกับคน **ต้องไม่ถูกเรียกเลย**
        (เดิมถูกเรียกด้วย null ซึ่งพึ่งว่าข้างในจะไม่ทำอะไร — ตอนนี้ไม่ต้องพึ่ง) */
  assert.equal(seen.couponQuota, 1, 'โควตารวมของโค้ดต้องยังถูกนับ');
  assert.deepEqual(seen.coupon, [], 'ห้ามผูกการใช้โค้ดกับคนที่มาเปิดลิงก์ยืนยัน');
});
