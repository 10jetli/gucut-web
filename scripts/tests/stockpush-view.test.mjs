// รัน: node --experimental-test-module-mocks --test scripts/tests/stockpush-view.test.mjs
// สัญญาท่อ-จอ 14 ก.ย. 2569 (t_mu0k3eo2): แผนเต็มขอได้ทีละเจ้า + ทุกคำตอบบอกขอบเขตตัวเอง
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let nDiff = 45;
mock.module('../../netlify/lib/lazada.mjs', { namedExports: {
  lazadaStockCompare: async () => ({
    day: '2026-09-14', lazadaSkus: nDiff, sameExact: 0, sameBase: 0, diffBase: 0,
    oneToManySkus: 0, oneToManyKeys: 0, missing: 0, missingSample: [],
    diff: Array.from({ length: nDiff }, (_, i) => ({ sku: `S${i}`, name: 'x', lazada: 1, core: 5 + i, matchedAs: 'ตรงตัว' })),
  }),
} });
const { stockPushView, PUSH_CAP } = await import('../../netlify/lib/stock-push.mjs');

test('โหมดตัวอย่าง: 45 แถว เห็น 25 ⇒ pushComplete ต้องเป็น false และบอกว่าชนเพดาน', async () => {
  nDiff = 45;
  const { lazada: p } = await stockPushView({ platform: 'lazada' });
  assert.equal(p.wouldPush, 45);
  assert.equal(p.push, undefined, 'โหมดปกติต้องไม่มีแผนเต็ม (ขนาดคำตอบเท่าเดิม)');
  assert.deepEqual([p.pushScope, p.pushShown, p.pushCapped, p.pushComplete], ['sample', 25, true, false]);
  assert.equal(p.pushSample.length, 25, 'ช่องเดิมต้องไม่เปลี่ยน');
});

test('full=1 เจ้าเดียว: ได้ครบ 45 แถว ⇒ pushComplete true', async () => {
  nDiff = 45;
  const { lazada: p } = await stockPushView({ platform: 'lazada', full: '1' });
  assert.equal(p.push.length, 45);
  assert.deepEqual([p.pushScope, p.pushShown, p.pushCapped, p.pushComplete], ['full', 45, false, true]);
});

test('full=1 เกินเพดาน ⇒ ตัดที่ PUSH_CAP และต้องบอกว่าไม่ครบ', async () => {
  nDiff = PUSH_CAP + 7;
  const { lazada: p } = await stockPushView({ platform: 'lazada', full: '1' });
  assert.equal(p.push.length, PUSH_CAP);
  assert.equal(p.wouldPush, PUSH_CAP + 7);
  assert.deepEqual([p.pushCapped, p.pushComplete], [true, false]);
});

test('full=1 ไม่ระบุเจ้า / all ⇒ error ไม่ส่งเงียบ ๆ · สตริง "false" ไม่นับเป็น full', async () => {
  for (const platform of [undefined, 'all', 'lazada ']) {
    const r = await stockPushView({ platform, full: '1' });
    if (platform === 'lazada ') { assert.ok(!r.error, 'ช่องว่างรอบชื่อเจ้าต้องยังใช้ได้'); continue; }
    assert.ok(r.error, `platform=${platform} ต้อง error`);
    assert.deepEqual(r.accepts.platform, ['shopee', 'lazada', 'tiktok']);
  }
  nDiff = 30;
  const { lazada: p } = await stockPushView({ platform: 'lazada', full: 'false' });
  assert.equal(p.pushScope, 'sample');
});
