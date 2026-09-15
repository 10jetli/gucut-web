// รัน: node --experimental-test-module-mocks --test scripts/tests/warehouse-and-pos-images.test.mjs
// 15 ก.ย. 2569 — คุณส้มขอหลังทำแท็บ ตามคลัง/สาขา (396383c) + จอ POS รูป
// 🔴 สิ่งที่เฝ้า: ① orderfacets แยกคลังเฉพาะเมื่อขอ + ใบไม่รู้คลังเป็นแถว "" ของตัวเอง (จอไม่ต้องลบเอง)
//    ② topproducts warehouse= กรองจริง + ค่าผิดรูป 400 + applied สะท้อน ③ poslookup ส่ง imageFile/imagePath สามสถานะ
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

const calls = [];
let whRows = [{ code: 'W0001', orders: 3, amount: 300 }, { code: '', orders: 2, amount: 50 }];
let retRows = [{ code: 'W0001', c: 1, s: 90 }];
let retFail = false;
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => {
    calls.push({ s: String(sql), params });
    if (/GROUP BY COALESCE\(warehouse_code,''\)/.test(sql)) return whRows;
    if (/FROM return_orders_v2/.test(sql) && /GROUP BY 1/.test(sql)) { if (retFail) throw new Error('no such table'); return retRows; }
    return [];
  },
} });
const { listOrderFacets } = await import('../../netlify/lib/core-orders.mjs');

test('orderfacets ไม่ขอ warehouses = ไม่ยิงเพิ่ม · ไม่มีคีย์', async () => {
  calls.length = 0;
  const r = await listOrderFacets({ from: '2026-09-01', to: '2026-09-15' });
  assert.equal(calls.length, 2);
  assert.equal('byWarehouse' in r, false);
});

test('orderfacets warehouses=1 ⇒ แยกคลังในเงื่อนไขเดียวกัน · ไม่รู้คลังเป็นแถว ""', async () => {
  calls.length = 0;
  const r = await listOrderFacets({ from: '2026-09-01', to: '2026-09-15', warehouses: '1', payStatus: 'Paid' });
  const q = calls.find((c) => /GROUP BY COALESCE\(warehouse_code,''\)/.test(c.s));
  assert.ok(q);
  const ch = calls.find((c) => /GROUP BY channel/.test(c.s));
  assert.deepEqual(q.params, ch.params, 'ต้องใช้เงื่อนไขชุดเดียวกับยอดช่องทาง');
  // ⚠️ ห้ามกรองใบไม่รู้คลังทิ้งก่อนเงื่อนไขร่วม — WHERE ต้องเริ่มด้วยเงื่อนไขของ buildWhere ตรง ๆ
  assert.match(q.s, /FROM orders WHERE order_date >= \?/);
  assert.doesNotMatch(q.s, /warehouse_code (IS NOT NULL|<>|!=)/);
  assert.deepEqual(r.byWarehouse, [
    { code: 'W0001', orders: 3, amount: 300, returns: 1, returnsAmount: 90 },
    { code: '', orders: 2, amount: 50, returns: 0, returnsAmount: 0 },
  ]);
  const rq = calls.find((c) => /FROM return_orders_v2/.test(c.s) && /GROUP BY 1/.test(c.s));
  assert.ok(rq, 'ต้องมีคิวรีใบคืนรายคลัง');
  assert.deepEqual(rq.params, ch.params, 'ใบคืนต้องใช้ตัวกรองชุดเดียวกัน');
  for (const re of [/orders\.source = return_orders_v2\.source AND/, /NOT LIKE '%void%'/, /NOT LIKE '%cancel%'/]) assert.match(rq.s, re);
  assert.match(r.warehouseScope, /ยังไม่รู้คลัง/);
});

test('core.mjs — orderfacets ส่ง warehouses · topproducts warehouse= กรองจริง ตอบ 400 ค่าผิดรูป สะท้อน applied', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const f = src.indexOf('...(await listOrderFacets({');
  assert.ok(src.slice(f, src.indexOf('})),', f)).includes('warehouses: p.get("warehouses")'));
  const a = src.indexOf('if (url.searchParams.get("list") === "topproducts")');
  const blk = src.slice(a, src.indexOf('// สะพานส่งเอกสารขายเข้า PEAK', a));
  assert.match(blk, /if \(warehouse && !\/\^\[A-Za-z0-9_-\]\{1,20\}\$\/\.test\(warehouse\)\) \{\s*return json\(\{ error:[\s\S]*?\}, 400\);/);
  assert.match(blk, /if \(warehouse\) \{ filter \+= " AND o\.warehouse_code = \?"; params\.push\(warehouse\); \}/);
  assert.match(blk, /warehouse: warehouse \|\| null \}/);
  // filter ต้องถูกใช้ทั้ง 3 กิ่ง (รายเดือน · หมวด · รายสินค้า)
  assert.equal((blk.match(/\$\{filter\}/g) || []).length, 3);
});

test('poslookup ส่ง imageFile เฉพาะรูปย่อจากรูปปัจจุบัน · imagePath สามสถานะ', () => {
  const src = readFileSync(new URL('../../netlify/lib/pos.mjs', import.meta.url), 'utf8');
  assert.match(src, /\(SELECT CASE WHEN image_file_src = image_path THEN image_file ELSE NULL END FROM products WHERE sku = s\.sku\) AS image_file/);
  assert.match(src, /imagePath: r\.image_path === null \|\| r\.image_path === undefined \? null : String\(r\.image_path\)/);
  assert.match(src, /imageFile: r\.image_file \? String\(r\.image_file\) : null/);
});

test('orderfacets ใบคืนอ่านไม่ได้ ⇒ returns null (ไม่รู้) ไม่ใช่ 0 · ไม่ขอ warehouses ไม่ยิงใบคืน', async () => {
  retFail = true;
  const r = await listOrderFacets({ from: '2026-09-01', to: '2026-09-15', warehouses: '1' });
  assert.ok(r.byWarehouse.every((x) => x.returns === null && x.returnsAmount === null));
  retFail = false;
  calls.length = 0;
  await listOrderFacets({ from: '2026-09-01', to: '2026-09-15' });
  assert.equal(calls.filter((c) => /return_orders_v2/.test(c.s)).length, 0);
});
