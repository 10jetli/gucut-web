// 🔓 ท่านประธานสั่งเปิดดันสต็อก "ทิศลง" อัตโนมัติ 18 ก.ย. 2569
//
// 🔴 ทำไมต้องมีเทสชุดนี้: ทิศลงคือการ **ลดสต็อกบนหน้าร้านมาร์เก็ตเพลส**
//    ทิศขึ้นผิดอย่างมากคือขายช้า · ทิศลงผิดคือ **สินค้าหายจากหน้าร้าน ขายไม่ได้เลย**
//    ⇒ ของที่แตะเงินจริงต้องมีเทสที่พิสูจน์ทั้ง "เปิดแล้วทำงาน" และ "เพดานกันความเสียหายจริง"
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const ยิง = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async () => [],
} });
/* แผน: ทิศขึ้น 2 · ทิศลง 100 (close 1 + down 99) — มากกว่าเพดานโดยตั้งใจ */
const แผน = () => ({
  push: [
    { sku: 'UP1', from: 1, to: 5, kind: 'up' },
    { sku: 'UP2', from: 2, to: 9, kind: 'up' },
    { sku: 'CL1', from: 7, to: 0, kind: 'close' },
    ...Array.from({ length: 99 }, (_, i) => ({ sku: `DN${i}`, from: 9, to: 1, kind: 'down' })),
  ],
  skipNegativeFull: [], skipUnknownFull: [], skipConflictFull: [],
});
mock.module('../../netlify/lib/stock-push.mjs', { namedExports: {
  stockPushDryRun: async ({ platform = 'lazada' } = {}) => ({ [platform]: แผน() }),
} });
mock.module('../../netlify/lib/stock-push-live.mjs', { namedExports: {
  stockPushLive: async (body) => (ยิง.push(body), {
    fired: body.skus.length, pushed: body.skus.length, rejected: 0, notSent: 0,
    results: body.skus.map((sku) => ({ sku, to: 1, result: 'pushed' })),
  }),
} });
mock.module('../../netlify/lib/stock-push-shopee.mjs', { namedExports: { shopeePushLive: async () => ({ results: [] }) } });
mock.module('../../netlify/lib/stock-push-tiktok.mjs', { namedExports: { tiktokPushLive: async () => ({ results: [] }) } });

const { กวาดดันสต็อก } = await import('../../netlify/lib/stock-push-sweep.mjs');
const รหัสที่ยิง = () => ยิง.flatMap((b) => b.skus);

test('ค่าเริ่มต้น = เปิดทิศลง ⇒ ส่ง allowClose:true และรหัสทิศลงถูกส่งไปจริง', async () => {
  ยิง.length = 0; delete process.env.STOCK_PUSH_ALLOW_CLOSE; delete process.env.STOCK_PUSH_CLOSE_CAP;
  const r = await กวาดดันสต็อก({ platform: 'lazada', force: true });
  assert.equal(r.ok, true);
  assert.ok(ยิง.length > 0, 'ต้องมีการยิง');
  assert.ok(ยิง.every((b) => b.allowClose === true), 'ทุกก้อนต้องส่ง allowClose:true');
  assert.ok(รหัสที่ยิง().some((s) => s.startsWith('DN')), 'ต้องมีรหัสทิศลงถูกส่งไป');
  assert.equal(r.เปิดทิศลง, true);
});

test('🔴 เพดานทิศลงต่อรอบต้องกันจริง — ทิศลง 100 เพดาน 40 ⇒ ส่งแค่ 40 ที่เหลือรอรอบหน้า', async () => {
  ยิง.length = 0; process.env.STOCK_PUSH_CLOSE_CAP = '40';
  await กวาดดันสต็อก({ platform: 'lazada', force: true });
  const ลง = รหัสที่ยิง().filter((s) => s.startsWith('DN') || s.startsWith('CL'));
  assert.equal(ลง.length, 40, `ต้องส่งทิศลง 40 รหัส ได้ ${ลง.length}`);
  // ทิศขึ้นต้องไม่ถูกเพดานทิศลงกิน
  const ขึ้น = รหัสที่ยิง().filter((s) => s.startsWith('UP'));
  assert.equal(ขึ้น.length, 2, 'ทิศขึ้นต้องถูกส่งครบ ไม่ถูกเพดานทิศลงกิน');
  delete process.env.STOCK_PUSH_CLOSE_CAP;
});

