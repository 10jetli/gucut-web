// รัน: node --experimental-test-module-mocks --test "scripts/tests/แต้มกับโค้ด-อ่านไม่ได้ห้ามแจกฟรี.test.mjs"
// t_musleri9 · B18 — อ่านกติกาแต้ม/โค้ดส่วนลดไม่ได้ ห้ามกลายเป็น "เปิดใช้งาน" หรือ "ไม่มีโควตา"
//
// 🔑 ใบนี้แตะ **เงิน** ⇒ ทิศของ "ไม่รู้" ต้องเป็น **ไม่ให้ผ่าน** ไม่ใช่ใช้ค่าเริ่มต้น
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const data = new Map();
const state = { failGet: null, failSet: null };
const fakeStore = {
  get: async (key) => {
    if (state.failGet && String(key).startsWith(state.failGet)) throw new Error('blobs อ่านล้มจำลอง');
    return data.has(key) ? structuredClone(data.get(key)) : null;
  },
  setJSON: async (key, value) => {
    if (state.failSet && String(key).startsWith(state.failSet)) throw new Error('blobs เขียนล้มจำลอง');
    data.set(key, structuredClone(value));
  },
  delete: async (key) => data.delete(key),
  list: async ({ prefix }) => ({ blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
};
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });

const { readLoyalty, อ่านกติกาแบบเข้ม } = await import('../../netlify/lib/points.mjs');
const { นับโควตาโค้ด, นับโค้ดรายคน } = await import('../../netlify/lib/coupons.mjs');

const reset = () => { data.clear(); state.failGet = null; state.failSet = null; };

/* ───────── กติกาแต้ม: ปิดไว้แล้วอ่านไม่ได้ ห้ามกลับมาเปิดเอง ───────── */

test('B18 ร้านปิดระบบแต้ม (on:false) แต่อ่านไม่ได้: ตัวอ่านแบบเข้ม **ต้องโยน**', async () => {
  reset();
  data.set('loyalty', { on: false });
  state.failGet = 'loyalty';
  await assert.rejects(() => อ่านกติกาแบบเข้ม(), 'ทางที่ให้ส่วนลด/ให้แต้ม ต้องไม่ได้ค่าที่เดาเอา');
});

test('B18 ทางแสดงผลยังได้ค่าไว้วาดจอ แต่ต้องติดธง unknown', async () => {
  reset();
  data.set('loyalty', { on: false });
  state.failGet = 'loyalty';
  const cfg = await readLoyalty();
  assert.equal(cfg.unknown, true, 'จอต้องรู้ว่านี่คือค่าที่ยังไม่ยืนยัน');
});

test('ตัวควบคุมลบ: อ่านได้และร้านปิดไว้จริง ⇒ on:false และ unknown:false', async () => {
  reset();
  data.set('loyalty', { on: false });
  const cfg = await readLoyalty();
  assert.equal(cfg.on, false, 'ค่าที่ร้านตั้งไว้ต้องชนะค่าเริ่มต้น');
  assert.equal(cfg.unknown, false, 'ช่อง unknown ต้องมีเสมอ แม้ไม่มีปัญหา');
  assert.deepEqual((await อ่านกติกาแบบเข้ม()).on, false);
});

test('ตัวควบคุมลบ: ยังไม่เคยตั้งค่าเลย (ไม่มีคีย์) ⇒ ใช้ค่าเริ่มต้นได้ ไม่ใช่ความผิดพลาด', async () => {
  reset();
  const cfg = await readLoyalty();
  assert.equal(cfg.unknown, false);
  assert.equal(cfg.on, true, 'ไม่มีคีย์ = ยังไม่ตั้ง ⇒ ค่าเริ่มต้นถูกต้อง');
  assert.equal((await อ่านกติกาแบบเข้ม()).earnPer, 100);
});

/* ───────── โควตาโค้ดส่วนลด: อ่านไม่ได้ ห้ามเงียบ ───────── */

