// รัน: node --experimental-test-module-mocks --test scripts/tests/purchases-date-topproducts-store.test.mjs
// 16 ก.ย. 2569 — ① list=purchases รับ from/to (เลิกให้จอกรองวันเองจาก limit=200) ② list=topproducts รับ store= (เทียบ ZORT z1)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

const sqls = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => {
    sqls.push(String(sql));
    if (/FROM core_meta/.test(sql)) return [{ v: 'ok', at: '2026-09-15 00:00:00' }];
    if (/COUNT\(\*\) AS c, ROUND/.test(sql)) return [{ c: 5, total: 100 }];
    return [];
  },
} });
const { listPurchases } = await import('../../netlify/lib/core-purchases.mjs');

test('list=purchases from/to ลงทุกคิวรี (สรุป · แท็บสถานะ · แถว)', async () => {
  sqls.length = 0;
  const r = await listPurchases({ from: '2026-08-01', to: '2026-08-31' });
  if (r.error) assert.fail(r.error);
  const mine = sqls.filter((s) => /FROM purchase_orders_v2 WHERE 1=1/.test(s));
  assert.equal(mine.length, 3);
  for (const s of mine) { assert.match(s, /po_date >= '2026-08-01'/); assert.match(s, /po_date <= '2026-08-31'/); }
  assert.deepEqual([r.applied.from, r.applied.to], ['2026-08-01', '2026-08-31']);
  assert.match(r.dateScope, /2026-08-01/);
  assert.equal(r.truncated, true);
});

test('list=purchases ไม่ส่งวัน/วันผิดรูป = ไม่กรอง', async () => {
  sqls.length = 0;
  const r = await listPurchases({ from: '2026-13-01' });
  for (const s of sqls.filter((s) => /FROM purchase_orders_v2 WHERE 1=1/.test(s))) assert.doesNotMatch(s, /po_date >=/);
  assert.equal(r.applied.from, null);
});

test('core.mjs: purchases ส่ง from/to · param-guard ตรวจวัน · topproducts store= กรอง + 400 + สะท้อน', () => {
  const core = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const i = core.indexOf('...(await listPurchases({');
  const blk = core.slice(i, core.indexOf('})),', i));
  assert.ok(blk.includes('from: url.searchParams.get("from")') && blk.includes('to: url.searchParams.get("to")'));
  const pg = readFileSync(new URL('../../netlify/lib/param-guard.mjs', import.meta.url), 'utf8');
  assert.match(pg, /DATE_LISTS = new Set\(\[[^\]]*"purchases"/);
  const a = core.indexOf('if (url.searchParams.get("list") === "topproducts")');
  const tp = core.slice(a, core.indexOf('// สะพานส่งเอกสารขายเข้า PEAK', a));
  assert.match(tp, /if \(storeRaw && !\["z1", "z2", "all"\]\.includes\(storeRaw\)\) \{\s*return json\(\{ error:[\s\S]*?\}, 400\);/);
  assert.match(tp, /if \(store\) \{ filter \+= " AND o\.source = \?"; params\.push\(store\); \}/);
  assert.ok(tp.indexOf('if (store) { filter') < tp.indexOf('const items = byMonth'), 'ต้องเติม filter ก่อนยิงคิวรี');
  assert.match(tp, /warehouse: warehouse \|\| null, store \}/);
});
