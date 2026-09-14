// รัน: node --experimental-test-module-mocks --test scripts/tests/bundle-recipe-sync.test.mjs
// ซิงก์สูตรชุด ZORT → bundle_items (ZORT ปลอม · D1 ปลอม ไม่ยิงเน็ตจริง) — งานกระดาน t_mu1bh4vh
// 🔴 สิ่งที่เทสนี้เฝ้า: ของที่ถามไม่สำเร็จ/ว่าง/เพี้ยน ต้องไม่ไปเขียนทับสูตรเดิม · สูตรเหมือนเดิมต้องไม่เขียน
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let sqls = [];
let oldRows = [];
let failD1Read = false;
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => {
    const s = String(sql);
    sqls.push(s);
    if (/FROM bundle_recipe_state/.test(s) && /^\s*SELECT/.test(s)) return [];
    if (/^\s*SELECT bundle_sku, line, sku, qty FROM bundle_items/.test(s)) {
      if (failD1Read) throw new Error('D1 500: ล่มจำลอง');
      return oldRows;
    }
    return [];
  },
} });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';

let bundles = [];
let details = {};
let failList = false;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (/Bundle\/GetBundles\?/.test(u)) {
    if (failList) return { ok: false, status: 500, json: async () => null };
    return { ok: true, status: 200, json: async () => ({ list: bundles }) };
  }
  const m = /Bundle\/GetBundleDetail\?id=(\d+)/.exec(u);
  if (m) {
    const d = details[m[1]];
    if (d === 'throw') throw new Error('timeout');
    return { ok: true, status: 200, json: async () => d };
  }
  throw new Error(`ยิงเส้นที่ไม่คาด: ${u}`);
};

const { syncBundleRecipes } = await import('../../netlify/lib/core-products.mjs');

const reset = () => { sqls = []; oldRows = []; failD1Read = false; failList = false; };
const writes = () => sqls.filter((s) => /^\s*(INSERT INTO bundle_items|DELETE FROM bundle_items)/.test(s));

test('สูตรต่าง ⇒ upsert + ตัดบรรทัดเกิน · สูตรเหมือน ⇒ ไม่เขียน', async () => {
  reset();
  bundles = [{ id: 1, sku: 'SET-A' }, { id: 2, sku: 'SET-B' }];
  details = {
    1: { id: 1, list: [{ sku: 'X', name: 'ของ X', quantity: 1 }, { sku: 'Y', name: 'ของ Y', quantity: 42 }] },
    2: { id: 2, list: [{ sku: 'Z', name: 'ของ Z', quantity: 1 }] },
  };
  // SET-A เดิมมี 3 บรรทัด (ต่าง) · SET-B เดิมเหมือนเป๊ะ
  oldRows = [
    { bundle_sku: 'SET-A', line: 1, sku: 'X', qty: 1 },
    { bundle_sku: 'SET-A', line: 2, sku: 'Y', qty: 40 },
    { bundle_sku: 'SET-A', line: 3, sku: 'W', qty: 1 },
    { bundle_sku: 'SET-B', line: 1, sku: 'Z', qty: 1 },
  ];
  const r = await syncBundleRecipes();
  assert.equal(r.ok, true);
  assert.equal(r.changed, 1);
  assert.equal(r.same, 1);
  assert.deepEqual(r.changedSkus, ['SET-A']);
  const ins = sqls.find((s) => /INSERT INTO bundle_items/.test(s));
  assert.match(ins, /\('SET-A',1,'X','ของ X',1,/);
  assert.match(ins, /\('SET-A',2,'Y','ของ Y',42,/);
  assert.doesNotMatch(ins, /SET-B/, 'ชุดที่สูตรเหมือนเดิมต้องไม่ถูกเขียน');
  const del = sqls.find((s) => /DELETE FROM bundle_items/.test(s));
  assert.match(del, /bundle_sku='SET-A' AND line>2/);
});

test('ถามไม่สำเร็จ · list ว่าง · ตอบคนละชุด · บรรทัดไม่มีจำนวน ⇒ ไม่แตะสูตรเดิม', async () => {
  reset();
  bundles = [{ id: 1, sku: 'S1' }, { id: 2, sku: 'S2' }, { id: 3, sku: 'S3' }, { id: 4, sku: 'S4' }];
  details = {
    1: 'throw',
    2: { id: 2, list: [] },
    3: { id: 999, list: [{ sku: 'Q', quantity: 1 }] },
    4: { id: 4, list: [{ sku: 'Q', quantity: 0 }] },
  };
  oldRows = [{ bundle_sku: 'S2', line: 1, sku: 'Q', qty: 1 }];
  const r = await syncBundleRecipes();
  assert.equal(r.ok, true);
  assert.equal(r.changed, 0);
  assert.equal(r.notWritten, 4);
  assert.deepEqual(r.problems.map((p) => p.state).sort(), ['empty', 'invalid', 'unknown', 'unknown']);
  assert.equal(writes().length, 0, 'ต้องไม่มีคำสั่งเขียน bundle_items เลย');
  assert.ok(sqls.some((s) => /INSERT INTO bundle_recipe_state/.test(s)), 'ยังต้องจดว่าตรวจแล้ว');
});

test('ถามรายชื่อชุดไม่สำเร็จ ⇒ ไม่เขียนอะไรเลยทั้งรอบ', async () => {
  reset();
  failList = true;
  const r = await syncBundleRecipes();
  assert.equal(r.ok, false);
  assert.match(r.error, /ไม่เขียนอะไร/);
  assert.equal(sqls.length, 0);
});

test('รายชื่อได้ครึ่งเดียว (หน้า 1 ครบ 200 · หน้า 2 ล้ม) ⇒ ไม่เขียนอะไรเลย ห้ามเลือกชุดจากรายชื่อครึ่งเดียว', async () => {
  reset();
  const page1 = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, sku: `P${i + 1}` }));
  const saved = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (/GetBundles\?.*page=1\b/.test(u)) return { ok: true, status: 200, json: async () => ({ list: page1 }) };
    if (/GetBundles\?/.test(u)) return { ok: false, status: 502, json: async () => null };
    const m = /id=(\d+)/.exec(u);
    return { ok: true, status: 200, json: async () => ({ id: Number(m[1]), list: [{ sku: 'X', quantity: 1 }] }) };
  };
  try {
    const r = await syncBundleRecipes();
    assert.equal(r.ok, false);
    assert.match(r.error, /หน้า 2/);
    assert.equal(sqls.length, 0);
  } finally {
    globalThis.fetch = saved;
  }
});

test('อ่านสูตรเดิมจาก D1 ไม่สำเร็จ ⇒ throw ก่อนเขียน (ห้ามถือว่าไม่มีสูตรเดิม)', async () => {
  reset();
  failD1Read = true;
  bundles = [{ id: 1, sku: 'SET-A' }];
  details = { 1: { id: 1, list: [{ sku: 'X', quantity: 1 }] } };
  await assert.rejects(() => syncBundleRecipes(), /D1 500/);
  assert.equal(writes().length, 0);
});