test('ปิดฉุกเฉินด้วย env=0 ⇒ ไม่ส่งรหัสทิศลงเลย และ allowClose:false', async () => {
  ยิง.length = 0; process.env.STOCK_PUSH_ALLOW_CLOSE = '0';
  await กวาดดันสต็อก({ platform: 'lazada', force: true });
  const ลง = รหัสที่ยิง().filter((s) => s.startsWith('DN') || s.startsWith('CL'));
  assert.equal(ลง.length, 0, 'ปิดแล้วต้องไม่ส่งทิศลงสักรหัส');
  assert.ok(ยิง.every((b) => b.allowClose === false), 'ต้องส่ง allowClose:false');
  assert.ok(รหัสที่ยิง().filter((s) => s.startsWith('UP')).length === 2, 'ทิศขึ้นต้องยังทำงานปกติ');
  delete process.env.STOCK_PUSH_ALLOW_CLOSE;
});

/* 🧪 ตัวควบคุม: เพดาน 1 ⇒ ต้องส่งทิศลงแค่ 1 (พิสูจน์ว่าเลขเพดานมีผลจริง ไม่ใช่บังเอิญ 40) */
test('เพดาน 1 ⇒ ส่งทิศลง 1 รหัส (เลขเพดานมีผลจริง)', async () => {
  ยิง.length = 0; process.env.STOCK_PUSH_CLOSE_CAP = '1';
  await กวาดดันสต็อก({ platform: 'lazada', force: true });
  assert.equal(รหัสที่ยิง().filter((s) => s.startsWith('DN') || s.startsWith('CL')).length, 1);
  delete process.env.STOCK_PUSH_CLOSE_CAP;
});

/* 📌 ท่านประธานติ๊กสั่งใบ t_mu6n1adh — ทิศลงที่ไม่ได้ยิงต้องมีตัวตนในสมุด
   🔴 ก่อนหน้านี้ไม่ถูกบันทึกเลย ⇒ ตัวนับบนจอพาคนไปหาบั๊กที่ไม่มีอยู่
   และต้องแยกสองเหตุ: policy_down (สวิตช์ปิด) vs cap_wait (เกินเพดาน) — คนละการลงมือ */
const แถวที่เขียน = [];
test('เกินเพดาน ⇒ ทิศลงที่รอต้องถูกบันทึกเป็น cap_wait (ไม่ใช่หายไปเงียบ)', async () => {
  ยิง.length = 0; แถวที่เขียน.length = 0;
  process.env.STOCK_PUSH_CLOSE_CAP = '5';
  delete process.env.STOCK_PUSH_ALLOW_CLOSE;
  const r = await กวาดดันสต็อก({ platform: 'lazada', force: true });
  assert.equal(r.ok, true);
  // ยิงทิศลง 5 · ที่เหลือ 95 ต้องรอรอบหน้า และตัวเลขต้องบอกออกมา
  assert.equal(r.ทิศลงที่ยิงรอบนี้, 5);
  assert.equal(r.ทิศลงที่รอรอบหน้า, 95);
  delete process.env.STOCK_PUSH_CLOSE_CAP;
});

test('ปิดสวิตช์ ⇒ เหตุต้องเป็น policy_down ไม่ใช่ cap_wait (คนละการลงมือ)', async () => {
  ยิง.length = 0;
  process.env.STOCK_PUSH_ALLOW_CLOSE = '0';
  const r = await กวาดดันสต็อก({ platform: 'lazada', force: true });
  assert.equal(r.ทิศลงที่ยิงรอบนี้, 0);
  assert.equal(r.ทิศลงที่รอรอบหน้า, 100, 'ปิดแล้วทั้ง 100 รหัสต้องถูกนับว่ารอ');
  delete process.env.STOCK_PUSH_ALLOW_CLOSE;
});
