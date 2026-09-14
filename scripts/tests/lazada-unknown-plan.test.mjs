// รัน: node --experimental-test-module-mocks --test scripts/tests/lazada-unknown-plan.test.mjs
// งานกระดาน t_mu0k3eo2: แผน Lazada ต้องมีกอง "คลังไม่รู้จัก" ครบ (เดิม skipUnknown 10 แต่ตัวอย่าง 0)
// ⚠️ เส้นนี้แตะแผนที่ตัวยิงจริงใช้ ⇒ ข้อที่สำคัญสุดคือรหัสไม่รู้จัก **ห้ามหลุดเข้า push**
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const unknownSkus = ['LZ-GHOST-1', 'LZ-GHOST-2', 'LZ-GHOST-3'];
mock.module('../../netlify/lib/lazada.mjs', { namedExports: {
  lazadaStockCompare: async (o) => {
    assert.equal(o.full, 1, 'ตัวคิดแผนต้องขอ full เสมอ');
    return {
      day: '2026-09-14',
      lazadaSkus: 2 + unknownSkus.length,
      sameExact: 1,
      sameBase: 0, diffBase: 0, oneToManySkus: 0, oneToManyKeys: 0,
      missing: unknownSkus.length,
      missingSample: unknownSkus.map((sku) => ({ sku, lazada: 5 })),
      diff: [{ sku: 'REAL-1', name: 'ของจริง', lazada: 2, core: 7, directQty: 7, matchedAs: 'ตรงตัว' }],
    };
  },
} });
const { stockPushDryRun } = await import('../../netlify/lib/stock-push.mjs');

test('กองคลังไม่รู้จักมีตัวอย่างและรายการเต็ม ครบตามตัวนับ', async () => {
  const { lazada: p } = await stockPushDryRun({ platform: 'lazada', full: true });
  assert.equal(p.skipUnknown, 3);
  assert.equal(p.skipUnknownSample.length, 3);
  assert.equal(p.skipUnknownFull.length, 3, 'ตัวตรวจหลังยิงเทียบความยาวนี้กับตัวนับ');
  assert.equal(p.bucketsAddUp, true);
});

test('🔴 รหัสไม่รู้จักห้ามหลุดเข้า push · ของจริงยังถูกดันตามปกติ', async () => {
  const { lazada: p } = await stockPushDryRun({ platform: 'lazada', full: true });
  const pushed = p.push.map((r) => r.sku);
  for (const s of unknownSkus) assert.ok(!pushed.includes(s), `${s} หลุดเข้า push`);
  assert.deepEqual(pushed, ['REAL-1']);
  assert.equal(p.wouldPush, 1);
});
