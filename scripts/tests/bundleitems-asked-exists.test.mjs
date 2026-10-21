// รัน: node --experimental-test-module-mocks --test scripts/tests/bundleitems-asked-exists.test.mjs
//
// 🔴 **สิ่งที่เทสนี้เฝ้า: `rows: []` ของ `?list=bundleitems` มีสี่ความหมาย**
//    ① โหมดสรุปรวม — ไม่คืนแถวโดยตั้งใจ
//    ② ชุดมีจริง แต่สูตรว่าง 0 บรรทัด
//    ③ **ชุดไม่มีจริง**
//    ④ **รหัสไม่มีจริง**
//    วัดของจริง 21 ต.ค. 2569: ทั้งสี่เคสคืน `rows: []` **เหมือนกันเป๊ะ ไม่มีคีย์ไหนแยกได้เลย**
//    ⇒ จอเขียนว่า "ชุดนี้ไม่มีสินค้า" / "รหัสนี้ไม่อยู่ในชุดไหนเลย" **ทั้งที่ของนั้นไม่มีอยู่จริง**
//    🔑 เป็น **คลาสเดิมของเส้นนี้เอง** — เคยเกิดตอนท่อเมิน `member=` เงียบ ๆ (3 ก.ย. 2569)
//       รอบนั้นแก้ให้รองรับ `member=` แต่ **เคส "ของที่ถามไม่มีอยู่จริง" ไม่เคยถูกปิด**
//       ⇒ ของที่ถูกแก้ครึ่งเดียว กลับมากัดด้วยอาการเดิม
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// ชุดที่ "มีจริง" ในโลกจำลองนี้ · รหัสที่ทะเบียนสินค้ารู้จัก
let ชุดที่มี = new Set();
let รหัสที่ทะเบียนรู้จัก = new Set();
let แถวที่จะคืน = [];
let sqls = [];

mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  esc: (v) => `'${String(v).replace(/'/g, "''")}'`,
  coreQuery: async (sql) => {
    const s = String(sql); sqls.push(s);
    if (/^\s*CREATE TABLE/.test(s)) return [];
    // "ชุดนี้มีจริงไหม" — ต้องถามจากตาราง bundles
    let m = /FROM bundles WHERE sku = '([^']*)'/.exec(s);
    if (m) return ชุดที่มี.has(m[1]) ? [{ hit: 1 }] : [];
    // "รหัสนี้ทะเบียนรู้จักไหม" — ต้องถามจากตาราง products **ไม่ใช่ bundle_items**
    m = /FROM products WHERE sku = '([^']*)'/.exec(s);
    if (m) return รหัสที่ทะเบียนรู้จัก.has(m[1]) ? [{ hit: 1 }] : [];
    if (/COUNT\(DISTINCT bundle_sku\)/.test(s)) return [{ bundles: 2, lines: 7, last: null }];
    if (/FROM bundle_recipe_state/.test(s)) return [{ last: null, checked: 0, ok: 0 }];
    if (/COUNT\(\*\) AS c FROM bundles/.test(s)) return [{ c: 360 }];
    if (/FROM bundle_items WHERE bundle_sku/.test(s)) return แถวที่จะคืน;
    if (/FROM bundle_items i WHERE i\.sku/.test(s)) return แถวที่จะคืน;
    return [];
  },
} });

const { listBundleItems } = await import('../../netlify/lib/core-products.mjs');

function ตั้งค่า({ ชุด = [], รหัส = [], แถว = [] } = {}) {
  ชุดที่มี = new Set(ชุด); รหัสที่ทะเบียนรู้จัก = new Set(รหัส);
  แถวที่จะคืน = แถว; sqls = [];
}

