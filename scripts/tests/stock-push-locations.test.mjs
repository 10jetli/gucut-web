// รัน: node --experimental-test-module-mocks --test scripts/tests/stock-push-locations.test.mjs
// 17 ก.ย. 2569 · gucut2 — ตัวอ่าน Shopee/TikTok เก็บแค่ sku ไม่มีที่อยู่ให้ตัวยิง ⇒ เพิ่มที่อยู่
// 🔴 สิ่งที่เฝ้า: รหัสเดียวหลายที่อยู่ต้องเก็บครบ (ตัวยิงจะปฏิเสธ) · แผนตัดเหลือเฉพาะรหัสที่จะยิง · ไม่มีที่อยู่ = null ไม่ใช่ {}
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('../../netlify/lib/coredb.mjs', { namedExports: { coreQuery: async () => [], coreReady: () => true } });
const { ที่อยู่เฉพาะแผน } = await import('../../netlify/lib/stock-push.mjs');
const { collectTiktokStock } = await import('../../netlify/lib/tiktok-stock.mjs');
const { ที่อยู่ของรหัส } = await import('../../netlify/lib/shopee-stock.mjs');

test('ที่อยู่ของรหัส: รหัสเดียวหลายที่อยู่เก็บครบ · ข้ามแถวไม่มีรหัส', () => {
  const r = ที่อยู่ของรหัส(
    [{ sku: 'A', itemId: 1, modelId: 11 }, { sku: 'A', itemId: 2, modelId: 0 }, { sku: '', itemId: 3 }, { sku: 'B', itemId: 4, modelId: 41 }],
    (x) => ({ itemId: x.itemId, modelId: x.modelId })
  );
  assert.deepEqual(r.A, [{ itemId: 1, modelId: 11 }, { itemId: 2, modelId: 0 }]);
  assert.deepEqual(Object.keys(r).sort(), ['A', 'B']);
});

test('ที่อยู่เฉพาะแผน: เหลือเฉพาะรหัสที่จะยิง · ไม่มีข้อมูล ⇒ null', () => {
  const loc = { A: [{ itemId: 1 }], B: [{ itemId: 2 }], C: [{ itemId: 3 }] };
  assert.deepEqual(ที่อยู่เฉพาะแผน(loc, [{ sku: 'B' }, { sku: 'Z' }]), { B: [{ itemId: 2 }] });
  assert.equal(ที่อยู่เฉพาะแผน(undefined, [{ sku: 'B' }]), null);
});

test('TikTok: แถวพก product_id · sku id · คลังทุกคลัง', async () => {
  const got = await collectTiktokStock(async () => ({ data: { total_count: 1, products: [{
    id: 'P9', title: 'x',
    skus: [{ id: 'S1', seller_sku: 'A', inventory: [{ warehouse_id: 'W1', quantity: 3 }, { warehouse_id: 'W2', quantity: 2 }] }],
  }] } }));
  assert.equal(got.rows[0].qty, 5);
  assert.equal(got.rows[0].productId, 'P9');
  assert.equal(got.rows[0].skuId, 'S1');
  assert.deepEqual(got.rows[0].warehouses, ['W1', 'W2']);
});
