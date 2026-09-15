// รัน: node --experimental-test-module-mocks --test scripts/tests/category-values.test.mjs
// 15 ก.ย. 2569 — มูลค่าต่อหมวดที่คัดจากจอ ZORT (?categoryvalues) · ใบ t_mu28zi83
// 🔴 สิ่งที่เฝ้า: "215,516.55" ต้องไม่กลายเป็น 0 · แถวเสียไม่เขียน · complete ลบหมวดค้าง · จำนวนไม่เท่าห้ามลบ
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

let sqls = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => {
    const s = String(sql); sqls.push({ s, params });
    if (/SELECT COUNT\(\*\) AS c FROM category_values/.test(s)) return [{ c: 43 }];
    if (/SELECT COUNT\(\*\) AS c, ROUND/.test(s)) return [{ c: 42, remain: 1, avail: 1 }];
    return [];
  },
} });
const { saveCategoryValues } = await import('../../netlify/lib/core-products.mjs');
const writes = () => sqls.filter((x) => /INSERT INTO category_values|DELETE FROM category_values/.test(x.s));
const good = [
  { name: 'โซ่ NEWWAVE', skus: 12, remain: 215516.55, avail: 208854.2 },
  { name: 'โซ่ KINGKONG', skus: '6', remain: '291,500.95', avail: '290,088.77' },
];

test('ลูกน้ำไม่กลายเป็น 0 · ตัวเลขเข้า SQL ถูก', async () => {
  sqls = [];
  const r = await saveCategoryValues(good);
  assert.equal(r.saved, 2);
  const ins = sqls.find((x) => /INSERT INTO category_values/.test(x.s));
  assert.ok(ins, 'ต้องเขียน');
  assert.match(ins.s, /291500\.95/, 'ค่าที่มีลูกน้ำต้องเป็น 291500.95 ไม่ใช่ 0');
  assert.match(ins.s, /290088\.77/);
  assert.equal(r.replacedAll, false);
  assert.equal(sqls.some((x) => /DELETE FROM category_values/.test(x.s)), false, 'ไม่ส่ง complete ห้ามลบ');
});

test('แถวเสียแถวเดียว = ไม่เขียนเลย', async () => {
  for (const bad of [
    [...good, { name: 'อะไหล่ X', skus: 3, remain: 'N/A', avail: 1 }],
    [...good, { name: '', skus: 1, remain: 1, avail: 1 }],
    [...good, { name: 'โซ่ NEWWAVE', skus: 1, remain: 1, avail: 1 }],
    [{ name: 'อะไหล่ Y', skus: 1, remain: '', avail: 1 }],
  ]) {
    sqls = [];
    const r = await saveCategoryValues(bad);
    assert.ok(r.error, 'ต้อง error');
    assert.equal(writes().length, 0, 'ต้องไม่เขียน/ไม่ลบอะไร');
  }
});

test('complete + จำนวนเท่า ⇒ ลบหมวดที่ไม่อยู่ในชุด · จำนวนไม่เท่า ⇒ ไม่ทำอะไร', async () => {
  sqls = [];
  const r = await saveCategoryValues(good, { complete: true, expectedCount: 2 });
  assert.equal(r.replacedAll, true);
  const del = sqls.find((x) => /DELETE FROM category_values WHERE name NOT IN/.test(x.s));
  assert.ok(del, 'ต้องลบหมวดค้าง');
  assert.deepEqual(del.params, ['โซ่ NEWWAVE', 'โซ่ KINGKONG']);
  const insAt = sqls.findIndex((x) => /INSERT INTO category_values/.test(x.s));
  const delAt = sqls.findIndex((x) => /DELETE FROM category_values/.test(x.s));
  assert.ok(insAt >= 0 && delAt > insAt, 'ต้องเขียนของใหม่ก่อน แล้วค่อยลบของค้าง');

  sqls = [];
  const no = await saveCategoryValues(good, { complete: true, expectedCount: 42 });
  assert.ok(no.error);
  assert.equal(writes().length, 0, 'จำนวนไม่เท่าห้ามเขียนและห้ามลบ');
});

test('core.mjs ส่ง complete/expectedCount ต่อให้ saveCategoryValues และปฏิเสธเป็น 400', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const at = src.indexOf('if (url.searchParams.get("categoryvalues")) {');
  const next = src.indexOf('if (url.searchParams.get(', at + 10);
  const body = src.slice(at, next);
  assert.match(body, /saveCategoryValues\(body\.rows \|\| body, \{ complete: body\.complete === true, expectedCount: body\.expectedCount \}\)/);
  assert.match(body, /status: r\.error \? 400 : 200/);
});
