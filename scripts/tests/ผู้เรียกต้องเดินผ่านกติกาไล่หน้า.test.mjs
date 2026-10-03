// รัน: node --experimental-test-module-mocks --test "scripts/tests/ผู้เรียกต้องเดินผ่านกติกาไล่หน้า.test.mjs"
// t_musmrmqa · B23 — **ช่องว่างที่เหลือหลัง B22: ไม่มีใครตรวจว่า "ผู้เรียก" เดินผ่านกติกากลางจริง**
//
// 🔑 สถานะที่เจอตอนรับใบ B23:
//    จุดที่ใบงานชี้ (`syncTransfers` ไล่หน้าใบโอน) **ถูกแก้ไปแล้ว** โดยใบ B22 ของฝั่งท่อ
//    ซึ่งย้ายกติกาไล่หน้ามารวมที่ `lib/zort-pages.mjs` แล้วให้ `อ่านหน้าZort` **โยน** เมื่ออ่านไม่ได้
//    ⇒ B23 จึง "ไม่มีบั๊ก" **เพราะโครงสร้าง ไม่ใช่เพราะมีใครเลือกป้องกันจุดนี้ไว้**
//
// 🔴 และนั่นคือที่มาของใบนี้: เทสของ B22 ตรวจ `อ่านหน้าZort` **ตรง ๆ** (ถูกต้องตามที่ควรเป็น)
//    แต่ **ไม่มีอะไรตรวจว่าผู้เรียกแต่ละตัวยังเดินผ่านมันอยู่**
//    ⇒ ใครเขียนลูปในไฟล์ผู้เรียกใหม่เอง (หรือใส่ `.catch(() => [])` กลับเข้าไป)
//      เทสทั้งชุด **ยังเขียวหมด** เพราะกติกากลางยังถูกต้องอยู่
//    🔑 คลาส **สำเนาไม่ใช่ของร่วม / ด่านที่ไม่มีใครเรียก** — ของกลางถูก ไม่ได้แปลว่าทุกทางใช้ของกลาง
//
// ⇒ ใบนี้วัดจาก **พฤติกรรมของผู้เรียก** ไม่ใช่จากรูปร่างโค้ด:
//    ป้อนคำตอบที่อ่านไม่ได้ให้ ZORT แล้วถามว่า "ผู้เรียกโยน หรือรายงานว่ากวาดครบ"
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async () => [],
} });
process.env.ZORT_STORENAME = 'shop1';
process.env.ZORT_APIKEY = 'k1';
process.env.ZORT_APISECRET = 's1';

const { syncTransfers, syncPurchases } = await import('../../netlify/lib/core-purchases.mjs');

// คำตอบปลอมของ ZORT — ตั้งได้รายรอบ
let ตอบ = null;
globalThis.fetch = async () => ตอบ();

const ยิงไม่ถึง = () => { throw new Error('เน็ตล่ม (จำลอง)'); };
const ตอบ500 = () => ({ ok: false, status: 500, json: async () => ({}) });
const jsonเสีย = () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('JSON เสีย'); } });
const หน้าเต็ม = (n, ต่อหน้า) => ({
  ok: true, status: 200,
  json: async () => ({ list: Array.from({ length: ต่อหน้า }, (_, i) => ({
    id: `${n}-${i}`, number: `X-${n}-${i}`, transferdate: new Date().toISOString().slice(0, 10),
    purchaseorderdate: new Date().toISOString().slice(0, 10), status: 'Success',
  })) }),
});

/* ───────── syncTransfers — จุดที่ใบ B23 ชี้ ───────── */

test('B23 ใบโอน: ยิงไม่ถึง ZORT ⇒ ผู้เรียกต้องโยน ไม่ใช่รายงานว่ากวาดครบ', async () => {
  ตอบ = ยิงไม่ถึง;
  await assert.rejects(
    () => syncTransfers(90),
    /ห้ามนับว่าหมดหน้า/,
    'ของเดิมได้ list ว่าง ⇒ break ⇒ nextPage เป็น null ซึ่งสัญญาระบุว่า "ครบแล้ว"',
  );
});

test('B23 ใบโอน: ZORT ตอบ 500 ⇒ ผู้เรียกต้องโยน', async () => {
  ตอบ = ตอบ500;
  await assert.rejects(() => syncTransfers(90), /ห้ามนับว่าหมดหน้า/);
});

test('B23 ใบโอน: 200 แต่ JSON เสีย ⇒ ผู้เรียกต้องโยน', async () => {
  ตอบ = jsonเสีย;
  await assert.rejects(() => syncTransfers(90), /อ่าน JSON ไม่ได้/);
});

test('B23 ใบโอน: หน้าแรกเต็มพอดี แล้วหน้า 2 อ่านไม่ได้ ⇒ ต้องโยน (ห้ามใช้หน้าแรกเป็นของครบ)', async () => {
  let รอบ = 0;
  ตอบ = () => (++รอบ === 1 ? หน้าเต็ม(1, 200) : jsonเสีย());
  await assert.rejects(() => syncTransfers(90), /อ่าน JSON ไม่ได้/);
});

/* ───────── syncPurchases — ผู้เรียกอีกตัวในไฟล์เดียวกัน ───────── */

test('B23 ใบสั่งซื้อ: ยิงไม่ถึง ZORT ⇒ ผู้เรียกต้องโยน', async () => {
  ตอบ = ยิงไม่ถึง;
  await assert.rejects(() => syncPurchases(90), /ห้ามนับว่าหมดหน้า/);
});

test('B23 ใบสั่งซื้อ: หน้าแรกเต็มพอดี แล้วหน้า 2 ตอบ 500 ⇒ ต้องโยน', async () => {
  let รอบ = 0;
  ตอบ = () => (++รอบ === 1 ? หน้าเต็ม(1, 100) : ตอบ500());
  await assert.rejects(() => syncPurchases(90), /ห้ามนับว่าหมดหน้า/);
});

/* ───────── ตัวควบคุมลบ — ของปกติต้องไม่แดง ───────── */

test('ตัวควบคุมลบ: ใบโอนไม่มีเลยจริง (list ว่าง) ⇒ ไม่โยน และรายงาน nextPage = null (ครบแล้ว)', async () => {
  ตอบ = () => ({ ok: true, status: 200, json: async () => ({ list: [] }) });
  const ผล = await syncTransfers(90);
  assert.equal(ผล.fetched, 0);
  assert.equal(ผล.nextPage, null, 'ว่างจริง = ครบจริง ⇒ ต้องบอกว่าครบ');
});

test('ตัวควบคุมลบ: ใบโอนหน้าเดียวไม่เต็ม ⇒ สำเร็จ และ nextPage = null', async () => {
  ตอบ = () => หน้าเต็ม(1, 3);
  const ผล = await syncTransfers(90);
  assert.equal(ผล.nextPage, null, 'หน้าสั้น = หลักฐานเดียวที่บอกว่าหมดจริง');
  assert.ok(ผล.fetched >= 1);
});
