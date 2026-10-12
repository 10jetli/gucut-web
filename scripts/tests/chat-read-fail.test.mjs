/* ด่าน B13 ขาอ่าน (ใบ t_mv4pltx9) — ขาเขียนถูกแก้ไปแล้ว 14 ก.ย.
 * 🔴 ที่เหลือคืออาการที่ใบงานเขียนไว้เองสองข้อ:
 *    "ข้อความเก่าหาย · GET ห้องเดิมได้ messages:[] 200" และ "รายชื่อห้องขาดโดยไม่มีตัวบอก"
 * 🔑 และฝั่งลูกค้ามีสถานะ `down` รองรับอยู่แล้ว (`if (!r.ok) throw` ⇒ `setDown(true)` ใน ChatSheet)
 *    ⇒ การกลืนที่เซิร์ฟเวอร์ทำให้สถานะนั้น **ไม่เคยถูกใช้เลย** — ทางถอยที่จอเตรียมไว้ถูกท่อปิดปาก
 */
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const data = new Map();
let failKey = null;
const fakeStore = {
  get: async (k) => { if (failKey && k === failKey) throw new Error('blobs ล่มจำลอง'); return data.has(k) ? data.get(k) : null; },
  setJSON: async (k, v) => data.set(k, v),
  delete: async (k) => { data.delete(k); },
  list: async () => ({ blobs: [...data.keys()].map((key) => ({ key })) }),
};
const reset = () => { data.clear(); failKey = null; };
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('../../netlify/lib/admin-gate.mjs', { namedExports: { adminGate: async () => ({ ok: true }) } });
const { default: chat } = await import('../../netlify/functions/chat.mjs');

const ห้อง = (cid, n = 2) => ({ cid, name: 'ลูกค้า', phone: '081', messages: Array.from({ length: n }, (_, i) => ({ from: 'c', text: `ข้อความ ${i}`, at: i })) });
const getห้อง = (cid) => new Request(`https://x/api/chat?cid=${cid}`, { method: 'GET' });
const getรายการ = () => new Request('https://x/api/chat', { method: 'GET', headers: { 'x-admin-key': 'k' } });

test('🔴 อ่านบทสนทนาไม่ได้ ⇒ 503 + ธง (ห้ามตอบห้องเปล่า 200 — ลูกค้าจะเห็นว่าข้อความหาย)', async () => {
  reset();
  data.set('room-abcdefgh', ห้อง('room-abcdefgh', 3));
  failKey = 'room-abcdefgh';
  const r = await chat(getห้อง('room-abcdefgh'), {});
  assert.notEqual(r.status, 200, 'อ่านไม่ได้ ห้ามตอบ 200');
  const b = await r.json();
  assert.equal(b.อ่านไม่ได้, true);
  assert.equal(b.thread, undefined, 'ห้ามส่ง thread เปล่า — ฝั่งลูกค้าอ่านว่า messages ว่าง');
  assert.match(String(b.error || ''), /ยังอยู่ครบ|ไม่ได้หาย/, 'ต้องบอกลูกค้าว่าข้อความไม่ได้หาย');
});

test('ตัวควบคุมลบ: ห้องใหม่จริง (ไม่มีคีย์) ⇒ 200 + บทสนทนาเปล่า · ห้องที่มีของ ⇒ ส่งครบ', async () => {
  reset();
  const ใหม่ = await chat(getห้อง('room-newnewnew'), {});
  assert.equal(ใหม่.status, 200);
  assert.deepEqual((await ใหม่.json()).thread.messages, [], 'ไม่มีคีย์ = ห้องใหม่จริง');

  reset();
  data.set('room-abcdefgh', ห้อง('room-abcdefgh', 3));
  const มี = await chat(getห้อง('room-abcdefgh'), {});
  assert.equal((await มี.json()).thread.messages.length, 3);
});

test('🔴 รายการห้องของร้าน: ห้องที่อ่านไม่ได้ต้องถูกนับ ไม่ใช่หายเงียบ', async () => {
  reset();
  data.set('room-aaaaaaaa', ห้อง('room-aaaaaaaa'));
  data.set('room-bbbbbbbb', ห้อง('room-bbbbbbbb'));
  failKey = 'room-bbbbbbbb';
  const b = await (await chat(getรายการ(), {})).json();
  assert.equal(b.rooms.length, 1, 'ห้องที่อ่านได้ต้องยังแสดง — ร้านต้องตอบต่อได้');
  assert.equal(b.ห้องที่อ่านไม่ได้, 1, '🔑 ต้องมีตัวนับ ไม่งั้นลูกค้าในห้องนั้นไม่มีใครเห็น');
  assert.equal(b.ห้องว่างเปล่า, 0, 'แยก "อ่านไม่ได้" ออกจาก "ไม่มีเนื้อ"');
});

test('ตัวควบคุมลบ: อ่านได้ทุกห้อง ⇒ ตัวนับเป็น 0 (ส่งออกเสมอ ไม่ใช่ซ่อนเมื่อ 0)', async () => {
  reset();
  data.set('room-aaaaaaaa', ห้อง('room-aaaaaaaa'));
  const b = await (await chat(getรายการ(), {})).json();
  assert.equal(b.rooms.length, 1);
  assert.equal(b.ห้องที่อ่านไม่ได้, 0);
  assert.ok('ห้องว่างเปล่า' in b, 'ตัวนับต้องมีคีย์เสมอ — จอแยก "ท่อยังไม่ส่ง" ออกจาก "ส่งแล้วเป็นศูนย์" ได้');
});
