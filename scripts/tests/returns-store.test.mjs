// รัน: node --experimental-test-module-mocks --test scripts/tests/returns-store.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu2pfve9 — กระจกใบคืนแยกร้าน (ZORT นับร้าน z2 มีใบคืน 239 ใบที่ไม่เคยดึง)
// 🔴 สิ่งที่เฝ้า: z2 ใช้รหัส _2 · อ่านของเดิมเฉพาะร้าน · id ของอีกร้านไม่เขียนทับ · ชีพจร z2 แยกคีย์ ·
//    ค้นกระจกกรองร้าน · ยอดหักคืนจับคู่ร้าน (ใบคืน z2 ต้องไม่ไปหักยอด z1 ที่เลขซ้ำ)
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { readFileSync } from 'node:fs';

let sqls = [];
let clashIds = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => {
    const s = String(sql); sqls.push({ s, params });
    if (/SELECT id FROM return_orders_v2 WHERE id IN/.test(s)) return clashIds.map((id) => ({ id }));
    if (/COUNT\(\*\) AS c FROM return_orders_v2/.test(s)) return [{ c: 1 }];
    return [];
  },
} });
process.env.ZORT_STORENAME = 'shop1'; process.env.ZORT_APIKEY = 'k1'; process.env.ZORT_APISECRET = 's1';
process.env.ZORT_STORENAME_2 = 'shop2'; process.env.ZORT_APIKEY_2 = 'k2'; process.env.ZORT_APISECRET_2 = 's2';
const { syncReturnOrders, listReturnOrders } = await import('../../netlify/lib/core-purchases.mjs');

let stores = [];
globalThis.fetch = async (url, init) => {
  stores.push(init?.headers?.storename);
  return { ok: true, json: async () => ({ count: 2, list: [{ id: 'R1', number: 'CN-1', reference: 'SO-1', amount: 5 }, { id: 'R2', number: 'CN-2', reference: 'SO-2', amount: 7 }] }) };
};

test('ซิงก์ z2 — รหัส _2 · อ่านของเดิมเฉพาะ z2 · id ของอีกร้านไม่เขียน · แถวติดร้าน · ชีพจรคีย์ z2', async () => {
  sqls = []; clashIds = ['R2']; stores = [];
  const r = await syncReturnOrders({ pages: 1, store: 'z2' });
  assert.deepEqual([...new Set(stores)], ['shop2']);
  assert.ok(sqls.some((x) => /FROM return_orders_v2 WHERE source = 'z2'/.test(x.s)));
  const ins = sqls.find((x) => /INSERT INTO return_orders_v2/.test(x.s));
  assert.ok(ins); assert.match(ins.s, /'R1'/); assert.doesNotMatch(ins.s, /'R2'/);
  assert.match(ins.s, /,'z2'\)/); assert.match(ins.s, /WHERE return_orders_v2\.source = excluded\.source/);
  const meta = sqls.find((x) => /INSERT INTO core_meta/.test(x.s));
  assert.equal(meta.params[0], 'sync_returns_z2');
  assert.equal(r.store, 'z2'); assert.equal(r.collisions, 1); assert.equal(r.written, 1);
});

test('ซิงก์ไม่ระบุร้าน = z1 คีย์ชีพจรเดิม · store แปลก = error ไม่ยิง ZORT', async () => {
  sqls = []; clashIds = []; stores = [];
  const r = await syncReturnOrders({ pages: 1 });
  assert.equal(r.store, 'z1');
  assert.equal(sqls.find((x) => /INSERT INTO core_meta/.test(x.s)).params[0], 'sync_returns');
  stores = [];
  assert.match((await syncReturnOrders({ store: 'all' })).error, /z1 หรือ z2/);
  assert.equal(stores.length, 0);
});

test('รายการ — ค้นกระจกกรองร้าน (วงเล็บครอบ OR) · ดึงสด z2 ใช้รหัส _2', async () => {
  sqls = [];
  const a = await listReturnOrders(50, 1, 'CN', 'z2');
  const rowQ = sqls.find((x) => /SELECT id, number/.test(x.s));
  assert.match(rowQ.s, /WHERE \(.* OR .* OR .*\) AND source = \?/s);
  assert.deepEqual(rowQ.params, ['CN', 'CN', 'CN', 'z2']);
  assert.equal(a.store, 'z2');
  stores = [];
  const b = await listReturnOrders(50, 1, '', 'z2');
  assert.deepEqual(stores, ['shop2']); assert.equal(b.store, 'z2');
});

test('ยอดหักคืนใน core-orders จับคู่ร้าน · ใบคืนกำพร้าจับคู่ร้าน · core.mjs ตอบทีละร้าน', () => {
  const o = readFileSync(new URL('../../netlify/lib/core-orders.mjs', import.meta.url), 'utf8');
  assert.match(o, /orders\.number = return_orders_v2\.reference AND orders\.source = return_orders_v2\.source AND \$\{w\.sql\}/);
  assert.match(o, /NOT EXISTS \(SELECT 1 FROM orders o WHERE o\.number = r\.reference AND o\.source = r\.source\)/);
  const c = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(c, /Z1_ONLY_LISTS = \[[^\]]*"returnorders"/);
  const at = c.indexOf('if (url.searchParams.get("list") === "returnorders") {');
  const body = c.slice(at, c.indexOf('if (url.searchParams.get("list") === "stockcard")', at));
  assert.match(body, /parseSingleStore\(url\.searchParams\.get\("store"\)\)/);
  assert.match(body, /storeScope:/);
  assert.doesNotMatch(body, /z1Scope/);
  const sy = c.indexOf('if (url.searchParams.get("syncreturns")) {');
  assert.match(c.slice(sy, at), /store: st\.source/);
});