test('B18 อ่านรายชื่อโค้ดไม่ได้: นับโควตาโค้ด **ต้องโยน** (เดิมกลืนเป็น [] แล้วไม่นับ)', async () => {
  reset();
  data.set('list', [{ code: 'SAVE50', used: 7, limit: 50 }]);
  state.failGet = 'list';
  await assert.rejects(() => นับโควตาโค้ด('SAVE50'));
  assert.equal(data.get('list')[0].used, 7, 'ห้ามแตะตัวนับเมื่ออ่านไม่ได้');
});

test('B18 เขียนรายชื่อโค้ดไม่ได้: **ต้องโยน** (เดิม .catch เงียบ ⇒ คิดว่านับแล้ว)', async () => {
  reset();
  data.set('list', [{ code: 'SAVE50', used: 7, limit: 50 }]);
  state.failSet = 'list';
  await assert.rejects(() => นับโควตาโค้ด('SAVE50'));
});

test('ตัวควบคุมลบ: อ่านได้ ⇒ โควตาเดินหน้าจริง 7 → 8', async () => {
  reset();
  data.set('list', [{ code: 'SAVE50', used: 7, limit: 50 }]);
  await นับโควตาโค้ด('SAVE50');
  assert.equal(data.get('list')[0].used, 8);
});

test('ตัวควบคุมลบ: โค้ดที่ไม่อยู่ในรายชื่อ (โค้ดลับจาก env) ⇒ ไม่โยน ไม่มีอะไรต้องนับ', async () => {
  reset();
  data.set('list', [{ code: 'SAVE50', used: 7 }]);
  await นับโควตาโค้ด('SECRETENV');
  assert.equal(data.get('list')[0].used, 7, 'ห้ามไปนับใบอื่นแทน');
});

/* ───────── โควตารายคน: อ่านบัญชีไม่ได้ ห้ามแปลว่า "ไม่มีบัญชี" ───────── */

test('B18 อ่านบัญชีลูกค้าไม่ได้: นับโค้ดรายคน **ต้องโยน** (เดิมคืน null ⇒ ข้ามการนับ)', async () => {
  reset();
  data.set('u/0812345678', { phone: '0812345678', coupons: { ONCE: { used: 1 } } });
  state.failGet = 'u/';
  await assert.rejects(() => นับโค้ดรายคน('ONCE', { phone: '0812345678' }, fakeStore));
  assert.equal(data.get('u/0812345678').coupons.ONCE.used, 1, 'ห้ามแตะของเดิม');
});

test('ตัวควบคุมลบ: อ่านได้ ⇒ ของรายคนเดินหน้า 1 → 2', async () => {
  reset();
  data.set('u/0812345678', { phone: '0812345678', coupons: { ONCE: { used: 1 } } });
  await นับโค้ดรายคน('ONCE', { phone: '0812345678' }, fakeStore);
  assert.equal(data.get('u/0812345678').coupons.ONCE.used, 2);
});

test('ตัวควบคุมลบ: ซื้อโดยไม่ล็อกอิน (ไม่มี user) ⇒ ไม่โยน ไม่ต้องนับรายคน', async () => {
  reset();
  await นับโค้ดรายคน('ONCE', null, fakeStore);
  await นับโค้ดรายคน('ONCE', { phone: '0899999999' }, fakeStore);   // ไม่มีบัญชีนี้จริง
  assert.equal(data.size, 0);
});

/* 🔑 **ข้อที่ใช้เทียบรุ่นอยู่แยกไฟล์**: `แต้ม-ปิดไว้แล้วอ่านไม่ได้.test.mjs`
   เพราะไฟล์นี้ `import` ชื่อใหม่ (`อ่านกติกาแบบเข้ม` · `นับโควตาโค้ด` · `นับโค้ดรายคน`)
   ⇒ โหลดบนโค้ดเดิมไม่ได้เลย **ทั้งไฟล์** ⇒ ใช้เป็นหลักฐานเทียบรุ่นไม่ได้
   ⚠️ จดไว้ตรง ๆ: 11 ข้อข้างบนตรวจ "สัญญารูปแบบใหม่" ไม่ใช่หลักฐานว่าพฤติกรรมเดิมผิด */
