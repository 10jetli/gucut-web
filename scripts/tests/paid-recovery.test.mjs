// รัน: node --experimental-test-module-mocks --test scripts/tests/paid-recovery.test.mjs
// งานกระดาน t_mtxys7hn: ลูกค้าจ่ายแล้ว แต่ฟังก์ชันตายก่อนงานหลังรับเงินจบ ⇒ ต้องมีตาข่ายเก็บ และห้ามส่ง ZORT ซ้ำ
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const calls = { zort: 0, coupon: 0, points: 0, mop: [] };
mock.module('../../netlify/lib/coupons.mjs', { namedExports: { markUsed: async () => { calls.coupon++; } } });
mock.module('../../netlify/lib/points.mjs', { namedExports: { addPoints: async () => { calls.points++; } } });
mock.module('../../netlify/lib/push.mjs', { namedExports: { pushToAdmins: async () => {}, pushToUser: async () => {} } });
mock.module('../../netlify/lib/marketing.mjs', { namedExports: { sendPurchase: async () => {} } });
mock.module('../../netlify/lib/site.mjs', { namedExports: { SITE_URL: 'https://gucut.com' } });
mock.module('../../netlify/lib/notify-customer.mjs', { namedExports: { lineToCustomer: async () => {} } });

// ถังปลอม — เก็บเป็นสำเนา JSON เหมือนของจริง (ของในมือกับของในถังคนละก้อน)
function fakeStore(initial = {}) {
  const m = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  let failAfter = Infinity;
  return {
    m,
    failOnSave(n) { failAfter = n; },
    async setJSON(k, v) {
      if (failAfter-- <= 0) throw new Error('ฟังก์ชันตาย (จำลอง)');
      m.set(k, JSON.stringify(v));
    },
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async list() { return { blobs: [...m.keys()].filter((k) => k.startsWith('o/')).map((key) => ({ key })) }; },
  };
}
const order = (id, extra = {}) => ({
  id, at: Date.now(), total: 500, paymentLabel: 'Beam', couponCode: 'SAVE', pointsUsed: 0,
  customer: { name: 'ทดสอบ', phone: '0800000000', address: '-', province: '-', zip: '-' },
  items: [{ title: 'ของ', qty: 1, price: 500 }], ...extra,
});

const { finalizeOrder } = await import('../../netlify/lib/order-finalize.mjs');
const usersStore = () => ({});
const zortAddOrder = async () => { calls.zort++; return { ok: true }; };

test('ตายหลังส่ง ZORT ⇒ เรียกซ้ำต้องทำขั้นที่เหลือ และห้ามส่ง ZORT ซ้ำ', async () => {
  calls.zort = calls.coupon = 0;
  const store = fakeStore();
  store.failOnSave(2); // บันทึก #1 (หลัง ZORT) · #2 (หลังนับโค้ด) ผ่าน · #3 (ปิดงาน done) ตาย
  await assert.rejects(finalizeOrder({ order: order('A'), store, usersStore, buyer: null, zortAddOrder }));
  const saved = await store.get('o/A');
  assert.equal(saved.done, undefined, 'ตายกลางทาง ⇒ ในถังต้องยังไม่ done');
  assert.equal(saved.steps.zort, true);
  assert.equal(calls.zort, 1);

  store.failOnSave(Infinity);
  await finalizeOrder({ order: saved, store, usersStore, buyer: null, zortAddOrder });
  const after = await store.get('o/A');
  assert.equal(after.done, true);
  assert.equal(calls.zort, 1, 'ห้ามส่ง ZORT ซ้ำ');
  assert.equal(calls.coupon, 1, 'โค้ดส่วนลดต้องถูกนับหลังกู้');
});

test('ไม่รู้บัญชีผู้ซื้อ ⇒ ห้ามหักแต้มเดา แต่ต้องติดธงให้เห็น', async () => {
  calls.points = 0;
  const store = fakeStore();
  await finalizeOrder({ order: order('P', { pointsUsed: 50 }), store, usersStore, buyer: null, zortAddOrder });
  const s = await store.get('o/P');
  assert.equal(calls.points, 0);
  assert.equal(s.pointsPending, true);
});

test('ตัวกวาด: จ่ายแล้วแต่ยังไม่ done ⇒ กู้ · done แล้ว/ยกเลิก/เก่า ⇒ ข้าม', async () => {
  const old = Date.now() - 5 * 864e5;
  const store = fakeStore({
    'o/stuck': order('stuck', { paid: true }),
    'o/ok': order('ok', { paid: true, done: true }),
    'o/cancel': order('cancel', { paid: true, status: 'cancelled' }),
    'o/old': order('old', { paid: true, at: old }),
    'o/cod': order('cod'),
  });
  mock.module('@netlify/blobs', { namedExports: { getStore: () => store } });
  mock.module('../../netlify/lib/beam.mjs', { namedExports: { getCharge: async () => ({}), chargePaid: () => false } });
  mock.module('../../netlify/functions/orders.mjs', { namedExports: { markOrderPaid: async (o) => { calls.mop.push(o.id); } } });
  const { sweepBeamOrders } = await import('../../netlify/lib/beam-sweep.mjs');
  const r = await sweepBeamOrders();
  assert.deepEqual(r.recovered, ['stuck']);
  assert.deepEqual(calls.mop, ['stuck']);
});
