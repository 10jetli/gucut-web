// ด่าน B04 ตระกูลเดียวกัน ขา GET ของ /api/points — ใบ t_mv4jjur5
// 🔑 เกณฑ์: "อ่านแต้มไม่ได้" ห้ามถูกพูดออกไปเป็น "คุณมี 0 แต้ม"
//    เดิม catch แล้วคอมเมนต์ว่า "ไม่ได้ล็อกอิน" ⇒ ลูกค้าที่มี 1,200 แต้มเห็น points:0 + HTTP 200
//    ⇒ อ่านได้ความเดียวว่า "แต้มฉันหาย" ซึ่งเป็นคำกล่าวอ้างเท็จ
// ⚠️ guest (คนนอกจริง) ต้องยังตอบ 200 + points 0 — นั่นคือความจริงของคนนอก ห้ามแก้แรงเกิน
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let สภาพ = { state: 'guest' };
const fakeStore = { get: async () => null, setJSON: async () => {} };
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('../../netlify/lib/admin-gate.mjs', { namedExports: { adminGate: async () => ({ ok: false }) } });
mock.module('../../netlify/lib/session.mjs', { namedExports: {
  currentUserState: async () => สภาพ,
  normPhone: (v) => String(v ?? ''),
  store: () => fakeStore,
} });
mock.module('../../netlify/lib/points.mjs', { namedExports: {
  addPending: async () => 0,
  addPoints: async () => null,
  readLoyalty: async () => ({ earnRate: 1, redeemValue: 1 }),
  writeLoyalty: async () => ({}),
} });

const { default: points } = await import('../../netlify/functions/points.mjs');
const get = () => new Request('https://x/api/points', { method: 'GET' });

test('อ่านแต้มไม่ได้ ⇒ ห้ามตอบ 200 ว่ามี 0 แต้ม และห้ามแคช', async () => {
  สภาพ = { state: 'unknown', err: new Error('blobs ล่มจำลอง') };
  const r = await points(get(), {});
  assert.notEqual(r.status, 200, 'อ่านไม่ได้ ห้ามตอบ 200');
  const b = await r.json();
  assert.equal(b.อ่านไม่ได้, true, 'ต้องประกาศว่าอ่านไม่ได้');
  assert.equal(b.points, undefined, '🔴 ห้ามมีคีย์ points เลย — เลข 0 คือคำกล่าวอ้างเท็จ');
  assert.ok(!Array.isArray(b.log), 'ห้ามส่งประวัติว่าง (ลูกค้าจะอ่านว่าประวัติหาย)');
  assert.match(r.headers.get('cache-control') || '', /no-store/, 'ห้ามแคชความว่าง');
  assert.match(String(b.เหตุ || ''), /ยังอยู่ครบ|ไม่ได้หาย/, 'ต้องบอกลูกค้าว่าแต้มไม่ได้หาย');
});

test('คนนอกจริง (guest) ⇒ ยังตอบ 200 + points 0 ตามเดิม (ห้ามแก้แรงเกิน)', async () => {
  สภาพ = { state: 'guest' };
  const r = await points(get(), {});
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.points, 0);
  assert.deepEqual(b.log, []);
  assert.equal(b.อ่านไม่ได้, undefined);
});

test('ล็อกอินอยู่ ⇒ ส่งแต้มจริงกับจำนวนประวัติทั้งหมด', async () => {
  สภาพ = { state: 'user', user: { phone: '0812345678', points: 1200, pointLog: Array.from({ length: 42 }, (_, i) => ({ n: i })) } };
  const r = await points(get(), {});
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.points, 1200);
  assert.equal(b.log.length, 30, 'ตัดที่ 30 เพื่อแสดงผล');
  assert.equal(b.logTotal, 42, 'แต่ต้องบอกจำนวนเต็มไปด้วย ไม่งั้นลูกค้าอ่านว่า 30 คือทั้งหมด');
});
