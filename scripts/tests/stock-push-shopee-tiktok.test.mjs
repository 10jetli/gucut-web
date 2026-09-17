// รัน: node --experimental-test-module-mocks --test scripts/tests/stock-push-shopee-tiktok.test.mjs
// 17 ก.ย. 2569 · gucut2 — ตัวยิง Shopee + TikTok (ท่านประธานสั่ง "ทำให้ครบ")
// 🔴 สิ่งที่เฝ้า: ⑥ reopen ต้องยืนยัน · ⑧ ใบค้างส่งทับทุกชนิด · ③ ทิศลงต้อง allowClose · หลายที่อยู่/หลายคลังไม่ยิง
//    อ่านใบค้างส่งไม่ได้/แผนไม่มีที่อยู่ ⇒ ไม่ยิงทั้งรอบ · ก้อนพังไม่ลากก้อนอื่น · 200 ไม่ได้แปลว่าลง
//    ผลรายตัวอยู่ในคีย์ `results` (กับดัก rows/results ของ Lazada) · โหมดตรวจไม่ยิงไม่จด
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let plan;
let pendingSkus = [];
let pendingFail = null;
const logs = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => {
    if (/FROM order_items i JOIN orders o/.test(sql)) { if (pendingFail) throw new Error(pendingFail); return pendingSkus.map((s, i) => ({ sku: s, oid: `z1/${i}` })); }
    return [];
  },
} });
mock.module('../../netlify/lib/stock-push.mjs', { namedExports: { stockPushDryRun: async () => plan } });
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({ get: async () => [], setJSON: async (k, v) => logs.push(v[0]) }) } });
mock.module('../../netlify/lib/stock-push-live.mjs', { namedExports: { แผนใช้ซ้ำได้ไม่เกิน_ms: 60000 } });

const shopeeReqs = [];
let shopeeReply = (body) => ({ response: { success_list: body.stock_list.map((x) => ({ model_id: x.model_id })), failure_list: [] } });
mock.module('../../netlify/lib/shopee.mjs', { namedExports: {
  validToken: async () => ({ accessToken: 't', shopId: 1 }),
  shopUrl: (p) => `https://shopee.test${p}`,
} });
mock.method(globalThis, 'fetch', async (url, init) => {
  const body = JSON.parse(init.body); shopeeReqs.push(body);
  return { json: async () => shopeeReply(body) };
});
const tiktokReqs = [];
let tiktokReply = () => ({ code: 0, data: {} });
mock.module('../../netlify/lib/tiktok.mjs', { namedExports: {
  VERSION: '202309',
  ensureShop: async () => ({ accessToken: 't' }),
  shopCall: async (path, opts) => { tiktokReqs.push({ path, body: opts.body }); return tiktokReply(path, opts.body); },
} });

const { shopeePushLive } = await import('../../netlify/lib/stock-push-shopee.mjs');
const { tiktokPushLive } = await import('../../netlify/lib/stock-push-tiktok.mjs');

const แผนShopee = () => ({ shopee: {
  wouldPush: 6,
  push: [
    { sku: 'UP', from: 1, to: 5, kind: 'up' },
    { sku: 'RE', from: 0, to: 9, kind: 'reopen' },
    { sku: 'DN', from: 9, to: 3, kind: 'down' },
    { sku: 'HOT', from: 1, to: 4, kind: 'up' },
    { sku: 'TWO', from: 2, to: 6, kind: 'up' },
    { sku: 'TWO', from: 3, to: 6, kind: 'up' },
  ],
  locations: {
    UP: [{ itemId: 10, modelId: 101 }], RE: [{ itemId: 10, modelId: 102 }], DN: [{ itemId: 11, modelId: 0 }],
    HOT: [{ itemId: 12, modelId: 121 }], TWO: [{ itemId: 13, modelId: 131 }, { itemId: 14, modelId: 0 }],
  },
} });
const ผลของ = (r, sku) => r.results.find((x) => x.sku === sku);

