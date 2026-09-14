// รัน: node --experimental-test-module-mocks --test scripts/tests/read-before-write.test.mjs
// งานกระดาน t_mu178kmv — ทางที่ "อ่านแล้วเขียนทับ" ต้องไม่กลืนการอ่านพลาด (Blobs ปลอม · ไม่ยิงเน็ตจริง)
// 🔴 B12 auth register / social-link: อ่าน u/<เบอร์> พลาด ⇒ เดิมเขียนบัญชีใหม่ทับลูกค้าเดิม
// 🔴 B02 office task*: อ่าน office/tasks พลาด ⇒ เดิมเขียนงานใบเดียวทับทั้งกระดาน แล้วตอบ ok:true
// 🔴 B01 clip-shop POST: อ่าน map พลาด ⇒ เดิมเขียนทับ คลิปอื่นเสียปุ่มซื้อ
// เกณฑ์: อ่านพลาด (throw) ⇒ 503 และ setJSON = 0 ครั้ง · ไม่มีคีย์ (null) ⇒ ทำงานตามปกติ
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

/* Blobs ปลอม: ตั้งได้ว่าคีย์ไหน "อ่านพลาด" (throw) · นับการเขียน */
const data = new Map();
let failPrefix = null;
let writes = [];
const fakeStore = {
  get: async (k) => {
    if (failPrefix && String(k).startsWith(failPrefix)) throw new Error('blobs ล่มจำลอง');
    return data.has(k) ? data.get(k) : null;
  },
  setJSON: async (k, v) => { writes.push(k); data.set(k, v); },
  delete: async (k) => { data.delete(k); },
};
const reset = () => { data.clear(); failPrefix = null; writes = []; };

mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('../../netlify/lib/admin-gate.mjs', { namedExports: { adminGate: async () => ({ ok: true }) } });
mock.module('../../netlify/lib/points.mjs', { namedExports: { claimPending: async () => {} } });
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } });
mock.module('../../netlify/lib/session.mjs', { namedExports: {
  LINK_COOKIE: 'gu_link',
  clean: (v, n) => String(v ?? '').trim().slice(0, n),
  currentUser: async () => null,
  json,
  killCookie: () => ({}), killShort: () => ({}),
  newSession: async () => 'tok',
  normPhone: (v) => (/^0\d{9}$/.test(String(v)) ? String(v) : ''),
  publicUser: (u) => ({ phone: u.phone, name: u.name }),
  readCookie: (req, name) => (name === 'gu_link' ? 'L'.repeat(24) : ''),
  setCookie: () => ({}),
  store: () => fakeStore,
} });

const { default: auth } = await import('../../netlify/functions/auth.mjs');
const { default: office } = await import('../../netlify/functions/office.mjs');
const { default: clipShop } = await import('../../netlify/functions/clip-shop.mjs');
const post = (body) => new Request('https://x/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('B12 register: อ่านบัญชีพลาด ⇒ 503 ไม่เขียนทับ · มีบัญชีอยู่แล้ว ⇒ 409 · ไม่มีบัญชี ⇒ สมัครได้', async () => {
  reset();
  data.set('u/0812345678', { phone: '0812345678', name: 'ลูกค้าเดิม', points: 1200 });
  failPrefix = 'u/';
  const r1 = await auth(post({ action: 'register', phone: '0812345678', name: 'คนใหม่', password: 'abcdefgh1' }));
  assert.equal(r1.status, 503);
  assert.equal(writes.length, 0, 'ห้ามเขียนอะไรเลยตอนอ่านไม่ได้');
  assert.equal(data.get('u/0812345678').points, 1200, 'บัญชีเดิมต้องอยู่ครบ');

  failPrefix = null;
  const r2 = await auth(post({ action: 'register', phone: '0812345678', name: 'คนใหม่', password: 'abcdefgh1' }));
  assert.equal(r2.status, 409);

  const r3 = await auth(post({ action: 'register', phone: '0899999999', name: 'ใหม่จริง', password: 'abcdefgh1' }));
  assert.equal(r3.status, 200);
  assert.ok(writes.includes('u/0899999999'));
});

test('B12 social-link: อ่านบัญชีพลาด ⇒ 503 ไม่สร้างบัญชีใหม่ทับ', async () => {
  reset();
  data.set('pl/' + 'L'.repeat(24), { id: 'line-1', provider: 'line', label: 'LINE', name: 'ใน LINE', at: Date.now() });
  data.set('u/0812345678', { phone: '0812345678', name: 'ลูกค้าเดิม', points: 900, pass: { salt: 'a', hash: 'b' } });
  failPrefix = 'u/';
  const r = await auth(post({ action: 'social-link', phone: '0812345678' }));
  assert.equal(r.status, 503);
  assert.equal(writes.filter((k) => k.startsWith('u/')).length, 0, 'ห้ามเขียน u/<เบอร์>');
  assert.equal(data.get('u/0812345678').points, 900);
});

test('B02 office: อ่านกระดานพลาด ⇒ taskAdd/taskDone ตอบ 503 และกระดานเดิมไม่หาย · ไม่มีคีย์ ⇒ เพิ่มได้', async () => {
  reset();
  const board = [{ id: 't_a', text: 'งานเดิม 1', owner: 'gucut', done: false }, { id: 't_b', text: 'งานเดิม 2', owner: 'gucut2', done: false }];
  data.set('office/tasks', board);
  failPrefix = 'office/tasks';
  const add = await office(post({ taskAdd: 'งานใหม่', owner: 'gucut' }), {});
  assert.equal(add.status, 503);
  const done = await office(post({ taskDone: 't_a' }), {});
  assert.equal(done.status, 503);
  assert.equal(writes.length, 0, 'ห้ามเขียนทับกระดาน');
  assert.equal(data.get('office/tasks').length, 2);

  reset();
  const fresh = await office(post({ taskAdd: 'งานแรกของกระดานใหม่', owner: 'gucut' }), {});
  assert.equal(fresh.status, 200);
  assert.equal(data.get('office/tasks').length, 1);
});

test('B01 clip-shop: อ่านรายการพลาด ⇒ 503 ไม่ลบคลิปอื่น · ไม่มีคีย์ ⇒ ผูกได้', async () => {
  reset();
  data.set('clip-shop', { c1: { h: 'saw-a', t: 'เลื่อย A', p: 9000 }, c2: { h: 'saw-b', t: 'เลื่อย B', p: 12000 } });
  failPrefix = 'clip-shop';
  const r = await clipShop(post({ clip: 'c3', product: { h: 'saw-c', t: 'เลื่อย C', p: 15000 } }), {});
  assert.equal(r.status, 503);
  assert.equal(writes.length, 0);
  assert.equal(Object.keys(data.get('clip-shop')).length, 2);

  reset();
  const ok = await clipShop(post({ clip: 'c1', product: { h: 'saw-a', t: 'เลื่อย A', p: 9000 } }), {});
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(data.get('clip-shop')), ['c1']);
});
