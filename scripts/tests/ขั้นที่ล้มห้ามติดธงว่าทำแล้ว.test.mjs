// รัน: node --experimental-test-module-mocks --test scripts/tests/ขั้นที่ล้มห้ามติดธงว่าทำแล้ว.test.mjs
//
// 🔴 **กลไกเดียว ไม่ใช่สามบั๊ก** (ใบ B18 · t_mv4qwpgf — ส่วนของ `order-finalize.mjs`)
//    ธงกันทำซ้ำ (`steps.*`) ถูกติดเมื่อ **เดินถึงบรรทัดนั้น** ไม่ใช่เมื่อ **ทำสำเร็จ**
//    ⇒ ขั้นที่ล้มถูกตราว่าทำแล้ว ⇒ ตัวกวาดเห็นว่า "ทำแล้ว" แล้วข้าม ⇒ **ไม่มีใครกลับมาทำอีกเลย**
//    · โควตาโค้ดไม่ถูกนับ ⇒ โค้ด "N ใบแรก" ถูกใช้เกินจำนวนถาวร
//    · แต้มไม่ถูกหัก ⇒ ร้านให้ส่วนลดไปแล้ว แต่ลูกค้ายังมีแต้มเต็ม (ร้านเสียเงินหนึ่งครั้ง)
//
// 🔑 **ทำไมต้องมีไฟล์นี้ แม้โค้ดถูกแก้ไปแล้ว 4 ต.ค. 2569**
//    วัดแล้ว: `paid-recovery.test.mjs` มี 3 ข้อ และ **ไม่มีข้อไหนปลูกความล้มเหลวของขั้นย่อย**
//    ⇒ ตัวกันมีอยู่ ตาข่ายไม่มี ⇒ การแก้ครั้งถัดไปถอยกลับได้เงียบ ๆ
//    ⚠️ ตั้งชื่อไฟล์ตาม **กลไก** ไม่ใช่เลขใบ — เลขใบจะเงียบเมื่อกลไกเดิมโผล่ที่ไฟล์อื่น
//
// ⚠️ ขอบเขต: ตรวจ **ทิศของธงกับร่องรอย** ไม่ได้ตรวจว่าตัวเลขเงินถูก
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

/* สวิตช์สั่งให้แต่ละขั้น "ล้ม" ได้ทีละขั้น — ทางที่ต้องตรวจคือทางที่ของพัง */
const พัง = { โควตา: false, รายคน: false, แต้ม: false };
const นับ = { โควตา: 0, รายคน: 0, แต้ม: 0 };

mock.module('../../netlify/lib/coupons.mjs', { namedExports: {
  นับโควตาโค้ด: async () => {
    นับ.โควตา++;
    if (พัง.โควตา) throw new Error('Blobs สะดุด (จำลอง)');
  },
  นับโค้ดรายคน: async () => {
    นับ.รายคน++;
    if (พัง.รายคน) throw new Error('บัญชีลูกค้าเขียนไม่ได้ (จำลอง)');
  },
  markUsed: async () => { นับ.โควตา++; },
} });
mock.module('../../netlify/lib/points.mjs', { namedExports: {
  addPoints: async () => {
    นับ.แต้ม++;
    if (พัง.แต้ม) throw new Error('หักแต้มไม่สำเร็จ (จำลอง)');
  },
} });
mock.module('../../netlify/lib/push.mjs', { namedExports: { pushToAdmins: async () => {}, pushToUser: async () => {} } });
mock.module('../../netlify/lib/marketing.mjs', { namedExports: { sendPurchase: async () => {} } });
mock.module('../../netlify/lib/tg.mjs', { namedExports: { notifyShop: async () => ({ sent: false, why: 'ทดสอบ' }) } });
mock.module('../../netlify/lib/site.mjs', { namedExports: { SITE_URL: 'https://gucut.com' } });
mock.module('../../netlify/lib/notify-customer.mjs', { namedExports: { lineToCustomer: async () => {} } });

function fakeStore() {
  const m = new Map();
  return {
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async list() { return { blobs: [...m.keys()].map((key) => ({ key })) }; },
  };
}
const ใบ = (id, extra = {}) => ({
  id, at: Date.now(), total: 500, paymentLabel: 'Beam', couponCode: 'SAVE',
  buyerPhone: '0800000000', pointsUsed: 0,
  customer: { name: 'ทดสอบ', phone: '0800000000', address: '-', province: '-', zip: '-' },
  items: [{ title: 'ของ', qty: 1, price: 500 }], ...extra,
});
const { finalizeOrder } = await import('../../netlify/lib/order-finalize.mjs');
const usersStore = () => ({ async get() { return { phone: '0800000000' }; }, async setJSON() {} });
const zortAddOrder = async () => ({ ok: true });
const ล้าง = () => { พัง.โควตา = พัง.รายคน = พัง.แต้ม = false; นับ.โควตา = นับ.รายคน = นับ.แต้ม = 0; };