test('Shopee: ด่านครบ — up ยิง · reopen/ทิศลง/ใบค้างส่ง/หลายที่อยู่ ไม่ยิงพร้อมเหตุผล', async () => {
  plan = แผนShopee(); pendingSkus = ['HOT']; pendingFail = null; shopeeReqs.length = 0; logs.length = 0;
  const r = await shopeePushLive({ platform: 'shopee', skus: ['UP', 'RE', 'DN', 'HOT', 'TWO', 'GONE'] });
  assert.equal(ผลของ(r, 'UP').result, 'pushed');
  assert.match(ผลของ(r, 'RE').why, /confirmReopen/);
  assert.match(ผลของ(r, 'DN').why, /allowClose/);
  assert.match(ผลของ(r, 'HOT').why, /ใบค้างส่ง/);
  assert.match(ผลของ(r, 'TWO').why, /ขายเกิน/);
  assert.match(ผลของ(r, 'GONE').why, /ไม่อยู่ในแผนสด/);
  assert.equal(shopeeReqs.length, 1);
  assert.deepEqual(shopeeReqs[0], { item_id: 10, stock_list: [{ model_id: 101, seller_stock: [{ stock: 5 }] }] });
  assert.equal(r.fired, 1); assert.equal(r.pushed, 1); assert.equal(r.notSent, 5);
  assert.equal(logs[0].platform, 'shopee');
});

test('Shopee: reopen ที่ยืนยันแล้ว + allowClose ⇒ ยิง · รวมสินค้าเดียวกันในคำขอเดียว', async () => {
  plan = แผนShopee(); pendingSkus = []; shopeeReqs.length = 0;
  const r = await shopeePushLive({ platform: 'shopee', skus: ['UP', 'RE', 'DN'], confirmReopen: ['RE'], allowClose: true });
  assert.equal(r.pushed, 3);
  const item10 = shopeeReqs.find((b) => b.item_id === 10);
  assert.equal(item10.stock_list.length, 2);
});

test('Shopee: แปลผลรายตัว — failure_list ⇒ rejected · ไม่อยู่ทั้งสองรายการ ⇒ rejected ไม่ใช่ pushed · error ⇒ ทั้งก้อน', async () => {
  plan = แผนShopee(); pendingSkus = [];
  shopeeReply = () => ({ response: { success_list: [], failure_list: [{ model_id: 101, failed_reason: 'stock locked' }] } });
  let r = await shopeePushLive({ platform: 'shopee', skus: ['UP', 'RE'], confirmReopen: ['RE'] });
  assert.equal(ผลของ(r, 'UP').why, 'stock locked');
  assert.match(ผลของ(r, 'RE').why, /ไม่รู้ผล/);
  assert.equal(r.pushed, 0);
  shopeeReply = () => ({ error: 'error_busy', message: 'try later' });
  r = await shopeePushLive({ platform: 'shopee', skus: ['UP'] });
  assert.match(ผลของ(r, 'UP').why, /error_busy/);
  shopeeReply = (body) => ({ response: { success_list: body.stock_list.map((x) => ({ model_id: x.model_id })), failure_list: [] } });
});

test('Shopee: แบ่งก้อน 20 ต่อสินค้า และก้อนพังไม่ลากก้อนอื่น', async () => {
  const push = []; const locations = {};
  for (let i = 0; i < 25; i++) { push.push({ sku: `M${i}`, from: 1, to: 2, kind: 'up' }); locations[`M${i}`] = [{ itemId: 77, modelId: 1000 + i }]; }
  plan = { shopee: { wouldPush: 25, push, locations } }; pendingSkus = []; shopeeReqs.length = 0;
  let n = 0;
  shopeeReply = (body) => (++n === 1 ? { error: 'error_param', message: 'too many' } : { response: { success_list: body.stock_list.map((x) => ({ model_id: x.model_id })), failure_list: [] } });
  const r = await shopeePushLive({ platform: 'shopee', skus: push.map((x) => x.sku) });
  assert.deepEqual(shopeeReqs.map((b) => b.stock_list.length), [20, 5]);
  assert.equal(r.rejected, 20); assert.equal(r.pushed, 5);
  shopeeReply = (body) => ({ response: { success_list: body.stock_list.map((x) => ({ model_id: x.model_id })), failure_list: [] } });
});

