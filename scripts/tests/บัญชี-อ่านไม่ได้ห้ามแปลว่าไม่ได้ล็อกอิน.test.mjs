// รัน: node --experimental-test-module-mocks --test "scripts/tests/บัญชี-อ่านไม่ได้ห้ามแปลว่าไม่ได้ล็อกอิน.test.mjs"
// t_musnnqy8 · B26 — ที่เก็บข้อมูลสมาชิกอ่านไม่ได้ ห้ามกลายเป็น "ไม่ได้ล็อกอิน" หรือ "รหัสผิด"
//
// 🔑 สิ่งที่เทสนี้ต้องแยกให้ออก — สามสถานะ ไม่ใช่สอง
//    · อ่านได้ มีคนล็อกอิน      ⇒ 200 มี user
//    · อ่านได้ ไม่มีใครล็อกอิน  ⇒ 200 { user: null }      ← ตัวควบคุมลบ ห้ามกลายเป็น 503
//    · อ่านไม่ได้               ⇒ 503 unknown:true        ← ของที่เพิ่งแก้
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { mock, test } from 'node:test';

const data = new Map();
const state = { failGet: null, writes: [], deletes: [] };

const fakeStore = {
  get: async (key) => {
    if (state.failGet && String(key).startsWith(state.failGet)) {
      throw new Error('blobs อ่านล้มจำลอง');
    }
    return data.has(key) ? structuredClone(data.get(key)) : null;
  },
  setJSON: async (key, value) => { state.writes.push(key); data.set(key, structuredClone(value)); },
  set: async (key, value) => { state.writes.push(key); data.set(key, value); },
  delete: async (key) => { state.deletes.push(key); data.delete(key); },
  list: async ({ prefix }) => ({
    blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })),
  }),
};

mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
// claimPending แตะที่เก็บข้อมูลแต้ม ไม่ใช่เรื่องที่ใบนี้ตรวจ
mock.module('../../netlify/lib/points.mjs', { namedExports: { claimPending: async () => {} } });

const { default: auth } = await import('../../netlify/functions/auth.mjs');

const PHONE = '0812345678';
const PW = 'รหัสยาวพอ1234';
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAA';   // 24 ตัว เข้ารูป [A-Za-z0-9_-]{20,64}

const hashPw = (pw) => {
  const salt = 'a'.repeat(32);
  return { salt, hash: scryptSync(pw, salt, 64).toString('hex') };
};

function reset({ withUser = true, withSession = true } = {}) {
  data.clear();
  state.failGet = null;
  state.writes = [];
  state.deletes = [];
  if (withUser) {
    data.set(`u/${PHONE}`, { phone: PHONE, name: 'ลูกค้าจริง', pass: hashPw(PW), addr: null });
  }
  if (withSession) data.set(`s/${TOKEN}`, { phone: PHONE, at: Date.now() });
}

const get = (cookie) => auth(new Request('https://gucut.com/api/auth', {
  method: 'GET',
  ...(cookie ? { headers: { cookie } } : {}),
}));

const post = (body, cookie) => auth(new Request('https://gucut.com/api/auth', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
}));

/* ───────── ① "ฉันเป็นใคร" ───────── */

test('B26 อ่าน s/ ไม่ได้: ตอบ 503 unknown ไม่ใช่ 200 user:null', async () => {
  reset();
  state.failGet = 's/';
  const r = await get(`gu_sess=${TOKEN}`);
  assert.equal(r.status, 503, 'อ่านไม่ได้ต้องไม่ใช่ 200');
  const d = await r.json();
  assert.equal(d.unknown, true);
  assert.ok(!('user' in d), 'ห้ามมีช่อง user เลย — มีแล้วจอจะอ่านว่า "ไม่มีใครล็อกอิน"');
});

test('B26 อ่าน u/ ไม่ได้ (session อ่านได้): ตอบ 503 unknown', async () => {
  reset();
  state.failGet = `u/`;
  const r = await get(`gu_sess=${TOKEN}`);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).unknown, true);
});

test('ตัวควบคุมลบ: ไม่มี cookie เลย ⇒ 200 { user: null } (คนนอกจริงยังเป็นคนนอก)', async () => {
  reset();
  const r = await get(null);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { user: null });
});

test('ตัวควบคุมลบ: session หมดอายุ/ถูกลบจริง ⇒ 200 { user: null } ไม่ใช่ 503', async () => {
  reset({ withSession: false });
  const r = await get(`gu_sess=${TOKEN}`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { user: null });
});