test('① โหมดสรุปรวม: total = null (ไม่ใช่ 0) และ exists = null', async () => {
  ตั้งค่า();
  const r = await listBundleItems('', '');
  assert.equal(r.mode, 'สรุปรวม');
  // 🔑 null = "โหมดนี้ไม่คืนแถว" · 0 = "คืนแถว แต่ไม่มีแถว" — ยุบเป็นค่าเดียวคือบั๊ก
  assert.equal(r.total, null, 'โหมดสรุปรวมต้องเป็น null ห้ามเป็น 0');
  assert.equal(r.asked.exists, null);
  assert.equal(r.asked.kind, 'summary');
  assert.match(r.rowsScope, /ไม่คืนแถวโดยตั้งใจ/);
});

test('② ชุดมีจริงแต่สูตรว่าง: exists = true · total = 0', async () => {
  ตั้งค่า({ ชุด: ['B-MEEJING'], แถว: [] });
  const r = await listBundleItems('B-MEEJING', '');
  assert.equal(r.asked.exists, true, 'ชุดมีจริง ⇒ ต้อง true');
  assert.equal(r.total, 0, 'คืนแถวแล้วแต่ไม่มีแถว ⇒ 0');
});

test('③ ชุดไม่มีจริง: exists = false (เคสที่เดิมแยกจาก ② ไม่ได้)', async () => {
  ตั้งค่า({ ชุด: ['B-MEEJING'], แถว: [] });
  const r = await listBundleItems('ZZZ-NOPE-999', '');
  assert.equal(r.asked.exists, false, 'ชุดไม่มีจริง ⇒ ต้อง false');
  assert.equal(r.total, 0);
  assert.equal(r.asked.sku, 'ZZZ-NOPE-999');
});

test('④ รหัสไม่มีในทะเบียน: exists = false (เคสที่ทำจอโกหกเมื่อ 3 ก.ย.)', async () => {
  ตั้งค่า({ รหัส: ['00894'], แถว: [] });
  const r = await listBundleItems('', 'ZZZ-NOPE-999');
  assert.equal(r.asked.kind, 'member');
  assert.equal(r.asked.exists, false);
  assert.equal(r.total, 0);
});

test('⑤ ตัวควบคุมลบ: รหัสมีจริงและอยู่ในชุด ⇒ exists = true · total ตรงจำนวนแถว', async () => {
  ตั้งค่า({ รหัส: ['00894'], แถว: [{ bundleSku: 'B1' }, { bundleSku: 'B2' }] });
  const r = await listBundleItems('', '00894');
  assert.equal(r.asked.exists, true);
  assert.equal(r.total, 2);
  assert.equal(r.rows.length, 2);
});

test('⑥ "รหัสรู้จักไหม" ต้องถามจากทะเบียนสินค้า ไม่ใช่จากตารางสูตรชุด', async () => {
  // 🔑 ถามจาก bundle_items จะได้คำตอบที่ซ้ำกับ `rows` เอง
  //    ⇒ เป็นตัวตรวจที่ถามซ้ำ ไม่ใช่การทดสอบ ⇒ จะ "เขียวตลอดกาล" (tautology)
  ตั้งค่า({ รหัส: ['00894'], แถว: [] });
  await listBundleItems('', '00894');
  const ถามทะเบียน = sqls.some((s) => /FROM products WHERE sku = '00894'/.test(s));
  assert.ok(ถามทะเบียน, 'ต้องมีคิวรีถามทะเบียนสินค้า');
  const ถามสูตรชุดแทน = sqls.some((s) => /FROM bundle_items WHERE sku = '00894' LIMIT 1/.test(s));
  assert.ok(!ถามสูตรชุดแทน, 'ห้ามถามจากตารางสูตรชุดมาตอบว่ารหัสมีจริงไหม');
});

test('⑦ โหมดสรุปรวมต้องไม่ยิงคิวรี "มีจริงไหม" เลย (ไม่เสียเวลาฟรี)', async () => {
  ตั้งค่า();
  await listBundleItems('', '');
  assert.ok(!sqls.some((s) => /WHERE sku = /.test(s)),
    'โหมดสรุปรวมไม่ได้ถามถึงของชิ้นใด ⇒ ต้องไม่ยิงคิวรีหาแถวเดียว');
});
