import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* list=topproducts ส่งหมวดสินค้า — by=category รวมฝั่งเซิร์ฟเวอร์ (จอเมนู 1/2 ขอ 15 ก.ย. 2569) */
const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
const a = src.indexOf('if (url.searchParams.get("list") === "topproducts")');
const block = src.slice(a, src.indexOf('// สะพานส่งเอกสารขายเข้า PEAK', a));
const catQ = block.slice(block.indexOf(': byCategory'), block.indexOf('SELECT oi.sku'));
const monthQ = block.slice(block.indexOf('byMonth\n'), block.indexOf(': byCategory'));
const dfltQ = block.slice(block.indexOf('SELECT oi.sku'), block.indexOf('return json({', block.indexOf('SELECT oi.sku')));

test('topproducts — by ค่าที่ไม่รู้จักตอบ 400 และ applied สะท้อนค่าที่ใช้จริง', () => {
  assert.match(block, /if \(byRaw && byRaw !== "month" && byRaw !== "category"\) \{\s*return json\(\{ error:[\s\S]*?\}, 400\);\s*\}/);
  assert.match(block, /by: byRaw \|\| null/);
});

test('topproducts by=category — join หมวดจาก products และรวมตามหมวด', () => {
  assert.ok(catQ.length > 50, 'ต้องมีกิ่ง byCategory');
  assert.match(catQ, /LEFT JOIN products p ON p\.sku = oi\.sku/);
  assert.match(catQ, /GROUP BY 1 ORDER BY amount DESC/);
  assert.match(catQ, /\(ยังไม่ได้จัดหมวดใน ZORT\)/);
});

test('topproducts by=category — ตัดใบยกเลิกเหมือนกิ่งรายเดือนทุกเงื่อนไข', () => {
  for (const cond of ["NOT LIKE '%cancel%'", "NOT LIKE '%void%'", "NOT LIKE '%ยกเลิก%'", '${filter}']) {
    assert.ok(monthQ.includes(cond), `month มี ${cond}`);
    assert.ok(catQ.includes(cond), `category ต้องมี ${cond}`);
  }
});

test('topproducts รายสินค้า — ส่ง category ต่อแถว', () => {
  assert.match(dfltQ, /MAX\(COALESCE\(p\.category,''\)\) AS category/);
  assert.match(dfltQ, /LEFT JOIN products p ON p\.sku = oi\.sku/);
  assert.match(block, /categoryScope:/);
});
