// รัน: node --experimental-test-module-mocks --test scripts/tests/ใบขาย-ส่งต้นทุนรายบรรทัด.test.mjs
// ใบ t_muu0gaih ข้อ 6 — คุณส้มขอ 5 ต.ค. 2569: "กำไรรายบรรทัดต้องมีช่องต้นทุนมากับแถว
// แถวจากเส้นไหน ช่องชื่ออะไร — และผมจะไม่เดาชื่อช่องเอง"
//
// 🔴 **คำตอบคือ "ยังไม่มีเส้นไหนส่งให้เลย"** — `order_item_cost` ถูก SELECT ที่เดียวในทั้งระบบ
//    คือตัวนับภายในของ core-sync ⇒ ต้นทุนที่ตรึงลงทุกบรรทัด **ไม่มีทางอ่าน**
//    🔑 คลาสนี้เจอ **3 ครั้งในคืนเดียว** (unit_cost ใน stock_moves · 4 คอลัมน์เงินใน shopee_fees ·
//      ตารางนี้) ⇒ ช่องที่เขียนลงแต่ไม่มีใครอ่าน **ผ่านทุกการทดสอบฝั่งเขียนโดยนิยาม**
//      ⇒ ด่านต้องอยู่ฝั่งอ่าน
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { readFileSync } from 'node:fs';

let แถวใบ = [{ id: 'z1/123', number: 'SO-1', amount: 1000 }];
let แถวบรรทัด = [];
const คำสั่งที่ยิง = [];
mock.module('../../netlify/lib/coredb.mjs', {
  namedExports: {
    coreReady: () => true,
    แถวจากผล: (r) => (Array.isArray(r) ? r : (r?.results ?? [])),
    coreQuery: async (sql, params) => {
      คำสั่งที่ยิง.push(sql);
      if (/FROM orders WHERE id = \?/.test(sql)) return แถวใบ;
      if (/FROM order_items i/.test(sql)) return แถวบรรทัด;
      return [];
    },
  },
});
const { getOrder } = await import('../../netlify/lib/core-orders.mjs');

test('① แถวของใบขายต้องมีช่อง unit_cost และ cost_source มาด้วย', async () => {
  แถวบรรทัด = [
    { line: 1, sku: 'A1', name: 'โซ่', qty: 2, amount: 600, discount: 0, unit_cost: 120, cost_source: 'ใบซื้อ' },
    { line: 2, sku: 'B2', name: 'บาร์', qty: 1, amount: 400, discount: 0, unit_cost: null, cost_source: null },
  ];
  const r = await getOrder('z1/123');
  assert.equal(r.items.length, 2);
  for (const it of r.items) {
    assert.ok('unit_cost' in it, 'ทุกแถวต้องมีคีย์ unit_cost (null ได้ แต่ต้องมีคีย์)');
    assert.ok('cost_source' in it, 'และต้องมี cost_source บอกที่มา');
  }
});

test('② 🔴 บรรทัดที่ยังไม่ตรึงต้นทุนต้องเป็น null ไม่ใช่ 0 — และท่อห้ามแปลงให้', async () => {
  /* ถ้าท่อแปลง null เป็น 0 ให้ จอจะคิดกำไร = ราคาขายเต็ม (กำไร 100%) และดูเหมือนเลขจริง
     ⇒ ความต่างระหว่าง "ไม่รู้" กับ "ศูนย์" ต้องรอดมาถึงจอ */
  const r = await getOrder('z1/123');
  const ไม่ตรึง = r.items.find((x) => x.line === 2);
  assert.equal(ไม่ตรึง.unit_cost, null, 'ต้องเป็น null ห้ามเป็น 0');
  assert.notEqual(ไม่ตรึง.unit_cost, 0);
});

test('③ 🔑 SQL ต้อง LEFT JOIN ไม่ใช่ JOIN — ไม่งั้นบรรทัดที่ไม่มีต้นทุนหายจากใบ', async () => {
  /* JOIN ธรรมดาจะตัดบรรทัดที่ยังไม่ตรึงต้นทุนออก ⇒ ใบขายจะแสดงสินค้าไม่ครบ
     และยอดรวมบรรทัดจะไม่เท่ายอดหัวใบ ⇒ **อาการโผล่คนละที่กับต้นเหตุ** */
  const sql = คำสั่งที่ยิง.find((x) => /FROM order_items i/.test(x)) ?? '';
  assert.ok(sql, 'ต้องมีคำสั่งอ่านบรรทัด');
  assert.ok(/LEFT JOIN order_item_cost/.test(sql), 'ต้องเป็น LEFT JOIN');
  assert.ok(/c\.line = i\.line/.test(sql), 'ต้องจับคู่ด้วย (order_id, line) ไม่ใช่ sku — บรรทัดเดียวกันมี sku ซ้ำได้');
  assert.ok(/c\.source AS cost_source/.test(sql), 'ต้องตั้งชื่อ cost_source ตามที่ประกาศกับฝั่งจอ');
});

test('④ 🔬 พลังแยกแยะของ ③: JOIN ธรรมดาต้องถูกจับได้', () => {
  const ปลอม = 'SELECT i.line FROM order_items i JOIN order_item_cost c ON c.order_id = i.order_id';
  assert.ok(!/LEFT JOIN order_item_cost/.test(ปลอม), 'JOIN ธรรมดาต้องไม่ผ่านเงื่อนไขของ ③');
});

test('⑤ 🔑 วิธีคิดกำไรรายบรรทัดต้องเขียนกำกับไว้ในซอร์ส — จออ่านเองไม่ออก', () => {
  /* unit_cost เป็น **ต่อหน่วย** แต่ amount เป็น **ยอดรวมของบรรทัด**
     ⇒ ถ้าไม่เขียนไว้ จอจะคิด amount − unit_cost (ลืมคูณ qty) แล้วกำไรเกินจริงทุกบรรทัดที่ qty > 1
     เคยเจอคลาสนี้แล้ว: จอที่เขียนจากสัญญาในจดหมายแล้วอ่านช่องที่ท่อไม่เคยส่ง */
  const s = readFileSync('netlify/lib/core-orders.mjs', 'utf8');
  assert.ok(/unit_cost.*×.*qty|unit_cost. × .qty/.test(s), 'ต้องเขียนสูตรว่าคูณ qty');
  assert.ok(/ห้ามแปลงเป็น 0/.test(s), 'ต้องเขียนข้อห้ามแปลง null เป็น 0');
  assert.ok(/ต่อหน่วย ไม่ใช่ต่อบรรทัด/.test(s), 'ต้องระบุชัดว่า unit_cost เป็นต่อหน่วย');
});
