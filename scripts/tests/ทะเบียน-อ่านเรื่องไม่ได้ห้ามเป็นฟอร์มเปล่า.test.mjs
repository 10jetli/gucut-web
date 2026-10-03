// รัน: node --experimental-test-module-mocks --test scripts/tests/ทะเบียน-อ่านเรื่องไม่ได้ห้ามเป็นฟอร์มเปล่า.test.mjs
// B25 — อ่านเรื่องของลูกค้าไม่ได้ ⇒ คืน "ฟอร์มเปล่า" เหมือนยังไม่ยื่น
//
// 🔴 `let rec = await s.get(key).catch(() => null); if (!rec) rec = blank(...)`
//    ⇒ รวม **"ยังไม่เคยยื่น" (ปกติ)** กับ **"อ่านไม่ได้" (ผิดปกติ)** เป็นอย่างเดียวกัน
//    · ทาง `?mine=1` ⇒ ลูกค้าเห็นว่า **ยังไม่ยื่น** ทั้งที่ยื่นแล้ว (อ่านอย่างเดียว ยังกู้ได้)
//    · ทาง **POST** ⇒ ฟอร์มเปล่ากลายเป็น **ฐานของสิ่งที่จะเขียนกลับ**
//      ⇒ `setJSON(key, rec)` **ทับประวัติจริงของลูกค้าทั้งใบ** (ขั้น · history · จำนวนรูป)
//      ⇒ **ของหายถาวร ไม่มี error ให้ใครเห็น** และหน้าจอขึ้นว่าบันทึกสำเร็จ
//
// 🔑 คลาสเดียวกับ B15 (ทางเขียนใช้ตัวอ่านที่ถอยเป็นค่าเริ่มต้น) แต่แรงกว่า
//    เพราะที่นี่ค่าเริ่มต้นคือ **ใบเปล่าของลูกค้ารายนั้น** ⇒ ทับได้ทันทีโดยดูสมเหตุสมผล
//
// 🔑 ต้องตกกับโค้ดเดิม · พิสูจน์แล้ว 4 ต.ค. 2569: โค้ดเดิม ⇒ ตก 4 ข้อ · ตัวแก้ ⇒ ผ่าน 7/7
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let อ่านพลาด = false;
const ถัง = new Map();
const เขียนไป = [];

const fakeStore = {
  get: async (k) => {
    if (อ่านพลาด) throw new Error('Blobs สะดุด');
    return ถัง.has(k) ? JSON.parse(ถัง.get(k)) : null;
  },
  setJSON: async (k, v) => { เขียนไป.push([k, v]); ถัง.set(k, JSON.stringify(v)); },
  set: async () => {},
  delete: async () => {},
  list: async ({ prefix } = {}) => ({
    blobs: [...ถัง.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((key) => ({ key })),
  }),
};
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('../../netlify/lib/session.mjs', {
  namedExports: {
    currentUser: async () => ({ user: { phone: '0811111111', name: 'ลูกค้า' } }),
    normPhone: (p) => String(p || '').replace(/\D/g, ''),
    store: () => fakeStore,
  },
});
mock.module('../../netlify/lib/admin-gate.mjs', {
  namedExports: { adminGate: async () => ({ ok: true, wants: true, deny: null }) },
});
mock.module('../../netlify/lib/tg.mjs', { namedExports: { tg: async () => {} } });

const mod = await import('../../netlify/functions/permit-doc.mjs');
const handler = mod.default ?? mod.handler;

const เรื่องจริง = {
  phone: '0811111111', name: 'ลูกค้า', stage: 'lz2',
  history: { lz1: '2026-09-01T00:00:00Z', lz2: '2026-09-20T00:00:00Z' },
  images: 2, at: '2026-09-01T00:00:00Z',
};
const ตั้ง = () => {
  ถัง.clear(); เขียนไป.length = 0; อ่านพลาด = false;
  ถัง.set('c/0811111111', JSON.stringify(เรื่องจริง));
};
const ยิง = (u, init) => handler(new Request(u, init), { geo: {} });

test('ตัวควบคุมลบ · อ่านได้ปกติ + ?mine=1 ⇒ ต้องเห็นเรื่องจริง', async () => {
  ตั้ง();
  const r = await ยิง('https://x/api/permit-doc?mine=1');
  const d = await r.json();
  assert.equal(d.item.stage, 'lz2', 'ต้องเห็นขั้นจริง ไม่ใช่ฟอร์มเปล่า');
});

test('B25 · อ่านพลาด + ?mine=1 ⇒ ห้ามคืนฟอร์มเปล่าเหมือนยังไม่ยื่น', async () => {
  ตั้ง(); อ่านพลาด = true;
  const r = await ยิง('https://x/api/permit-doc?mine=1');
  assert.notEqual(r.status, 200, `อ่านไม่ได้ต้องไม่ตอบ 200 (ได้ ${r.status})`);
  const d = await r.json().catch(() => ({}));
  assert.ok(!d.item || d.item.stage, 'ห้ามส่งใบเปล่าที่ดูเหมือน "ยังไม่ยื่น"');
});

test('B25 · อ่านพลาด + POST ⇒ **ห้ามเขียนทับเรื่องจริง**', async () => {
  ตั้ง(); อ่านพลาด = true;
  const r = await ยิง('https://x/api/permit-doc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ note: 'ส่งใบแล้ว' }),
  });
  assert.notEqual(r.status, 200);
  assert.equal(เขียนไป.length, 0,
    'อ่านไม่ได้แล้วยังเขียน = ประวัติลูกค้าถูกทับด้วยใบเปล่า (ของหายถาวร)');
});

test('B25 · ร้านเปิดใบด้วยเบอร์ · อ่านพลาด ⇒ ต้องไม่ตอบ 404 "ไม่พบเรื่องนี้"', async () => {
  ตั้ง(); อ่านพลาด = true;
  const r = await ยิง('https://x/api/permit-doc?phone=0811111111');
  assert.notEqual(r.status, 404, '"อ่านไม่ได้" ไม่ใช่ "ไม่มีเรื่องนี้" — ร้านจะเข้าใจว่าลูกค้าไม่เคยยื่น');
});

test('ตัวควบคุมลบ · ร้านเปิดใบของเบอร์ที่ไม่เคยยื่น ⇒ ยังต้องเป็น 404', async () => {
  ตั้ง();
  const r = await ยิง('https://x/api/permit-doc?phone=0899999999');
  assert.equal(r.status, 404, 'ไม่มีจริง = 404 ถูกต้อง');
});

test('B25 · PATCH เปลี่ยนขั้น · อ่านพลาด ⇒ ต้องไม่ตอบ 404 และห้ามเขียน', async () => {
  ตั้ง(); อ่านพลาด = true;
  const r = await ยิง('https://x/api/permit-doc', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '0811111111', stage: 'done' }),
  });
  assert.notEqual(r.status, 404);
  assert.equal(เขียนไป.length, 0);
});

test('ตัวควบคุมลบ · POST ของลูกค้าที่ยังไม่เคยยื่น ⇒ ต้องสร้างใบใหม่ได้ปกติ', async () => {
  ถัง.clear(); เขียนไป.length = 0; อ่านพลาด = false;   // ไม่มี c/<เบอร์> เลย
  const r = await ยิง('https://x/api/permit-doc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ note: 'ยื่นครั้งแรก' }),
  });
  assert.equal(r.status, 200, 'ยังไม่เคยยื่น ≠ อ่านไม่ได้ ⇒ ต้องยื่นครั้งแรกได้');
  assert.ok(เขียนไป.length > 0, 'ต้องเขียนใบใหม่จริง');
});
