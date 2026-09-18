// รัน: node --experimental-test-module-mocks --test scripts/tests/stock-push-guards.test.mjs
// 17 ก.ย. 2569 · gucut2 — ด่าน ⑥ ⑧ ต้องมีก่อนตัวยิง Shopee/TikTok (CEO สั่ง 12 ก.ย.)
// 🔴 สิ่งที่เฝ้า: ใบค้างส่ง = จ่ายแล้ว(ไม่ใช่ Unpaid)+ยังไม่สำเร็จ+ไม่ยกเลิก · ชุด↔ชิ้นส่วนสองทิศ · อ่านไม่ได้ = error ไม่ใช่เซ็ตว่าง
//    reopen ไม่มีคนยืนยันไม่ยิง · ทิศลงต้อง allowClose · ด่าน ⑧ ทับทุกชนิดรวม up
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { readFileSync } from 'node:fs';

let lines = [];
let recipe = [];
let fail = null;
const sqls = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreQuery: async (sql) => {
    sqls.push(String(sql));
    if (fail) throw new Error(fail);
    if (/FROM order_items i JOIN orders o/.test(sql)) return lines;
    if (/FROM bundle_items/.test(sql)) return recipe;
    return [];
  },
} });
const { รหัสในใบค้างส่ง, ด่านบนชั้น } = await import('../../netlify/lib/stock-push-guards.mjs');

test('ใบค้างส่ง: เงื่อนไข SQL ตรงนิยาม "ต้องส่งของ" และตัด Unpaid', async () => {
  sqls.length = 0; fail = null; lines = [{ sku: 'A', oid: 'z1/1' }, { sku: 'B', oid: 'z1/1' }]; recipe = [];
  const r = await รหัสในใบค้างส่ง();
  assert.deepEqual([...r.skus].sort(), ['A', 'B']);
  assert.equal(r.orders, 1);
  const q = sqls.find((s) => /order_items/.test(s));
  assert.match(q, /NOT LIKE '%Success%'/);
  assert.match(q, /NOT LIKE '%cancel%'/);
  assert.match(q, /LIKE '%paid%'/);
  assert.match(q, /NOT LIKE '%unpaid%'/);
});

test('ของชุด: ชุดค้าง ⇒ ชิ้นส่วนค้าง · ชิ้นส่วนค้าง ⇒ ชุดอื่นที่ใช้ชิ้นนั้นค้าง', async () => {
  fail = null;
  lines = [{ sku: 'SET-1', oid: 'z1/2' }];
  recipe = [{ b: 'SET-1', base: 'ROLL' }, { b: 'SET-2', base: 'ROLL' }, { b: 'SET-3', base: 'OTHER' }];
  const r = await รหัสในใบค้างส่ง();
  assert.ok(r.skus.has('ROLL'));
  assert.ok(r.skus.has('SET-2'));
  assert.ok(!r.skus.has('SET-3'));
});

test('อ่านไม่ได้ ⇒ error (ไม่ใช่เซ็ตว่างที่แปลว่า "ไม่มีค้าง")', async () => {
  fail = 'D1 500';
  const r = await รหัสในใบค้างส่ง();
  assert.match(r.error, /อ่านใบค้างส่งไม่ได้/);
  assert.equal(r.skus, undefined);
  fail = null;
});

test('ด่านบนชั้น: ⑧ ทับทุกชนิด · ⑥ reopen ต้องยืนยันรายรหัส · ทิศลงต้อง allowClose', () => {
  const ค้างส่ง = new Set(['HOT']);
  assert.match(ด่านบนชั้น({ sku: 'HOT', kind: 'up', from: 1, to: 2 }, { ค้างส่ง }), /ใบค้างส่ง/);
  assert.match(ด่านบนชั้น({ sku: 'HOT', kind: 'reopen', from: 0, to: 5 }, { ค้างส่ง, confirmReopen: new Set(['HOT']) }), /ใบค้างส่ง/);
  assert.match(ด่านบนชั้น({ sku: 'R', kind: 'reopen', from: 0, to: 5 }, { ค้างส่ง }), /confirmReopen/);
  assert.equal(ด่านบนชั้น({ sku: 'R', kind: 'reopen', from: 0, to: 5 }, { ค้างส่ง, confirmReopen: new Set(['R']) }), null);
  assert.match(ด่านบนชั้น({ sku: 'D', kind: 'down', from: 5, to: 3 }, { ค้างส่ง }), /allowClose/);
  assert.match(ด่านบนชั้น({ sku: 'C', kind: 'close', from: 5, to: 0 }, { ค้างส่ง }), /allowClose/);
  assert.equal(ด่านบนชั้น({ sku: 'D', kind: 'down', from: 5, to: 3 }, { ค้างส่ง, allowClose: true }), null);
  assert.equal(ด่านบนชั้น({ sku: 'U', kind: 'up', from: 1, to: 3 }, { ค้างส่ง }), null);
  assert.match(ด่านบนชั้น({ sku: 'U', kind: 'up', from: 1, to: 3 }, { ค้างส่ง: null }), /ตรวจด่าน ⑧ ไม่ได้/);
});

/* ── คำปฏิเสธที่ซ้อนอยู่ในคำยืนยัน (18 ก.ย. 2569) ─────────────────────────────
   🔴 ต่อยอดจากที่ฝั่งจอเจอบนจอ: "เปิดใช้งาน" มีคำว่า "ปิดใช้งาน" อยู่ข้างในเป๊ะ ๆ
      รูปเดียวกันอยู่ในด่านนี้ และที่นี่ **แตะเงินจริง**:
      "จัดส่งไม่สำเร็จ" มี "สำเร็จ" · "Unsuccessful" มี "Success"
      ⇒ ใบที่ยังค้างจะถูกอ่านว่าเสร็จแล้ว ⇒ ไม่ถูกกัน ⇒ ดันสต็อกทั้งที่ของยังไม่ได้ส่ง
   ⚠️ ด่านนี้ตรวจรูป SQL เพราะเงื่อนไขเป็นสตริงที่ประกอบเข้าคำสั่ง (ไม่มีทางเรียกทดสอบตรง ๆ)
      ⇒ ตัดคอมเมนต์ก่อนตรวจ ไม่งั้นร้องใส่คำเตือนที่ต้องพิมพ์รูปที่ห้ามเอง */
test('NOTDONE ต้องกันคำว่า "ไม่สำเร็จ" และ "unsuccess" ไม่ให้ถูกอ่านว่าเสร็จแล้ว', () => {
  const src = readFileSync(new URL('../../netlify/lib/stock-push-guards.mjs', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const at = code.indexOf('const NOTDONE');
  const block = code.slice(at, code.indexOf(';', at));
  assert.match(block, /unsuccess/i, 'ต้องกัน Unsuccessful — มันมีคำว่า Success อยู่ข้างใน');
  assert.match(block, /ไม่สำเร็จ/, 'ต้องกัน "ไม่สำเร็จ" — มันมีคำว่า "สำเร็จ" อยู่ข้างใน');
  /* 🟢 และตัวตรงข้ามต้อง **ไม่** ถูกทำให้สมมาตร — NOTCANCEL พลาดไปทางไม่ดัน ซึ่งปลอดภัย */
  const ac = code.indexOf('const NOTCANCEL');
  const bc = code.slice(ac, code.indexOf(';', ac));
  assert.doesNotMatch(bc, /ยกเลิกไม่/,
    'ห้ามทำ NOTCANCEL ให้สมมาตรกับ NOTDONE — ที่นี่การพลาดไปทาง "ไม่ดัน" ปลอดภัยกว่า');
});