test('🔴 นับโควตาโค้ดล้ม ⇒ ห้ามติดธง steps.coupon และต้องมีร่องรอย', async () => {
  ล้าง(); พัง.โควตา = true;
  const store = fakeStore();
  await finalizeOrder({ order: ใบ('C1'), store, usersStore, buyer: null, zortAddOrder });
  const s = await store.get('o/C1');
  assert.notEqual(s.steps.coupon, true,
    'ติดธงทั้งที่นับไม่สำเร็จ = ไม่มีใครกลับมานับอีกเลย ⇒ โค้ดถูกใช้เกินโควตาถาวร');
  assert.ok(s.couponCountError, 'ต้องมีร่องรอยให้คนเห็นว่าโควตายังไม่ถูกนับ');

  /* ⚖️ **อีกครึ่งของพลังแยกแยะ** — ของปกติต้องไม่โดนร้อง */
  ล้าง();
  const ok = fakeStore();
  await finalizeOrder({ order: ใบ('C2'), store: ok, usersStore, buyer: null, zortAddOrder });
  const t = await ok.get('o/C2');
  assert.equal(t.steps.coupon, true, 'นับสำเร็จต้องติดธง');
  assert.equal(t.couponCountError, undefined, 'สำเร็จแล้วห้ามมีร่องรอยความล้มเหลวค้าง');
});

test('🔴 สองขั้นของโค้ดต้องมีธงคนละตัว — โควตาสำเร็จแต่รายคนล้ม ห้ามทำให้นับโควตาซ้ำ', async () => {
  ล้าง(); พัง.รายคน = true;
  const store = fakeStore();
  await finalizeOrder({ order: ใบ('C3'), store, usersStore, buyer: null, zortAddOrder });
  const s = await store.get('o/C3');
  assert.equal(s.steps.coupon, true, 'โควตารวมสำเร็จ ⇒ ต้องติดธงของมันเอง');
  assert.notEqual(s.steps.couponUser, true, 'ของรายคนล้ม ⇒ ธงของมันต้องยังไม่ติด');
  assert.ok(s.couponUserError, 'ต้องมีร่องรอยของขั้นที่ล้ม');

  /* 🔴 **สิ่งที่เทสข้อนี้เจอ และใหญ่กว่าที่ตั้งใจจะตรวจ** (12 ต.ค. 2569)
     ขั้น ZORT สำเร็จ ⇒ `done = true` **ทั้งที่ขั้นของรายคนยังค้าง**
     และ `finalizeOrder` มี `if (order.done) return order;` อยู่บรรทัดแรก
     ⇒ เรียกซ้ำตรง ๆ **ไม่ทำอะไรเลย** ⇒ ธงที่ไม่โกหก ≠ ใบที่ถูกกู้ */
  assert.equal(s.done, true, 'ZORT สำเร็จ ⇒ done แม้ขั้นอื่นค้าง (นี่คือจุดที่ต้องมีคนปลดธง)');
  const ก่อน = นับ.รายคน;
  พัง.รายคน = false;
  await finalizeOrder({ order: s, store, usersStore, buyer: null, zortAddOrder });
  assert.equal(นับ.รายคน, ก่อน,
    'done แล้วเรียกซ้ำต้องออกทันที — ถ้าข้อนี้แดง แปลว่ามีคนเอา `if (order.done) return` ออก');

  /* ⇒ คนที่ปลดธงคือ `beam-sweep` (เงื่อนไข `ขั้นค้าง` · มีเทสแยกที่
     `ใบที่ขั้นย่อยค้างต้องถูกกวาดกลับมา.test.mjs`) · จำลองการปลดธงแบบเดียวกัน */
  const ปลดแล้ว = { ...s, done: false, steps: { ...s.steps, notified: true } };
  const ก่อนโควตา = นับ.โควตา;
  await finalizeOrder({ order: ปลดแล้ว, store, usersStore, buyer: null, zortAddOrder });
  const หลัง = await store.get('o/C3');
  assert.equal(หลัง.steps.couponUser, true, 'ปลดธงแล้วขั้นที่ค้างต้องถูกทำให้จบ');
  assert.equal(นับ.โควตา, ก่อนโควตา,
    'และต้อง **ไม่** นับโควตารวมซ้ำ — นี่คือเหตุที่สองขั้นต้องมีธงคนละตัว');
});

test('🔴 หักแต้มล้ม ⇒ ต้องมีร่องรอย (ไม่เปลี่ยนทิศ: ยังติดธงก่อนหัก เพื่อไม่หักซ้ำ)', async () => {
  ล้าง(); พัง.แต้ม = true;
  const store = fakeStore();
  await finalizeOrder({ order: ใบ('P1', { pointsUsed: 50, pointDiscount: 50 }), store, usersStore, buyer: null, zortAddOrder });
  const s = await store.get('o/P1');
  assert.ok(s.pointsDeductFailed,
    'หักแต้มล้มแล้วเงียบ = ร้านให้ส่วนลดไปแล้วแต่ลูกค้ายังมีแต้มเต็ม และไม่มีใครรู้');
  /* ⚠️ ทิศเดิมต้องคงอยู่: ติดธงก่อนหัก (หักซ้ำแย่กว่าหักไม่ครบ) */
  assert.equal(s.steps.points, true, 'ทิศเดิมต้องไม่เปลี่ยน — ธงติดก่อนหักเพื่อกันหักซ้ำ');

  ล้าง();
  const ok = fakeStore();
  await finalizeOrder({ order: ใบ('P2', { pointsUsed: 50, pointDiscount: 50 }), store: ok, usersStore, buyer: null, zortAddOrder });
  const t = await ok.get('o/P2');
  assert.equal(t.pointsDeductFailed, undefined, 'หักสำเร็จห้ามมีร่องรอยความล้มเหลว');
  assert.equal(นับ.แต้ม, 1, 'ต้องเรียกหักแต้มจริงหนึ่งครั้ง');
});