test('ตัวควบคุมลบ: ทุกอย่างปกติ ⇒ 200 และได้ข้อมูลลูกค้าจริง', async () => {
  reset();
  const r = await get(`gu_sess=${TOKEN}`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).user.phone, PHONE);
});

/* ───────── ② เข้าสู่ระบบ ───────── */

test('B26 รหัสถูกแต่อ่าน u/ ไม่ได้: 503 และ **ห้ามนับครั้งที่ผิด**', async () => {
  reset();
  state.failGet = `u/`;
  const r = await post({ action: 'login', phone: PHONE, password: PW });
  assert.equal(r.status, 503, 'อ่านบัญชีไม่ได้ ≠ รหัสผิด');
  assert.notEqual(r.status, 401);
  assert.deepEqual(
    state.writes.filter((k) => k.startsWith('rl/')), [],
    'เขียน rl/ แม้ครั้งเดียว = สะดุด 8 รอบแล้วบัญชีจริงถูกล็อก',
  );
});

test('B26 อ่านตัวนับ rl/ ไม่ได้: 503 ไม่ปล่อยผ่าน (ตัวกันเดารหัสห้ามปิดตัวเองเงียบ ๆ)', async () => {
  reset();
  state.failGet = 'rl/';
  const r = await post({ action: 'login', phone: PHONE, password: PW });
  assert.equal(r.status, 503);
});

test('ตัวควบคุมลบ: รหัสผิดจริง ⇒ 401 และ **ต้อง** เขียน rl/ (กลไกกันเดารหัสยังเดิน)', async () => {
  reset();
  const r = await post({ action: 'login', phone: PHONE, password: 'ผิดแน่นอน9999' });
  assert.equal(r.status, 401);
  assert.ok(state.writes.some((k) => k === `rl/${PHONE}`), 'ต้องนับครั้งที่ผิดไว้');
});

test('ตัวควบคุมลบ: ไม่มีเบอร์นี้ในระบบ ⇒ 401 ไม่ใช่ 503', async () => {
  reset({ withUser: false });
  const r = await post({ action: 'login', phone: PHONE, password: PW });
  assert.equal(r.status, 401);
});

test('ตัวควบคุมลบ: รหัสถูกและอ่านได้ ⇒ 200 + ตั้ง cookie', async () => {
  reset();
  const r = await post({ action: 'login', phone: PHONE, password: PW });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie') || '', /gu_sess=/);
});

test('ตัวควบคุมลบ: ผิดครบ 8 ครั้ง ⇒ ถูกพักจริง (429)', async () => {
  reset();
  for (let i = 0; i < 8; i++) await post({ action: 'login', phone: PHONE, password: 'ผิดแน่นอน9999' });
  const r = await post({ action: 'login', phone: PHONE, password: PW });
  assert.equal(r.status, 429);
});

/* ───────── ③ ทางที่ "เขียนทับข้อมูลลูกค้า" ───────── */

test('B26 บันทึกที่อยู่ขณะอ่าน s/ ไม่ได้: 503 ไม่ใช่ 401 และ **ห้ามเขียน u/**', async () => {
  reset();
  state.failGet = 's/';
  const r = await post({ action: 'profile', name: 'ชื่อใหม่' }, `gu_sess=${TOKEN}`);
  assert.equal(r.status, 503, 'ไล่ไปล็อกอินใหม่ทั้งที่ล็อกอินอยู่ = คำตอบผิด');
  assert.deepEqual(state.writes.filter((k) => k.startsWith('u/')), []);
});

test('ตัวควบคุมลบ: ไม่ได้ล็อกอินจริง ⇒ 401 ยังเป็น 401', async () => {
  reset({ withSession: false });
  const r = await post({ action: 'profile', name: 'ชื่อใหม่' }, `gu_sess=${TOKEN}`);
  assert.equal(r.status, 401);
});

test('ตัวควบคุมลบ: ล็อกอินอยู่และอ่านได้ ⇒ บันทึกชื่อสำเร็จ', async () => {
  reset();
  const r = await post({ action: 'profile', name: 'ชื่อใหม่' }, `gu_sess=${TOKEN}`);
  assert.equal(r.status, 200);
  assert.equal(data.get(`u/${PHONE}`).name, 'ชื่อใหม่');
});
