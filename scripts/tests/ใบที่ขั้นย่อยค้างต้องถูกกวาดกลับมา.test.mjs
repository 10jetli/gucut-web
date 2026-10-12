// รัน: node --experimental-test-module-mocks --test scripts/tests/ใบที่ขั้นย่อยค้างต้องถูกกวาดกลับมา.test.mjs
//
// 🔴 **ชั้นที่ห้าของบั๊ก B18** (เจอ 12 ต.ค. 2569 จากเทสที่ปลูกความล้มเหลวของขั้นย่อย)
//    4 ต.ค. แก้ให้ `steps.coupon` ติดธง **เฉพาะเมื่อนับสำเร็จ** — ถูกแล้ว
//    แต่ `done` ถูกตั้งจาก `steps.zort` อย่างเดียว ⇒ ใบที่ ZORT เข้าแต่นับโควตาล้ม
//    ได้ `done:true` + `couponCountError` ⇒ `finalizeOrder` มี `if (order.done) return`
//    และ `beam-sweep` ข้ามทุกใบที่ `done` (เว้น ZORT ถูกปฏิเสธ)
//    ⇒ **ไม่มีใครกลับมานับโควตาอีกเลย** ⇒ โค้ด "N ใบแรก" ถูกใช้เกินจำนวนถาวร
//    🔑 ธงที่ไม่โกหก ≠ ใบที่ถูกกู้ — การแก้เมื่อ 4 ต.ค. ได้แค่ข้อแรก
//
// ⚠️ ขอบเขต: ตรวจ **การตัดสินใจหยิบใบกลับมา** ไม่ได้ตรวจว่านับโควตาถูกต้อง
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let ใบทั้งหมด = {};
const เรียกกู้ = [];
mock.module('@netlify/blobs', { namedExports: {
  getStore: () => ({
    async list() { return { blobs: Object.keys(ใบทั้งหมด).map((key) => ({ key })) }; },
    async get(k) { return ใบทั้งหมด[k] ? JSON.parse(JSON.stringify(ใบทั้งหมด[k])) : null; },
    async setJSON(k, v) { ใบทั้งหมด[k] = v; },
  }),
} });
mock.module('../../netlify/lib/beam.mjs', { namedExports: {
  chargePaid: () => false, getCharge: async () => ({}),
} });
mock.module('../../netlify/functions/orders.mjs', { namedExports: {
  markOrderPaid: async (o) => { เรียกกู้.push(o.id); },
} });

const { sweepBeamOrders } = await import('../../netlify/lib/beam-sweep.mjs');

const ใบ = (extra = {}) => ({
  id: 'X', at: Date.now(), paid: true, done: true,
  couponCode: 'SAVE', steps: { zort: true, coupon: true, couponUser: true, notified: true },
  zort: { ok: true }, ...extra,
});
const ตั้งใบ = (o) => { ใบทั้งหมด = { [`o/${o.id}`]: o }; เรียกกู้.length = 0; };

test('🔴 นับโควตาโค้ดค้าง (มี couponCountError) ⇒ ต้องถูกหยิบกลับมาทำ', async () => {
  ตั้งใบ(ใบ({ id: 'A', steps: { zort: true, coupon: false, couponUser: true, notified: true },
    couponCountError: 'Blobs สะดุด' }));
  const r = await sweepBeamOrders();
  assert.deepEqual(เรียกกู้, ['A'], 'ใบที่ขั้นย่อยค้างต้องถูกเรียกกู้');
  assert.ok(r.repaired.includes('A'), 'ต้องรายงานว่าปลดธงใบไหน ไม่ใช่กู้เงียบ ๆ');
  assert.equal(ใบทั้งหมด['o/A'].steps.zort, true, 'ห้ามปลดธง ZORT — ส่งซ้ำ = เอกสารซ้ำ');
  assert.equal(ใบทั้งหมด['o/A'].steps.notified, true, 'ห้ามเด้งแจ้งเตือนซ้ำ');
});

test('🔴 ขั้นของรายคนค้าง (couponUserError) ⇒ ต้องถูกหยิบกลับมาด้วย', async () => {
  ตั้งใบ(ใบ({ id: 'B', steps: { zort: true, coupon: true, couponUser: false, notified: true },
    couponUserError: 'เขียนบัญชีไม่ได้' }));
  await sweepBeamOrders();
  assert.deepEqual(เรียกกู้, ['B']);
});

test('⚖️ ใบที่ครบทุกขั้น ⇒ ต้องไม่ถูกหยิบ (ไม่งั้นวนฟรีทุกครึ่งชั่วโมงทุกใบ)', async () => {
  ตั้งใบ(ใบ({ id: 'C' }));
  await sweepBeamOrders();
  assert.deepEqual(เรียกกู้, [], 'ใบปกติห้ามถูกกู้');
});

test('⚖️ หักแต้มล้ม **ต้องไม่** ถูกหยิบ — ขั้นนั้นติดธงก่อนหักโดยตั้งใจ ⇒ กลับมาก็ไม่ทำอะไร', async () => {
  ตั้งใบ(ใบ({ id: 'D', pointsUsed: 50, steps: { zort: true, coupon: true, couponUser: true, points: true, notified: true },
    pointsDeductFailed: 'หักไม่สำเร็จ' }));
  await sweepBeamOrders();
  assert.deepEqual(เรียกกู้, [],
    'ร่องรอยนี้มีไว้ให้คนเห็น ไม่ใช่ให้ตัวกวาดลองใหม่ — หยิบมาก็วนฟรี');
});

test('⏱️ เพดาน: ลองครบ 12 รอบแล้วต้องหยุดวน (กันถังพังยาวแล้วเผาเครดิตจนครบหน้าต่าง 3 วัน)', async () => {
  ตั้งใบ(ใบ({ id: 'E', stepTries: 12, steps: { zort: true, coupon: false, couponUser: true, notified: true },
    couponCountError: 'Blobs สะดุด' }));
  await sweepBeamOrders();
  assert.deepEqual(เรียกกู้, [], 'ครบเพดานแล้วต้องเลิกวน');

  /* ตัวควบคุมของเพดาน: ต่ำกว่าเพดานหนึ่งรอบ ⇒ ยังต้องวน
     (ไม่มีข้อนี้ เพดานที่ตั้งเป็น 0 ก็ "ผ่าน" ได้) */
  ตั้งใบ(ใบ({ id: 'F', stepTries: 11, steps: { zort: true, coupon: false, couponUser: true, notified: true },
    couponCountError: 'Blobs สะดุด' }));
  await sweepBeamOrders();
  assert.deepEqual(เรียกกู้, ['F'], 'ต่ำกว่าเพดานต้องยังวน');
  assert.equal(ใบทั้งหมด['o/F'].stepTries, 12, 'ต้องนับครั้งเพิ่มทุกรอบ ไม่งั้นเพดานไม่มีผล');
});

test('⚖️ ใบที่ยังไม่ done และขั้นค้าง ⇒ ถูกกู้ตามปกติ (ไม่เกี่ยวกับธงใหม่)', async () => {
  ตั้งใบ(ใบ({ id: 'G', done: false, steps: { zort: true, coupon: false, couponUser: true, notified: true } }));
  await sweepBeamOrders();
  assert.deepEqual(เรียกกู้, ['G']);
  assert.equal(ใบทั้งหมด['o/G'].stepTries, undefined,
    'ใบที่ยังไม่ done ไม่ต้องนับ stepTries — มันเข้าทางปกติอยู่แล้ว');
});
