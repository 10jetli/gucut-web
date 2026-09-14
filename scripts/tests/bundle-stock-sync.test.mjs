// รัน: node --experimental-test-module-mocks --test scripts/tests/bundle-stock-sync.test.mjs
// ซิงก์สต็อกสินค้าเป็นชุด ZORT → bundles (ZORT ปลอม · D1 ปลอม) — ใบด่วน t_mu1dfbz2 (14 ก.ย. 2569)
// 🔴 สิ่งที่เฝ้า: ค่าว่างต้องไม่กลายเป็น 0 · ติดลบต้องเก็บติดลบ · รายชื่อไม่ครบต้องไม่เขียน · ซิงก์ครบต้องจดชีพจร
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let sqls = [];
let prevRows = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => {
    const s = String(sql);
    sqls.push(s);
    if (/^\s*SELECT sku, name, sellprice, onhand, available, active, unit FROM bundles/.test(s)) return prevRows;
    return [];
  },
} });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';

let pages = {};
globalThis.fetch = async (url) => {
  const m = /Bundle\/GetBundles\?limit=200&page=(\d+)/.exec(String(url));
  if (!m) throw new Error(`ยิงเส้นที่ไม่คาด: ${url}`);
  const p = pages[m[1]];
  if (p === 'fail') return { ok: false, status: 502, json: async () => null };
  return { ok: true, status: 200, json: async () => ({ list: p ?? [] }) };
};

const { syncBundles } = await import('../../netlify/lib/core-products.mjs');
const reset = () => { sqls = []; prevRows = []; pages = {}; };
const insert = () => sqls.find((s) => /INSERT INTO bundles/.test(s));

test('ติดลบเก็บติดลบ · ค่าว่างเก็บ NULL ไม่ใช่ 0 · จดชีพจร bundles_stock', async () => {
  reset();
  pages = { 1: [
    { sku: 'NEG', name: 'ชุดติดลบ', sellprice: 6700, stock: 18, availablestock: -10, active: true, unittext: 'SET' },
    { sku: 'NUL', name: 'ชุดไม่มีพร้อมขาย', sellprice: 100, stock: 5, availablestock: null, active: true },
  ] };
  const r = await syncBundles();
  assert.equal(r.ok, true);
  assert.equal(r.written, 2);
  const ins = insert();
  assert.match(ins, /\('NEG','ชุดติดลบ',6700,18,-10,/);
  assert.match(ins, /\('NUL','ชุดไม่มีพร้อมขาย',100,5,NULL,/, 'availablestock ว่าง ต้องเป็น NULL ไม่ใช่ 0');
  assert.ok(sqls.some((s) => /INSERT INTO sync_marks[\s\S]*'bundles_stock'/.test(s)), 'ต้องจดชีพจรเมื่อซิงก์ครบ');
});

test('ค่าเดิมเป็น NULL และ ZORT ยังว่าง ⇒ ไม่นับว่าเปลี่ยน · เดิม 0 แต่ตอนนี้ว่าง ⇒ เปลี่ยน', async () => {
  reset();
  pages = { 1: [
    { sku: 'A', name: 'ก', sellprice: 1, stock: 5, availablestock: null, active: true, unittext: '' },
    { sku: 'B', name: 'ข', sellprice: 1, stock: 5, availablestock: null, active: true, unittext: '' },
  ] };
  prevRows = [
    { sku: 'A', name: 'ก', sellprice: 1, onhand: 5, available: null, active: 1, unit: '' },
    { sku: 'B', name: 'ข', sellprice: 1, onhand: 5, available: 0, active: 1, unit: '' },
  ];
  const r = await syncBundles();
  assert.equal(r.written, 1);
  assert.match(insert(), /\('B',/);
  assert.doesNotMatch(insert(), /\('A',/);
});

test('หน้า 2 ถามไม่สำเร็จ ⇒ ไม่เขียนอะไร ไม่จดชีพจร (ห้ามจดว่าซิงก์ครบจากรายชื่อครึ่งเดียว)', async () => {
  reset();
  pages = { 1: Array.from({ length: 200 }, (_, i) => ({ sku: `S${i}`, name: 'x', stock: 1, availablestock: 1 })), 2: 'fail' };
  const r = await syncBundles();
  assert.equal(r.ok, false);
  assert.match(r.error, /หน้า 2/);
  assert.equal(sqls.filter((s) => /INSERT/.test(s)).length, 0);
});
