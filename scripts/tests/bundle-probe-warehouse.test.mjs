// รัน: node --experimental-test-module-mocks --test scripts/tests/bundle-probe-warehouse.test.mjs
// ตัวตรวจ ?zortbundle= กับรหัสคลัง (wh) — ZORT ปลอม · ใบ t_mu1dfe94 (สต็อกชุดรายคลังบนจอรายละเอียดชุด)
// 🔴 สิ่งที่เฝ้า: wh ต้องไปเป็น warehousecode ของ GetBundleDetail · รหัสคลังรูปแปลกต้องไม่ถึง ZORT
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('../../netlify/lib/coredb.mjs', { namedExports: { coreReady: () => true, coreQuery: async () => [] } });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';

let calls = [];
globalThis.fetch = async (url) => {
  const u = String(url);
  calls.push(u);
  if (/GetBundles\?/.test(u)) return { ok: true, status: 200, text: async () => JSON.stringify({ list: [{ id: 7, sku: 'SET-A', stock: '5', availablestock: '1' }] }) };
  if (/GetBundleDetail\?/.test(u)) return { ok: true, status: 200, text: async () => JSON.stringify({ id: 7, stock: '2', availablestock: '0', list: [] }) };
  throw new Error(`ยิงเส้นที่ไม่คาด: ${u}`);
};
const { probeBundleDetail } = await import('../../netlify/lib/core-products.mjs');

test('ส่ง wh ⇒ GetBundleDetail มี warehousecode · ไม่ส่ง ⇒ ไม่มี', async () => {
  calls = [];
  const r = await probeBundleDetail('SET-A', 'KLD');
  assert.equal(r.ok, true);
  assert.equal(r.warehousecode, 'KLD');
  const d = calls.find((u) => /GetBundleDetail/.test(u));
  assert.equal(new URL(d).searchParams.get('warehousecode'), 'KLD');
  assert.equal(new URL(d).searchParams.get('id'), '7');

  calls = [];
  const r2 = await probeBundleDetail('SET-A');
  assert.equal(r2.warehousecode, null);
  assert.equal(new URL(calls.find((u) => /GetBundleDetail/.test(u))).searchParams.get('warehousecode'), null);
});

test('รหัสคลังรูปแปลก ⇒ ตีกลับ ไม่ยิง ZORT', async () => {
  calls = [];
  const r = await probeBundleDetail('SET-A', 'KLD&id=1');
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});
