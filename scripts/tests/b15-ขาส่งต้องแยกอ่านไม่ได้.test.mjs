// รัน: node --experimental-test-module-mocks --test scripts/tests/b15-ขาส่งต้องแยกอ่านไม่ได้.test.mjs
//
// 🔴 **B15 ภาคสอง (12 ต.ค. 2569 · gucut2)** — รากแก้ไปแล้ว 3 ต.ค. แต่รูอยู่คนละทิศ
//    ราก  = ทางเขียนใช้ค่าเริ่มต้นไปทับของจริง ⇒ โทเคนที่ตั้งไว้หาย
//    รูนี้ = **ทางส่ง** ใช้ค่าเริ่มต้น ⇒ on/pixelId/token ว่าง ⇒ ไม่ส่งอะไรเลยเงียบ ๆ
//           และ `sendPurchase` คืน `{}` ซึ่ง **หน้าตาเหมือน "ร้านปิดการตลาดไว้เอง" เป๊ะ**
//    ⇒ Blobs สะดุดตอนลูกค้าจ่ายเงิน = ยอดขายไม่ถูกส่งเข้า Meta/TikTok และไม่มีใครรู้
//
// ⚠️ ตัวควบคุมสองทิศ:
//    · ควรจับ    = อ่านค่าไม่ได้ ⇒ ต้องมีเหตุติดมากับผล ไม่ใช่ก้อนว่าง
//    · ต้องไม่จับ = ร้านปิดไว้เอง ⇒ ต้องยังเป็นก้อนว่างตามเดิม (ห้ามร้องเป็นความผิดพลาด)
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const สร้างstore = (พัง) => ({
  get: async () => { if (พัง) throw new Error('blobs ล่มจำลอง'); return สร้างstore.ค่า; },
  setJSON: async () => {},
});
let พังอยู่ = false;
const ค่าในฐาน = { meta: { on: true, pixelId: 'PX1', token: 'TK1' } };
mock.module('@netlify/blobs', {
  namedExports: {
    getStore: () => ({
      get: async () => { if (พังอยู่) throw new Error('blobs ล่มจำลอง'); return ค่าในฐาน; },
      setJSON: async () => {},
    }),
  },
});

const { readMarketing, sendPurchase } = await import('../../netlify/lib/marketing.mjs');

test('ควรจับ: อ่านค่าตั้งค่าไม่ได้ ⇒ ติดธง unknown และบอกเหตุ ไม่ใช่เงียบ', async () => {
  พังอยู่ = true;
  const cfg = await readMarketing();
  assert.equal(cfg.unknown, true, 'อ่านไม่ได้ต้องติดธง');
  const out = await sendPurchase({ id: 'O1', total: 100, items: [], customer: {} });
  assert.ok(out['ไม่ได้ส่ง'], 'ต้องมีเหตุติดมากับผล');
  assert.match(out['ไม่ได้ส่ง'], /ไม่ใช่ว่าร้านปิดไว้/, 'เหตุต้องแยกสองกรณีให้คนอ่านออก');
});

test('ต้องไม่จับ: ร้านปิดการตลาดไว้เอง ⇒ ยังเป็นก้อนว่างตามเดิม', async () => {
  พังอยู่ = false;
  ค่าในฐาน.meta = { on: false, pixelId: '', token: '' };
  const cfg = await readMarketing();
  assert.equal(cfg.unknown, false, 'อ่านได้ ⇒ ธงต้องเป็น false ไม่ใช่ undefined');
  const out = await sendPurchase({ id: 'O2', total: 100, items: [], customer: {} });
  assert.equal(out['ไม่ได้ส่ง'], undefined, 'ปิดไว้เองไม่ใช่ความผิดพลาด ห้ามติดเหตุ');
  assert.deepEqual(Object.keys(out), [], 'ยังเป็นก้อนว่างเหมือนเดิม');
});

test('ธง unknown ต้องเป็น boolean เสมอ — ไม่ใช่ undefined ตอนอ่านได้', async () => {
  /* 🔑 ช่องที่บางครั้งไม่มี ทำให้คนเขียนฝั่งอ่านต้องเดาว่า undefined แปลว่าอะไร
     ⇒ อ่านได้ = false · อ่านไม่ได้ = true · ไม่มีสถานะที่สาม */
  พังอยู่ = false;
  ค่าในฐาน.meta = { on: true, pixelId: 'PX1', token: 'TK1' };
  assert.equal(typeof (await readMarketing()).unknown, 'boolean');
  พังอยู่ = true;
  assert.equal(typeof (await readMarketing()).unknown, 'boolean');
});
