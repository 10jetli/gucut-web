// รัน: node --test scripts/tests/customer-route-vs-list.test.mjs
// 17 ก.ย. 2569 · gucut2 — เส้น "ลูกค้ารายคน" (?customer=) กลืน list=orders&customer= ก่อนถึงตัวกรอง
// 🔴 สิ่งที่เฝ้า: ① เส้นลูกค้ารายคนต้องไม่รับคำขอที่มี list= ② ไม่มีเส้นไหนก่อน list=orders ที่จับชื่อพารามิเตอร์ตัวกรองของ list=orders ไปเฉย ๆ
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
const listOrders = src.indexOf('if (p.get("list") === "orderfacets" || p.get("list") === "orders")');

test('เส้นลูกค้ารายคนไม่กลืนคำขอที่มี list=', () => {
  const i = src.indexOf('getCustomerDetail(url.searchParams.get("customer"))');
  assert.ok(i > 0 && listOrders > 0);
  const cond = src.slice(src.lastIndexOf('if (', i), i);
  assert.match(cond, /url\.searchParams\.get\("customer"\) && !url\.searchParams\.get\("list"\)/);
});

test('ก่อนถึง list=orders ไม่มีเส้นไหนเช็คแค่ชื่อตัวกรองของ list=orders ตัวเดียว', () => {
  // รายชื่อตัวกรองอ่านจากก้อนที่ส่งให้ listOrders เอง — เพิ่มตัวกรองใหม่แล้วชนก็จับได้
  const block = src.slice(listOrders, src.indexOf('});', listOrders));
  const keys = [...block.matchAll(/p\.get\("([a-z]+)"\)/g)].map((m) => m[1]).filter((k) => k !== 'list');
  assert.ok(keys.includes('customer') && keys.includes('paystatus'), 'อ่านรายชื่อตัวกรองไม่ออก — ตัวทดสอบเองพัง');
  const before = src.slice(0, listOrders);
  for (const k of new Set(keys)) {
    const bare = new RegExp(`if \\((?:url\\.searchParams|p)\\.get\\("${k}"\\)\\) \\{`);
    assert.doesNotMatch(before, bare, `เส้นที่จับ ${k} อย่างเดียวจะกลืน list=orders&${k}=`);
  }
});
