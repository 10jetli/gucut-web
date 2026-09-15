// รัน: node --experimental-test-module-mocks --test scripts/tests/store-filter.test.mjs
// 15 ก.ย. 2569 — ตัวกรองร้าน (store=) ของเส้นออเดอร์ต้องตีความชุดเดียวกันทุกฟังก์ชัน
// 🔴 สิ่งที่เฝ้า: store=all ที่ orderfacets เคยได้ 0 ใบพร้อมป้าย "เฉพาะร้าน all" ขณะที่ list=orders ได้ครบ
//    และค่าที่ไม่รู้จัก (zzz · source=) ต้องถูกตีกลับที่ core.mjs ไม่ใช่ "ไม่กรอง" หรือ "กรองได้ 0" เงียบ ๆ
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

let sqls = [];
let paramsOf = new Map();
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => {
    const s = String(sql); sqls.push(s); paramsOf.set(s, params);
    return [];
  },
} });

const { parseStore, listOrderFacets, listOrders, listChannels } = await import('../../netlify/lib/core-orders.mjs');

const filtersStore = () => sqls.some((s) => /source = \?/.test(s));

test('parseStore: ว่าง/all = ทุกร้าน · z1/z2 = ร้านนั้น · ค่าอื่น = error', () => {
  assert.deepEqual(parseStore(undefined), { source: null });
  assert.deepEqual(parseStore(null), { source: null });
  assert.deepEqual(parseStore(''), { source: null });
  assert.deepEqual(parseStore('all'), { source: null });
  assert.deepEqual(parseStore('z1'), { source: 'z1' });
  assert.deepEqual(parseStore(' z2 '), { source: 'z2' });
  for (const bad of ['zzz', 'Z1', 'source', 'z3']) assert.ok(parseStore(bad).error, `ต้อง error: ${bad}`);
});

test('orderfacets + store=all ⇒ ไม่กรองร้าน · ป้ายไม่ใช่ "เฉพาะร้าน all"', async () => {
  for (const v of ['all', 'zzz']) {
    sqls = []; paramsOf = new Map();
    const r = await listOrderFacets({ from: '2025-05-01', to: '2025-05-31', source: v });
    assert.equal(filtersStore(), false, `store=${v} ต้องไม่ใส่ source = ? ลง SQL`);
    assert.doesNotMatch(String(r.storeScope), /เฉพาะร้าน/, `store=${v} ป้ายต้องเป็นทุกร้าน`);
    assert.equal(r.store ?? null, null);
  }
});

test('orderfacets + z1 ⇒ กรองด้วย z1 จริง (เทสต์แยกแยะได้)', async () => {
  sqls = []; paramsOf = new Map();
  const r = await listOrderFacets({ from: '2025-05-01', to: '2025-05-31', source: 'z1' });
  const s = sqls.find((x) => /source = \?/.test(x));
  assert.ok(s, 'ต้องกรองร้าน');
  assert.ok(paramsOf.get(s).includes('z1'));
  assert.match(String(r.storeScope), /เฉพาะร้าน/);
});

test('listOrders / listChannels + all ⇒ ไม่กรองร้านเหมือน orderfacets', async () => {
  sqls = []; await listOrders({ from: '2025-05-01', to: '2025-05-31', source: 'all' });
  assert.equal(filtersStore(), false);
  sqls = []; await listChannels('all');
  assert.equal(filtersStore(), false);
  sqls = []; await listChannels('z2');
  assert.equal(filtersStore(), true);
});

test('core.mjs ตีกลับค่าร้านที่ไม่รู้จัก ก่อนถึงเส้น orderfacets/orders', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const guard = src.indexOf('const st = parseStore(p.get("store"))');
  const facets = src.indexOf('if (p.get("list") === "orderfacets") {');
  const orders = src.indexOf('if (p.get("list") === "orders") {');
  assert.ok(guard > 0 && facets > guard && orders > guard, 'ด่านต้องอยู่ก่อนทั้งสองเส้น');
  const block = src.slice(guard - 700, facets);
  assert.match(block, /st\.error\) return json\(\{ error: st\.error \}, 400\)/);
  assert.match(block, /p\.has\("source"\) && !p\.has\("store"\)/);
});
