// รัน: node --experimental-test-module-mocks --test scripts/tests/ทะเบียน-อ่านรายชื่อคีย์ไม่ได้ห้ามเป็นศูนย์.test.mjs
// B24 — `list()` ล้ม ⇒ ได้ 0 คีย์ ⇒ "ไม่มีงานทะเบียน" แทน "อ่านไม่ได้"
//
// 🔴 รูปของบั๊ก: `await s.list({prefix}).catch(() => ({ blobs: [] }))`
//    ⇒ Blobs สะดุด ⇒ `blobs = []` ⇒ ลูปไม่วน ⇒ `items = []` และ **`unreadable = 0`**
//    ⇒ หน้า /admin/permits/ ขึ้นว่า **ไม่มีงานทะเบียนเลย** ซึ่งเป็นคำตอบที่
//      **สมเหตุสมผลในวันที่ยังไม่มีลูกค้าส่งใบมา** ⇒ ไม่มีใครสงสัย
//    ⇒ ตัวตามเตือน (`runReminders`) ก็ไม่เตือนใครเลยในรอบนั้น **และรายงานว่าทำงานปกติ**
//
// 🔑 ตัวนับ `unreadable` ที่มีอยู่แล้วนับได้แค่ "แถวที่อ่านไม่ได้"
//    **นับไม่ถึงกรณีที่อ่านรายชื่อคีย์ไม่ได้ตั้งแต่ต้น** ⇒ ตัวนับเงียบพอดีตอนที่ควรดังที่สุด
//
// 🔑 ครึ่งที่สอง: `items.unreadable = n` เป็น property บน **อาร์เรย์**
//    และ `JSON.stringify` ทิ้ง property ของอาร์เรย์ทั้งหมด ⇒ ธงไม่เคยถึงจอ
//    (คลาสเดียวกับ `fieldWarning` ใน ad-stats ที่ทีมเคยแก้ด้วยการยกขึ้นเป็นคีย์ของออบเจกต์)
//
// 🔑 ต้องตกกับโค้ดเดิม · พิสูจน์แล้ว 4 ต.ค. 2569: โค้ดเดิม ⇒ ตก 3 ข้อ · ตัวแก้ ⇒ ผ่าน 6/6
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let listล้ม = false;
let คีย์ = [];
let ของ = {};

const fakeStore = {
  list: async () => {
    if (listล้ม) throw new Error('Blobs สะดุด');
    return { blobs: คีย์.map((key) => ({ key })) };
  },
  get: async (k) => (k in ของ ? ของ[k] : null),
  setJSON: async () => {},
  delete: async () => {},
};
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });

const { อ่านรายชื่อคีย์ } = await import('../../netlify/lib/blob-keys.mjs');

const ตั้ง = (keys, data = {}) => { listล้ม = false; คีย์ = keys; ของ = data; };

test('B24 · list() ล้ม ⇒ ต้องโยน (ห้ามคืน blobs ว่างให้ผู้เรียกแปลว่า "ไม่มีของ")', async () => {
  ตั้ง([]);
  listล้ม = true;
  await assert.rejects(
    () => อ่านรายชื่อคีย์(fakeStore, 'c/', 'งานทะเบียน'),
    (e) => /อ่านรายชื่อ|ไม่ได้/.test(e.message),
    '0 คีย์เพราะอ่านไม่ได้ ≠ 0 คีย์เพราะไม่มีของ',
  );
});

test('ตัวควบคุมลบ · ไม่มีคีย์จริง ⇒ ต้องคืน [] ไม่โยน', async () => {
  ตั้ง([]);
  assert.deepEqual(await อ่านรายชื่อคีย์(fakeStore, 'c/', 'งานทะเบียน'), []);
});

test('ตัวควบคุมลบ · มีคีย์ ⇒ คืนรายชื่อตามจริง', async () => {
  ตั้ง(['c/1', 'c/2']);
  assert.deepEqual(await อ่านรายชื่อคีย์(fakeStore, 'c/', 'งานทะเบียน'), ['c/1', 'c/2']);
});

// ── ธง unreadable ต้องถึงจอ ──────────────────────────────────────────────
const { อ่านทุกแถว } = await import('../../netlify/lib/blob-keys.mjs');

test('B24·2 · แถวอ่านไม่ได้ ⇒ ตัวนับต้องอยู่ในรูปที่ JSON ไม่ทิ้ง', async () => {
  ตั้ง(['c/1', 'c/2', 'c/3'], { 'c/1': { at: '1' }, 'c/3': { at: '3' } });
  const r = await อ่านทุกแถว(fakeStore, 'c/', 'งานทะเบียน');
  assert.equal(r.items.length, 2);
  assert.equal(r.unreadable, 1);
  // 🔑 ข้อที่พลาดมาก่อน: ธงเคยเป็น property บนอาร์เรย์ ⇒ JSON.stringify ทิ้ง
  assert.ok(JSON.stringify(r).includes('unreadable'), 'ธงต้องรอดการแปลงเป็น JSON');
});

test('ตัวควบคุมลบ · อ่านได้ครบ ⇒ unreadable = 0 และยังอยู่ในคำตอบ', async () => {
  ตั้ง(['c/1'], { 'c/1': { at: '1' } });
  const r = await อ่านทุกแถว(fakeStore, 'c/', 'งานทะเบียน');
  assert.equal(r.unreadable, 0);
  assert.ok(JSON.stringify(r).includes('unreadable'), 'ศูนย์ก็ต้องรายงาน ไม่ใช่ซ่อน');
});

test('B24·3 · list() ล้มในตัวอ่านทุกแถว ⇒ ต้องโยน ไม่ใช่ items ว่าง', async () => {
  ตั้ง(['c/1']);
  listล้ม = true;
  await assert.rejects(() => อ่านทุกแถว(fakeStore, 'c/', 'งานทะเบียน'));
});
