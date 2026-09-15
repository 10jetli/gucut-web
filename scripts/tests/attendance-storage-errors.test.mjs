// รัน: node --experimental-test-module-mocks --test scripts/tests/attendance-storage-errors.test.mjs
// t_mu20nia9 · B17/B27 — Blobs อ่าน/ลบพลาดต้องเป็น 503 และห้ามแตะข้อมูลเดิม
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const data = new Map();
const state = { failGet: null, failList: false, failDelete: null, writes: [], deletes: [] };
const fakeStore = {
  get: async (key) => {
    if (state.failGet && String(key).startsWith(state.failGet)) throw new Error('blobs อ่านล้มจำลอง');
    return data.has(key) ? structuredClone(data.get(key)) : null;
  },
  setJSON: async (key, value) => {
    state.writes.push(key);
    data.set(key, structuredClone(value));
  },
  set: async (key, value) => {
    state.writes.push(key);
    data.set(key, value);
  },
  delete: async (key) => {
    state.deletes.push(key);
    if (state.failDelete && String(key).startsWith(state.failDelete)) throw new Error('blobs ลบล้มจำลอง');
    data.delete(key);
  },
  list: async ({ prefix }) => {
    if (state.failList) throw new Error('blobs list ล้มจำลอง');
    return { blobs: [...data.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
  },
};

mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('../../netlify/lib/admin-gate.mjs', { namedExports: { adminGate: async () => ({ ok: true }) } });

const {
  editDay, findByPin, monthTable, readCfg, readEmp, saveEmp,
} = await import('../../netlify/lib/attendance.mjs');
const { default: timeApi } = await import('../../netlify/functions/time.mjs');

const reset = () => {
  data.clear();
  state.failGet = null;
  state.failList = false;
  state.failDelete = null;
  state.writes = [];
  state.deletes = [];
};
const req = (method, url, body) => new Request(url, {
  method,
  headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '1.2.3.4' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

test('ไม่มี cfg/emp จริง: คืนค่าเริ่มต้นและรายชื่อว่างตามปกติ', async () => {
  reset();
  assert.equal((await readCfg()).start, '08:30');
  assert.deepEqual(await readEmp(), []);
});

test('B17 อ่าน cfg พลาด: โยน 503 แทนใช้ค่าเริ่มต้น และ public API บอกเหตุผลไทย', async () => {
  reset();
  data.set('cfg', { start: '07:45', photo: true, gps: true });
  state.failGet = 'cfg';
  await assert.rejects(readCfg(), (e) => e.status === 503 && /อ่านตั้งค่า/.test(e.message));

  const res = await timeApi(req('GET', 'https://x/api/time?public=1'), {});
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /อ่านตั้งค่า/);

  const save = await timeApi(req('POST', 'https://x/api/time', { action: 'cfg', start: '09:30' }), {});
  assert.equal(save.status, 503);
  assert.match((await save.json()).error, /อ่านตั้งค่า/);
  assert.deepEqual(state.writes, [], 'ห้ามเขียนค่า default ทับ cfg เดิมตอนอ่านไม่ได้');
});

test('B17 อ่าน emp พลาด: saveEmp หยุดก่อนเขียน รายชื่อเดิมอยู่ครบ', async () => {
  reset();
  const old = [{ id: 'e-old', name: 'คนเดิม', active: true, pinHash: 'hash-old' }];
  data.set('emp', old);
  state.failGet = 'emp';

  await assert.rejects(() => saveEmp({ name: 'คนใหม่', pin: '4821' }), (e) => e.status === 503);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(data.get('emp'), old);

  const res = await timeApi(req('POST', 'https://x/api/time', {
    action: 'emp-save', emp: { name: 'คนใหม่', pin: '4821' },
  }), {});
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /อ่านรายชื่อพนักงาน/);
  assert.deepEqual(data.get('emp'), old);
});

test('B17 PIN ถูกแต่อ่าน emp พลาด: API ตอบ 503 ไม่ตอบ PIN ผิดและไม่เพิ่ม fail counter', async () => {
  reset();
  await saveEmp({ name: 'คนเดิม', pin: '4821' });
  state.writes = [];
  state.failGet = 'emp';

  await assert.rejects(() => findByPin('4821'), (e) => e.status === 503);
  const res = await timeApi(req('POST', 'https://x/api/time', { action: 'status', pin: '4821' }), {});
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /อ่านรายชื่อพนักงาน/);
  assert.equal(state.writes.some((key) => key.startsWith('fail/')), false, 'outage ไม่ใช่การเดา PIN ผิด');
});

test('B17 admin GET อ่าน emp พลาด: ตอบ 503 แทนตารางว่าง', async () => {
  reset();
  data.set('emp', [{ id: 'e1', name: 'คนเดิม', active: true }]);
  state.failGet = 'emp';

  const res = await timeApi(req('GET', 'https://x/api/time?month=2026-09'), {});
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /อ่านรายชื่อพนักงาน/);
});

test('B17 monthTable: list หรืออ่านรายละเอียดพลาดต้องโยน 503 ไม่คืนเดือนว่าง/เดือนขาดวัน', async () => {
  reset();
  state.failList = true;
  await assert.rejects(() => monthTable('2026-09'), (e) => e.status === 503 && /รายการ/.test(e.message));
  const res = await timeApi(req('GET', 'https://x/api/time?month=2026-09'), {});
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /รายการลงเวลา/);

  reset();
  data.set('d/2026-09-01/e1', { name: 'คนเดิม', in: 1, out: 2 });
  state.failGet = 'd/';
  await assert.rejects(() => monthTable('2026-09'), (e) => e.status === 503 && /รายละเอียด/.test(e.message));
});

test('B27 ลบเวลาพลาด: โยน 503 ไม่บอกสำเร็จ และข้อมูลเดิมยังอยู่', async () => {
  reset();
  data.set('emp', [{ id: 'e1', name: 'คนเดิม', active: true }]);
  const key = 'd/2026-09-01/e1';
  const old = { name: 'คนเดิม', in: 100, out: 200 };
  data.set(key, old);
  state.failDelete = 'd/';

  await assert.rejects(
    () => editDay({ date: '2026-09-01', id: 'e1', in: '', out: '' }),
    (e) => e.status === 503 && /ลบเวลา/.test(e.message),
  );
  assert.deepEqual(data.get(key), old);

  const res = await timeApi(req('POST', 'https://x/api/time', {
    action: 'edit', date: '2026-09-01', id: 'e1', in: '', out: '',
  }), {});
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /ลบเวลา/);
  assert.deepEqual(data.get(key), old);
});

test('จอรับคืน: อ่านรายชื่อพนักงานไม่ได้ต้องตอบ 503 ไม่ใช่ตกไป 500 ของตัวครอบนอกสุด (CEO เพิ่ม 15 ก.ย. 2569)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const at = src.indexOf('staff = await R.staffFromReq(req);');
  assert.ok(at > 0, 'ต้องครอบ staffFromReq ด้วย try');
  const around = src.slice(src.lastIndexOf('let staff;', at), at + 220);
  assert.match(around, /try \{\s*staff = await R\.staffFromReq\(req\);\s*\} catch \(e\) \{\s*return json\(\{ error: String\(e\?\.message \|\| e\) \}, e\?\.status === 503 \? 503 : 500\);/);
  assert.equal(src.includes('const staff = await R.staffFromReq(req);'), false, 'ห้ามเรียกแบบไม่ครอบ');
});
