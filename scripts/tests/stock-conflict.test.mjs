// รัน: node --experimental-test-module-mocks --test scripts/tests/stock-conflict.test.mjs
// ใช้ตัวเทียบ → ตัววางแผน → ตัวตรวจผลจริง แทนเฉพาะ D1/แพลตฟอร์ม/Blobs ด้วย fixture
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const fixtures = [
  { sku: '03409-3', direct: -5, base: 1509, per: 3 },
  { sku: 'bundle-no-direct', base: 24, per: 3 },
  { sku: 'bundle-zero-direct', direct: 0, base: 24, per: 3 },
  { sku: 'ordinary', direct: 7 },
  { sku: 'negative', direct: -2 },
];
const snapshots = fixtures.flatMap(r => [
  ...(r.direct === undefined ? [] : [{ sku: r.sku, qty: r.direct }]),
  ...(r.per ? [{ sku: `base-${r.sku}`, qty: r.base }] : []),
]);
const recipes = fixtures.filter(r => r.per).map(r => ({ sku: r.sku, base: `base-${r.sku}`, per: r.per }));
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async sql => {
    if (sql.includes('MAX(day)')) return [{ d: '2026-09-13' }];
    if (sql.includes('JOIN bundle_items')) return recipes;
    if (sql.includes('FROM stock_snapshots WHERE')) return snapshots;
    throw new Error(`Unexpected SQL: ${sql}`);
  },
} });
mock.module('@netlify/blobs', { namedExports: {
  getStore: () => ({ get: async key => {
    assert.equal(key, 'token');
    return { accessToken: 'fixture-only', expiresAt: Date.now() + 172800000 };
  } }),
} });
mock.module('../../netlify/lib/shopee.mjs', { namedExports: {
  validToken: async () => ({ fixture: true }),
  shopCall: async (path, query) => {
    if (path.endsWith('/get_item_list')) return { response: {
      item: fixtures.map((_, i) => ({ item_id: i + 1 })), total_count: fixtures.length, has_next_page: false,
    } };
    if (path.endsWith('/get_item_base_info')) return { response: {
      item_list: fixtures.map((r, i) => ({ item_id: i + 1, item_name: r.sku })),
    } };
    if (path.endsWith('/get_model_list')) return { response: { model: [{
      model_sku: fixtures[Number(query.item_id) - 1].sku,
      stock_info_v2: { seller_stock: [{ stock: 0 }] },
    }] } };
    throw new Error(`Unexpected Shopee path: ${path}`);
  },
} });
mock.method(globalThis, 'fetch', async input => {
  const url = new URL(input);
  assert.equal(url.origin + url.pathname, 'https://api.lazada.co.th/rest/products/get');
  return { json: async () => ({ code: '0', data: {
    total_products: fixtures.length,
    products: fixtures.map((r, i) => ({ item_id: i + 1, skus: [{
      SellerSku: r.sku, Status: 'active', Available: 0, quantity: 0, SkuId: i + 1,
    }] })),
  } }) };
});

const { shopeeStockCompare } = await import('../../netlify/lib/shopee-stock.mjs');
const { lazadaStockCompare } = await import('../../netlify/lib/lazada.mjs');
const { planFrom, stockPushDryRun } = await import('../../netlify/lib/stock-push.mjs');
const { lazadaReadBack, stockPushLive } = await import('../../netlify/lib/stock-push-live.mjs');

for (const [platform, compare] of [['shopee', shopeeStockCompare], ['lazada', lazadaStockCompare]]) {
  test(`${platform}: compare → plan preserves directQty and holds conflict`, async () => {
    const c = await compare({ full: true });
    const diff = new Map(c.diff.map(r => [r.sku, r]));
    assert.equal(diff.get('03409-3').core, 503);
    assert.equal(diff.get('03409-3').directQty, -5);
    assert.equal(diff.get('bundle-no-direct').directQty, null);
    assert.equal(diff.get('bundle-zero-direct').directQty, 0);
    assert.equal(diff.get('ordinary').directQty, diff.get('ordinary').core);
    const p = (await stockPushDryRun({ platform, full: true }))[platform];
    assert.equal(p.skipConflict, 1);
    assert.equal(p.wouldPush, 3);
    assert.equal(p.skipNegative, 1);
    assert.equal(p.bucketsAddUp, true);
    assert.equal(p.push.some(r => r.sku === '03409-3'), false);
    assert.equal(p.skipConflictFull[0].buildable, 503);
  });
}

test('CEO fixture + boundaries + sample/full', () => {
  const row = { sku: '03409-3', name: 'fixture', directQty: -5, coreQty: 503, platformQty: 0, known: true };
  const p = planFrom([row], true);
  assert.equal(p.skipConflict, 1);
  assert.equal(p.wouldPush, 0);
  assert.equal(p.bucketsAddUp, true);
  assert.deepEqual(p.skipConflictFull, [{ sku: row.sku, name: row.name, directQty: -5, buildable: 503, platformQty: 0 }]);
  for (const coreQty of [0, 503]) assert.equal(planFrom([{ ...row, coreQty, platformQty: coreQty }]).skipConflict, 1);
  assert.equal(planFrom([{ ...row, coreQty: -1 }]).skipNegative, 1);
  assert.equal(planFrom([{ ...row, known: false }]).skipUnknown, 1);
  for (const directQty of [null, undefined, 0, 1]) assert.equal(planFrom([{ ...row, directQty }]).wouldPush, 1);
  const many = Array.from({ length: 20 }, (_, i) => ({ ...row, sku: `C${i}` }));
  const sample = planFrom(many);
  assert.equal(sample.skipConflict, 20);
  assert.equal(sample.skipConflictSample.length, 15);
  assert.equal('skipConflictFull' in sample, false);
  assert.equal(planFrom(many, true).skipConflictFull.length, 20);
  assert.equal(sample.bucketsAddUp, true);
});

test('Lazada live dryCheck excludes conflict and readback reports unknown', async () => {
  const live = await stockPushLive({ platform: 'lazada', skus: ['03409-3'], dryCheck: true });
  assert.equal(live.dryCheck, true);
  assert.equal(live.wouldFire, 0);
  const readback = await lazadaReadBack(['03409-3']);
  assert.equal(readback.landed.length, 0);
  assert.equal(readback.unknown[0].reason, 'skipped_conflict');
});

test('readback cannot pass missing/truncated conflict lists or entries beyond sample', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ sku: `C${i}`, directQty: -1, coreQty: 9, platformQty: 0, known: true }));
  const full = planFrom(rows, true);
  const check = p => lazadaReadBack(['C19'], { dryRun: async () => ({ lazada: p }) });
  assert.equal((await check(full)).unknown[0].reason, 'skipped_conflict');
  assert.equal((await check({ ...full, skipConflictFull: full.skipConflictSample })).unknown[0].reason, 'skip_lists_incomplete');
  assert.equal((await check({ ...full, skipConflictFull: undefined })).unknown[0].reason, 'no_skip_lists');
});
