// รัน: node --experimental-test-module-mocks --test scripts/tests/push-vapid.test.mjs
// B06 — อ่านคีย์ VAPID พลาดต้องหยุด ห้ามสร้างคีย์ใหม่ทับของเดิม
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const data = new Map();
const state = { failRead: false, writes: [], generated: 0, details: [] };
const fakeStore = {
  get: async (key) => {
    if (state.failRead) throw new Error('blobs ล่มจำลอง');
    return data.has(key) ? structuredClone(data.get(key)) : null;
  },
  setJSON: async (key, value) => {
    state.writes.push(key);
    data.set(key, structuredClone(value));
  },
};

mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('web-push', {
  defaultExport: {
    generateVAPIDKeys: () => {
      state.generated += 1;
      return { publicKey: 'PUBLIC_NEW', privateKey: 'PRIVATE_NEW' };
    },
    setVapidDetails: (...args) => { state.details.push(args); },
    sendNotification: async () => {},
  },
});
mock.module('../../netlify/lib/session.mjs', { namedExports: { normPhone: (v) => String(v ?? '') } });

const { vapid } = await import('../../netlify/lib/push.mjs');

function reset() {
  data.clear();
  state.failRead = false;
  state.writes = [];
  state.generated = 0;
  state.details = [];
}

test('มีคีย์เดิม: ใช้คีย์เดิมโดยไม่สร้างหรือเขียนใหม่', async () => {
  reset();
  const old = { publicKey: 'PUBLIC_OLD', privateKey: 'PRIVATE_OLD' };
  data.set('vapid-keys', old);

  assert.deepEqual(await vapid(), old);
  assert.equal(state.generated, 0);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(state.details[0].slice(1), ['PUBLIC_OLD', 'PRIVATE_OLD']);
});

test('ไม่มีคีย์จริง: สร้างและบันทึกครั้งแรกได้', async () => {
  reset();

  assert.deepEqual(await vapid(), { publicKey: 'PUBLIC_NEW', privateKey: 'PRIVATE_NEW' });
  assert.equal(state.generated, 1);
  assert.deepEqual(state.writes, ['vapid-keys']);
  assert.deepEqual(data.get('vapid-keys'), { publicKey: 'PUBLIC_NEW', privateKey: 'PRIVATE_NEW' });
});

test('B06 อ่านคีย์พลาด: ส่ง error ต่อและไม่สร้างคีย์ใหม่ทับ', async () => {
  reset();
  const old = { publicKey: 'PUBLIC_OLD', privateKey: 'PRIVATE_OLD' };
  data.set('vapid-keys', old);
  state.failRead = true;

  await assert.rejects(() => vapid(), /blobs ล่มจำลอง/);
  assert.equal(state.generated, 0, 'ห้ามหมุนคีย์เมื่อแยกไม่ได้ว่าคีย์ไม่มีหรืออ่านไม่ได้');
  assert.deepEqual(state.writes, [], 'ห้ามเขียนทับตอนอ่านล้มเหลว');
  assert.deepEqual(data.get('vapid-keys'), old);
  assert.deepEqual(state.details, [], 'ห้ามตั้งค่า web-push จากคีย์ที่อ่านไม่สำเร็จ');
});
