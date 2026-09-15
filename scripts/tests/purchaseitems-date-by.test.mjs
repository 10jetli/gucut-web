// รัน: node --experimental-test-module-mocks --test scripts/tests/purchaseitems-date-by.test.mjs
// 16 ก.ย. 2569 — list=purchaseitems รับ from/to (วันที่ใบซื้อ) + by=sku|category|vendor|warehouse
// 🔴 บั๊กที่เฝ้า: ① เดิมไม่มีตัวกรองวัน ⇒ ปุ่มช่วงเวลาเมนู 3 ไม่มีผลกับตารางรายสินค้าเงียบ ๆ
//    ② by=category ส่งไปแล้วคำตอบเหมือนเดิม ไม่ 400 (คุณส้มยิงเจอ) ③ สรุปกับแถวต้องใช้เงื่อนไขชุดเดียวกัน
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

const sqls = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => {
    sqls.push(String(sql));
    if (/FROM core_meta/.test(sql)) return [{ v: 'ok', at: '2026-09-15 00:00:00' }];
    if (/COUNT\(DISTINCT i\.sku\) AS skus/.test(sql)) return [{ skus: 3, lines: 4, amount: 100, groups: 2 }];
    return [];
  },
} });
const { listPurchaseItems, purchaseByError } = await import('../../netlify/lib/core-purchases.mjs');
const q = (re) => sqls.filter((s) => re.test(s));

test('from/to ลงทั้งสรุปและแถวชุดเดียวกัน', async () => {
  sqls.length = 0;
  const r = await listPurchaseItems({ from: '2026-08-01', to: '2026-08-31' });
  if (r.error) assert.fail(`ตอบ error: ${r.error}`);
  const sum = q(/COUNT\(DISTINCT i\.sku\) AS skus/)[0];
  const rows = q(/GROUP BY i\.sku/)[0];
  for (const s of [sum, rows]) { assert.match(s, /po\.po_date >= '2026-08-01'/); assert.match(s, /po\.po_date <= '2026-08-31'/); }
  assert.deepEqual([r.applied.from, r.applied.to, r.by], ['2026-08-01', '2026-08-31', 'sku']);
  assert.match(r.dateScope, /2026-08-01/);
});

test('ไม่ส่งวัน = ไม่กรอง · วันผิดรูปไม่ลง SQL', async () => {
  sqls.length = 0;
  const r = await listPurchaseItems({ from: '2026-13-01' });
  assert.doesNotMatch(q(/GROUP BY i\.sku/)[0], /po_date >=/);
  assert.equal(r.applied.from, null);
  assert.match(r.dateScope, /ไม่ได้กรองช่วงวัน/);
});

test('by=category จัดกลุ่มตามหมวด + join products · total = จำนวนกลุ่ม', async () => {
  sqls.length = 0;
  const r = await listPurchaseItems({ by: 'category', from: '2026-08-01' });
  const rows = q(/AS groupKey/)[0];
  assert.ok(rows); assert.match(rows, /LEFT JOIN products p ON p\.sku = i\.sku/); assert.match(rows, /GROUP BY 1/);
  assert.match(rows, /po\.po_date >= '2026-08-01'/);
  assert.match(q(/COUNT\(DISTINCT i\.sku\) AS skus/)[0], /AS groups/);
  assert.equal(r.total, 2); assert.equal(r.by, 'category');
});

test('by ที่ไม่รู้จัก/ทำไม่ได้ ⇒ error ไม่ยิงคิวรีแถว', async () => {
  assert.match(purchaseByError('user'), /ไม่ได้เก็บผู้สร้าง/);
  assert.match(purchaseByError('zzz'), /by รับแค่/);
  assert.equal(purchaseByError(''), null);
  sqls.length = 0;
  const r = await listPurchaseItems({ by: 'zzz' });
  assert.ok(r.error); assert.equal(q(/GROUP BY/).length, 0);
});

test('core.mjs ส่ง from/to/by · param-guard ตรวจวันของ purchaseitems', () => {
  const core = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const i = core.indexOf('...(await listPurchaseItems({');
  const blk = core.slice(i, core.indexOf('})),', i));
  for (const k of ['from: url.searchParams.get("from")', 'to: url.searchParams.get("to")', 'by: url.searchParams.get("by")']) assert.ok(blk.includes(k), k);
  const pg = readFileSync(new URL('../../netlify/lib/param-guard.mjs', import.meta.url), 'utf8');
  assert.match(pg, /DATE_LISTS = new Set\(\[[^\]]*"purchaseitems"/);
});