test('ไม่ยิงทั้งรอบ: อ่านใบค้างส่งไม่ได้ · แผนไม่มีที่อยู่ · แผนไม่ครบ · โหมดตรวจไม่ยิงไม่จด', async () => {
  shopeeReqs.length = 0; logs.length = 0;
  plan = แผนShopee(); pendingFail = 'D1 down';
  assert.match((await shopeePushLive({ platform: 'shopee', skus: ['UP'] })).error, /ด่าน ⑧/);
  pendingFail = null;
  plan = แผนShopee(); delete plan.shopee.locations;
  assert.match((await shopeePushLive({ platform: 'shopee', skus: ['UP'] })).error, /ไม่มีที่อยู่/);
  plan = แผนShopee(); plan.shopee.wouldPush = 99;
  assert.match((await shopeePushLive({ platform: 'shopee', skus: ['UP'] })).error, /แผนสดไม่ครบ/);
  plan = แผนShopee();
  const d = await shopeePushLive({ platform: 'shopee', skus: ['UP', 'RE'], dryCheck: true });
  assert.equal(d.dryCheck, true); assert.equal(d.wouldFire, 1);
  assert.equal(shopeeReqs.length, 0); assert.equal(logs.length, 0);
  assert.match((await shopeePushLive({ platform: 'lazada', skus: ['UP'] })).error, /เฉพาะ platform: shopee/);
});

const แผนTikTok = () => ({ tiktok: {
  wouldPush: 3,
  push: [{ sku: 'A', from: 1, to: 4, kind: 'up' }, { sku: 'B', from: 2, to: 7, kind: 'up' }, { sku: 'W2', from: 1, to: 3, kind: 'up' }],
  locations: {
    A: [{ productId: 'P1', skuId: 'S1', warehouses: ['WH'] }],
    B: [{ productId: 'P2', skuId: 'S2', warehouses: ['WH'] }],
    W2: [{ productId: 'P3', skuId: 'S3', warehouses: ['WH', 'WH2'] }],
  },
} });

test('TikTok: หลายคลังไม่ยิง · ยิงระบุคลัง · สินค้าหนึ่งพัง อีกสินค้ายังลง · errors รายตัว', async () => {
  plan = แผนTikTok(); pendingSkus = []; tiktokReqs.length = 0;
  tiktokReply = (path) => { if (path.includes('/P1/')) throw new Error('12052700: inventory locked'); return { code: 0, data: {} }; };
  const r = await tiktokPushLive({ platform: 'tiktok', skus: ['A', 'B', 'W2'] });
  assert.match(ผลของ(r, 'W2').why, /2 คลัง/);
  assert.match(ผลของ(r, 'A').why, /inventory locked/);
  assert.equal(ผลของ(r, 'B').result, 'pushed');
  assert.deepEqual(tiktokReqs.find((x) => x.path.includes('/P2/')).body, { skus: [{ id: 'S2', inventory: [{ warehouse_id: 'WH', quantity: 7 }] }] });
  tiktokReply = () => ({ code: 0, data: { errors: [{ code: 1, message: 'bad qty', detail: { sku_id: 'S2' } }] } });
  const r2 = await tiktokPushLive({ platform: 'tiktok', skus: ['B'] });
  assert.match(ผลของ(r2, 'B').why, /bad qty/);
  tiktokReply = () => ({ code: 0, data: { errors: [{ code: 9, message: 'partial' }] } });
  assert.match(ผลของ(await tiktokPushLive({ platform: 'tiktok', skus: ['B'] }), 'B').why, /ไม่รู้ผลรายตัว/);
  tiktokReply = () => ({ code: 0, data: {} });
});

test('ใช้แผนที่ตัวกวาดเพิ่งคิดได้ (อายุไม่เกิน) · ผลอยู่ใน results', async () => {
  plan = null; pendingSkus = [];
  const r = await tiktokPushLive({ platform: 'tiktok', skus: ['B'] }, { แผนที่คิดแล้ว: { plan: แผนTikTok(), คิดเมื่อ: Date.now() - 1000 } });
  assert.equal(r.planSource, 'ตัวกวาดคิดในคำขอเดียวกัน');
  assert.ok(Array.isArray(r.results));
  assert.equal(r.rows, undefined);
});
