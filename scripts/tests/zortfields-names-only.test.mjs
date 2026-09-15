import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ?zortfields= ต้องคืนแค่ "ชื่อช่อง + จำนวน" ของรายการสินค้าและหัวใบ — ห้ามคืนค่า (ข้อมูลลูกค้า/ราคา)
   ใบ t_mu2tm88b · repo เป็น public และเส้นนี้เคยรั่วชื่อ/ที่อยู่ลูกค้ามาแล้ว 4 ก.ย. 2569 */
const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
const start = src.indexOf('searchParams.get("zortfields")');
const block = src.slice(start, src.indexOf('searchParams.get("channelcompare")', start));

test('zortfields — ตัวนับคืนตัวเลขเท่านั้น ไม่เก็บค่า', () => {
  const fn = block.slice(block.indexOf('const filledCounts'), block.indexOf('const rows ='));
  assert.match(fn, /out\[k\] = \(out\[k\] \?\? 0\) \+ \(hasValue\(v\) \? 1 : 0\)/);
  assert.doesNotMatch(fn, /out\[k\]\s*=\s*v\b|\.push\(v\)|add\(v\)/);
});

test('zortfields — ช่องหัวใบเป็นรายชื่อตรงตัว ไม่มีช่องลูกค้า', () => {
  const m = block.match(/HEADER_PROBE = new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, 'ต้องมีรายชื่อ HEADER_PROBE');
  const names = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.ok(names.includes('tag') && names.includes('agent') && names.includes('paymentdate'));
  // รายชื่อตรงตัว ห้าม regex (no-substring-classification — createusername ไม่ใช่ข้อมูลลูกค้า)
  const CUSTOMER = new Set(['customername', 'customerphone', 'customeremail', 'customeraddress', 'customeridnumber',
    'shippingname', 'shippingaddress', 'shippingphone', 'shippingemail', 'facebookname', 'facebookid', 'line', 'lineid']);
  for (const n of names) assert.ok(!CUSTOMER.has(n), n);
  assert.match(block, /filter\(\(\[k\]\) => HEADER_PROBE\.has\(k\)\)/);
});
