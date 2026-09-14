// รัน: node --experimental-test-module-mocks --test scripts/tests/read-before-write-3.test.mjs
// งานกระดาน t_mu17h90m ชุด 2 — แต้ม (B03 · addPending) · รับแจ้งเตือนแอดมิน (push subs)
// (Blobs ปลอม · ไม่ยิงเน็ตจริง) · gucut2 ยืนยันบั๊กจากโค้ด 14 ก.ย. 2569 19:14
// 🔴 B03: เดิม addPoints กลืน "อ่านไม่ได้" เป็น null ⇒ claimPending ลบแต้มค้างทิ้งทั้งที่ไม่ได้บวกเข้าบัญชี
// ตัวเลขทุกเคสไม่เป็นศูนย์
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const makeStore = () => {
  const data = new Map();
  const state = { failPrefix: null, writes: [], deletes: [] };
  return {
    data, state,
    get: async (k) => {
      if (state.failPrefix && String(k).startsWith(state.failPrefix)) throw new Error('blobs ล่มจำลอง');
      return data.has(k) ? structuredClone(data.get(k)) : null;
    },
    setJSON: async (k, v) => { state.writes.push(k); data.set(k, structuredClone(v)); },
    delete: async (k) => { state.deletes.push(k); data.delete(k); },
  };
};

const pushStore = makeStore();
mock.module('@netlify/blobs', { namedExports: { getStore: () => pushStore } });
mock.module('web-push', { defaultExport: { setVapidDetails: () => {}, generateVAPIDKeys: () => ({ publicKey: 'p', privateKey: 'k' }), sendNotification: async () => {} } });
mock.module('../../netlify/lib/session.mjs', { namedExports: { normPhone: (v) => String(v ?? '') } });

const { addPoints, addPending, claimPending } = await import('../../netlify/lib/points.mjs');
const { addSub, removeSub } = await import('../../netlify/lib/push.mjs');

test('B03 addPoints: อ่านบัญชีพลาด ⇒ throw (ไม่ใช่ null) · ไม่มีบัญชี ⇒ null · มีบัญชี ⇒ บวกได้', async () => {
  const s = makeStore();
  s.data.set('u/0812345678', { phone: '0812345678', points: 1200 });
  s.state.failPrefix = 'u/';
  await assert.rejects(() => addPoints(s, '0812345678', 350, 'ทดสอบ', 'o1'));
  assert.equal(s.state.writes.length, 0);
  s.state.failPrefix = null;
  assert.equal(await addPoints(s, '0899999999', 350, 'ทดสอบ', 'o1'), null);
  assert.equal(await addPoints(s, '0812345678', 350, 'ทดสอบ', 'o1'), 1550);
});

test('B03 claimPending: อ่านบัญชีพลาด ⇒ แต้มค้างยังอยู่ · ไม่มีบัญชี ⇒ แต้มค้างยังอยู่ · สำเร็จ ⇒ บวกแล้วค่อยลบ', async () => {
  const s = makeStore();
  s.data.set('pts/0812345678', { n: 480, note: 'แต้มเดิมจาก CWILL' });
  s.data.set('u/0812345678', { phone: '0812345678', points: 1200 });

  s.state.failPrefix = 'u/';
  await assert.rejects(() => claimPending(s, '0812345678'));
  assert.equal(s.data.get('pts/0812345678').n, 480, 'ห้ามลบแต้มค้างตอนอ่านบัญชีไม่ได้');
  assert.equal(s.state.deletes.length, 0);

  s.state.failPrefix = null;
  s.data.set('pts/0877777777', { n: 90, note: 'x' });
  assert.equal(await claimPending(s, '0877777777'), 0, 'ไม่มีบัญชี ⇒ ยังโอนไม่ได้');
  assert.equal(s.data.get('pts/0877777777').n, 90, 'ไม่มีบัญชีก็ห้ามลบแต้มค้าง');

  assert.equal(await claimPending(s, '0812345678'), 480);
  assert.equal(s.data.get('u/0812345678').points, 1680);
  assert.equal(s.data.has('pts/0812345678'), false);
});

test('addPending: อ่านแต้มค้างพลาด ⇒ throw ไม่ทับยอดเดิม · อ่านได้ ⇒ บวกสะสม', async () => {
  const s = makeStore();
  s.data.set('pts/0812345678', { n: 480, note: 'เดิม' });
  s.state.failPrefix = 'pts/';
  await assert.rejects(() => addPending(s, '0812345678', 120, 'ใหม่'));
  assert.equal(s.data.get('pts/0812345678').n, 480);
  s.state.failPrefix = null;
  assert.equal(await addPending(s, '0812345678', 120, 'ใหม่'), 600);
});

test('push addSub/removeSub: อ่านรายชื่อเครื่องแอดมินพลาด ⇒ throw ไม่ลบทุกเครื่อง', async () => {
  pushStore.data.clear(); pushStore.state.writes = [];
  pushStore.data.set('push-subs', [{ endpoint: 'e1' }, { endpoint: 'e2' }, { endpoint: 'e3' }]);
  pushStore.state.failPrefix = 'push-subs';
  await assert.rejects(() => removeSub('e2'));
  await assert.rejects(() => addSub({ endpoint: 'e4' }));
  assert.equal(pushStore.state.writes.length, 0);
  assert.equal(pushStore.data.get('push-subs').length, 3);

  pushStore.state.failPrefix = null;
  await removeSub('e2');
  assert.deepEqual(pushStore.data.get('push-subs').map((x) => x.endpoint), ['e1', 'e3']);
  assert.equal(await addSub({ endpoint: 'e4' }), 3);
});
