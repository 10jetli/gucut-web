// รัน: node --experimental-test-module-mocks --test scripts/tests/ใบของเข้า-บอกต้นทุนได้.test.mjs
// ใบ t_mutopb3l ขั้นที่ 3 — ถัวเฉลี่ยเคลื่อนที่ต้องรู้ว่า "ของล็อตนั้นเข้ามาด้วยราคาเท่าไร"
//
// 🔴 ของเดิม `stock_moves` มีแค่ (sku · qty · reason · ref · at) ⇒ ของเข้าทุกใบไม่เคยบันทึกราคา
// 🔑 เทสนี้ยิง `applyMoves()` **ตัวจริง** แล้วอ่านคำสั่ง SQL ที่พ่นออกมา
//    และทุกข้อมี **คู่ตรงข้าม** ⇒ ด่านที่ "ห้ามทุกอย่าง" หรือ "ปล่อยทุกอย่าง" จะตก ไม่ใช่ผ่าน
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const คำสั่งที่ยิง = [];
mock.module('../../netlify/lib/coredb.mjs', {
  namedExports: {
    coreReady: () => true,
    แถวจากผล: (r) => (Array.isArray(r) ? r : (r?.results ?? [])),
    coreQuery: async (sql) => {
      คำสั่งที่ยิง.push(sql);
      if (/COUNT/i.test(sql)) return [{ n: 0 }];
      return [];
    },
  },
});

const { applyMoves, เหตุผลที่รับต้นทุนได้, REASONS } =
  await import('../../netlify/lib/stock-moves.mjs');
const คำสั่งเขียน = () => คำสั่งที่ยิง.find((s) => /INSERT OR IGNORE INTO stock_moves/i.test(s));
const ยิง = async (...moves) => { คำสั่งที่ยิง.length = 0; return applyMoves(moves); };

test('① ใบของเข้าที่บอกต้นทุนมา ต้องถูกเขียนลงช่อง unit_cost', async () => {
  const r = await ยิง({ sku: 'A1', qty: 10, reason: 'receive', ref: 'PO-1', unitCost: 6.25 });
  const sql = คำสั่งเขียน();
  assert.match(sql, /\(sku,qty,reason,ref,at,unit_cost\)/, 'ไม่มีช่อง unit_cost ในคำสั่งเขียน');
  assert.match(sql, /'A1',10,'receive','PO-1',datetime\('now'\),6\.25/);
  assert.equal(r.ใบที่บอกต้นทุนมา, 1);
  assert.equal(r.ใบที่ไม่ได้บอกต้นทุน, 0);
});

test('② 🔑 ไม่ส่ง unitCost มา = NULL (ไม่ได้บอกต้นทุน) ห้ามเป็น 0', async () => {
  const r = await ยิง({ sku: 'A2', qty: 5, reason: 'receive', ref: 'PO-2' });
  assert.match(คำสั่งเขียน(), /'A2',5,'receive','PO-2',datetime\('now'\),NULL/,
    '🔴 "ไม่ได้บอกต้นทุน" ถูกเขียนเป็น 0 ⇒ ตัวคิดเฉลี่ยจะถ่วงต้นทุนของรหัสนั้นลงเป็นศูนย์');
  assert.equal(r.ใบที่ไม่ได้บอกต้นทุน, 1);
  assert.equal(r.ใบที่บอกต้นทุนมา, 0);
});

test('③ คู่ตรงข้ามของข้อ ②: ส่ง 0 มาจริง ต้องเก็บเป็น 0 (ของแถม/ตัวอย่าง)', async () => {
  await ยิง({ sku: 'A3', qty: 2, reason: 'receive', ref: 'PO-3', unitCost: 0 });
  assert.match(คำสั่งเขียน(), /'A3',2,'receive','PO-3',datetime\('now'\),0/,
    'ศูนย์ที่คนกรอกว่าศูนย์จริง ต้องไม่ถูกแปลงเป็น NULL — สองสถานะนี้คนละความหมาย');
});

test('④ ส่ง unitCost มากับเหตุผล "ทางออก" ต้องถูกตีกลับพร้อมเหตุ', async () => {
  const r = await ยิง({ sku: 'A4', qty: -3, reason: 'transfer_out', ref: 'TR-1', unitCost: 9 });
  assert.equal(r.error, 'ไม่มีรายการที่ใช้ได้', 'ต้องไม่เขียนลงฐานเลย');
  assert.match(r.bad[0].why, /unitCost ใส่ได้เฉพาะของเข้า/);
  assert.ok(!คำสั่งเขียน(), '🔴 ไม่ควรมีคำสั่งเขียนเลยเมื่อทุกใบถูกตีกลับ');
});

test('⑤ คู่ตรงข้ามของข้อ ④: เหตุผลทางออกที่ **ไม่ส่ง** unitCost ต้องผ่านปกติ', async () => {
  const r = await ยิง({ sku: 'A5', qty: -3, reason: 'transfer_out', ref: 'TR-2' });
  assert.equal(r.bad, undefined, '🔴 ด่านกว้างเกิน — ไปห้ามใบโอนออกธรรมดาที่ร้านใช้ทุกวัน');
  assert.match(คำสั่งเขียน(), /'A5',-3,'transfer_out','TR-2',datetime\('now'\),NULL/);
});

test('⑥ unitCost ติดลบ ต้องถูกตีกลับ (ของที่ได้เงินคืนต้องเป็นใบคืน ไม่ใช่ต้นทุนลบ)', async () => {
  const r = await ยิง({ sku: 'A6', qty: 1, reason: 'receive', ref: 'PO-6', unitCost: -5 });
  assert.match(r.bad[0].why, /ติดลบไม่ได้/);
});

test('⑦ unitCost ที่ไม่ใช่ตัวเลข ต้องตีกลับ — ไม่ใช่กลายเป็น NULL เงียบ ๆ', async () => {
  const r = await ยิง({ sku: 'A7', qty: 1, reason: 'receive', ref: 'PO-7', unitCost: 'หกบาท' });
  assert.match(r.bad[0].why, /ต้องเป็นตัวเลข/,
    '🔴 กลืนค่าที่กรอกผิดเป็น NULL = คนกรอกเชื่อว่าบันทึกต้นทุนแล้ว ทั้งที่ไม่ได้บันทึก');
});

test('⑧ รายชื่อเหตุผลที่รับต้นทุนต้องเป็น "ของเข้า" จริงทุกตัว และต้องมีแหล่งเดียว', () => {
  /* ยืนยันบนค่าที่ส่งออกมาจริง ไม่ใช่อ่านซอร์สเป็นข้อความ (คอมเมนต์หลอกด่านได้) */
  assert.deepEqual([...เหตุผลที่รับต้นทุนได้].sort(), ['receive', 'return_in', 'transfer_in']);
  for (const k of เหตุผลที่รับต้นทุนได้) assert.ok(REASONS[k], `${k} ต้องเป็นเหตุผลที่ระบบรับอยู่จริง`);
  /* และทางออกต้องไม่หลุดเข้ามา — คู่ตรงข้ามของรายชื่อ */
  for (const k of ['transfer_out', 'damage', 'adjust'])
    assert.ok(!เหตุผลที่รับต้นทุนได้.includes(k), `${k} เป็นทางออก/ปรับยอด ห้ามรับต้นทุนกรอกมือ`);
});
