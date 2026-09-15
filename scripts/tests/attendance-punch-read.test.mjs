// รัน: node --experimental-test-module-mocks --test scripts/tests/attendance-punch-read.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu205dfl — บั๊ก B05 จากรายงานล่าบั๊กของ codex (Blobs ปลอม · ไม่ยิงเน็ต)
// 🔴 เดิม: อ่านเวลาวันนี้พลาดตอนกดเลิกงาน ⇒ .catch(null) ⇒ เขียน "เข้างาน" ใหม่ out:null ทับเวลาเช้า
// เกณฑ์ (เดียวกับ read-before-write.test.mjs): อ่านพลาด ⇒ 503 และไม่เขียนคีย์วันนั้นเลย · ไม่มีคีย์ (null) ⇒ ทำงานตามปกติ
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const data = new Map();
let failPrefix = null;
let writes = [];
const fakeStore = {
  get: async (k) => {
    if (failPrefix && String(k).startsWith(failPrefix)) throw new Error('blobs ล่มจำลอง');
    return data.has(k) ? data.get(k) : null;
  },
  setJSON: async (k, v) => { writes.push(k); data.set(k, v); },
  set: async (k, v) => { writes.push(k); data.set(k, v); },
  delete: async (k) => { data.delete(k); },
  list: async () => ({ blobs: [] }),
};
const reset = () => { data.clear(); failPrefix = null; writes = []; };
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('../../netlify/lib/admin-gate.mjs', { namedExports: { adminGate: async () => ({ ok: true }) } });

const { punch, thaiDate, saveEmp } = await import('../../netlify/lib/attendance.mjs');
const { default: timeApi } = await import('../../netlify/functions/time.mjs');
const EMP = { id: 'e1', name: 'ส้ม' };
const todayKey = () => `d/${thaiDate()}/e1`;
const MORNING = Date.now() - 8 * 3600 * 1000;

test('B05: มีเวลาเข้าตอนเช้าอยู่ แต่อ่านพลาดตอนกดเลิกงาน ⇒ โยน 503 · ไม่เขียน · เวลาเช้ายังอยู่', async () => {
  reset();
  data.set(todayKey(), { name: 'ส้ม', in: MORNING, out: null, late: 0 });
  failPrefix = 'd/';
  await assert.rejects(punch(EMP), (e) => e.status === 503 && /ยังไม่ได้บันทึก/.test(e.message));
  assert.equal(writes.filter((k) => k.startsWith('d/')).length, 0, 'ห้ามเขียนทับวันนั้น');
  assert.equal(data.get(todayKey()).in, MORNING, 'เวลาเข้าตอนเช้าต้องอยู่ครบ');
});

test('B05: peek อ่านพลาด ⇒ โยน ไม่ตอบว่ายังไม่ลงเวลา · ไม่เขียน', async () => {
  reset();
  failPrefix = 'd/';
  await assert.rejects(punch(EMP, { peek: true }), (e) => e.status === 503);
  assert.equal(writes.length, 0);
});

test('ไม่มีคีย์วันนี้ (null) ⇒ ลงเวลาเข้าตามปกติ', async () => {
  reset();
  const r = await punch(EMP);
  assert.equal(r.kind, 'in');
  assert.ok(data.get(todayKey()).in);
  assert.equal(data.get(todayKey()).out, null);
});

test('มีเวลาเข้าอยู่และอ่านสำเร็จ ⇒ ตั้งแค่ out · in เดิมไม่เปลี่ยน', async () => {
  reset();
  data.set(todayKey(), { name: 'ส้ม', in: MORNING, out: null, late: 5 });
  const r = await punch(EMP);
  assert.equal(r.kind, 'out');
  assert.equal(data.get(todayKey()).in, MORNING);
  assert.equal(data.get(todayKey()).late, 5, 'ตัวเลขสายของตอนเช้าต้องไม่ถูกคิดใหม่');
  assert.ok(data.get(todayKey()).out);
});

test('/api/time ด้วย PIN จริง: อ่านเวลาวันนี้พลาด ⇒ HTTP 503 + ข้อความไทย · ไม่เขียนคีย์วันนั้น (ไม่ใช่ 500 ว่างเปล่า)', async () => {
  reset();
  await saveEmp({ name: 'ส้ม', pin: '4821' });
  const emp = data.get('emp')[0];
  data.set(`d/${thaiDate()}/${emp.id}`, { name: 'ส้ม', in: MORNING, out: null, late: 0 });
  writes = [];
  failPrefix = 'd/';
  const res = await timeApi(new Request('https://x/api/time', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'clock', pin: '4821' }),
  }), {});
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.match(body.error, /ยังไม่ได้บันทึก/);
  assert.equal(writes.filter((k) => k.startsWith('d/')).length, 0);
  assert.equal(data.get(`d/${thaiDate()}/${emp.id}`).in, MORNING);
});
