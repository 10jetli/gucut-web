// รัน: node --test scripts/tests/topproducts-export-complete.test.mjs
// 16 ก.ย. 2569 — list=topproducts เพดาน 5,000 + totalSkus/complete ให้ปุ่ม Export ยอดขายตามสินค้าเช็คว่าได้ครบ
// 🔴 บั๊กที่เฝ้า: จอทำไฟล์ "ยอดขายตามสินค้า" จากรายการแสดงผล limit=10 ⇒ ไฟล์มีแค่ 10 ตัว ไม่มีอะไรบอกว่าไม่ครบ
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
const a = src.indexOf('if (url.searchParams.get("list") === "topproducts")');
const blk = src.slice(a, src.indexOf('// สะพานส่งเอกสารขายเข้า PEAK', a));

test('เพดาน limit 5,000', () => {
  assert.match(blk, /const limit = Math\.min\(5000, /);
});

test('totalSkus นับในเงื่อนไขเดียวกับรายสินค้า (ตัดใบยกเลิก + filter)', () => {
  const i = blk.indexOf('const totalSkus =');
  assert.ok(i > 0);
  const q = blk.slice(i, blk.indexOf('params\n      ))', i));
  assert.match(q, /COUNT\(DISTINCT oi\.sku\)/);
  for (const c of ["NOT LIKE '%cancel%'", "NOT LIKE '%void%'", "NOT LIKE '%ยกเลิก%'", '${filter}']) assert.ok(q.includes(c), c);
  assert.match(blk, /byMonth \|\| byCategory \? null :/);
});

test('ส่ง totalSkus + complete เฉพาะโหมดรายสินค้า', () => {
  assert.match(blk, /\.\.\.\(totalSkus === null \? \{\} : \{ totalSkus, complete: items\.length >= totalSkus \}\),/);
});
