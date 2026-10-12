// ด่าน B06 ขาอ่าน — ใบ t_mv4kepvw
// 🔑 เกณฑ์: "อ่านรายชื่อเครื่องไม่ได้" ห้ามถูกพูดออกไปเป็น "ไม่มีเครื่องไหนเปิดรับ"
//    เดิม listSubs() กลืนเป็น [] ⇒ pushToAdmins คืน 0 (แจ้งเตือนหายเงียบ) · PUT คืน devices:0
// ⚠️ และห้ามโยนทะลุไปทำให้งานหลักล้ม — orders/chat/permit-doc เรียกตัวนี้ (แจ้งเตือนล้มห้ามทำให้ออเดอร์ล้ม)
//    ⇒ ทางที่ถูกคือ **สามสถานะ**: null = ไม่รู้ · 0 = ไม่มีใครสมัคร · >0 = ส่งสำเร็จกี่เครื่อง
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const data = new Map();
let failKey = null;
const fakeStore = {
  get: async (k) => { if (failKey && k === failKey) throw new Error('blobs ล่มจำลอง'); return data.has(k) ? data.get(k) : null; },
  setJSON: async (k, v) => data.set(k, v),
  list: async () => ({ blobs: [] }),
};
const reset = () => { data.clear(); failKey = null; };
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('web-push', { defaultExport: {
  generateVAPIDKeys: () => ({ publicKey: 'ปลอม-pub', privateKey: 'ปลอม-priv' }),
  setVapidDetails: () => {},
  sendNotification: async () => ({ statusCode: 201 }),
} });
mock.module('../../netlify/lib/session.mjs', { namedExports: { normPhone: (v) => String(v ?? '') } });
const { listSubs, pushToAdmins } = await import('../../netlify/lib/push.mjs');

const เตรียมคีย์ = () => data.set('vapid-keys', { publicKey: 'p', privateKey: 's' });

test('listSubs: อ่านพลาด ⇒ โยน (ห้ามคืน [] ซึ่งแปลว่า "ไม่มีใครสมัคร")', async () => {
  reset();
  data.set('push-subs', [{ endpoint: 'https://a' }, { endpoint: 'https://b' }]);
  failKey = 'push-subs';
  await assert.rejects(() => listSubs(), /blobs/);

  // ไม่มีคีย์เลย = ยังไม่มีใครสมัครจริง ⇒ [] ถูกต้อง
  reset();
  assert.deepEqual(await listSubs(), []);
});

test('🔴 pushToAdmins: อ่านพลาด ⇒ คืน null (ไม่รู้) **ไม่ใช่ 0** และต้องไม่โยนทะลุ', async () => {
  reset();
  เตรียมคีย์();
  data.set('push-subs', [{ endpoint: 'https://a' }]);
  failKey = 'push-subs';
  const r = await pushToAdmins({ title: 'x', body: 'y' });
  assert.equal(r, null, '🔑 null = ไม่รู้ · 0 = ไม่มีใครสมัคร — ยุบสองอย่างนี้เมื่อไหร่ แจ้งเตือนหายเงียบ');
  assert.notEqual(r, 0);
});

test('ตัวควบคุมลบ: ไม่มีใครสมัครจริง ⇒ 0 · มีคนสมัคร ⇒ นับได้ (ไม่ใช่ null ทุกกรณี)', async () => {
  reset();
  เตรียมคีย์();
  assert.equal(await pushToAdmins({ title: 'x', body: 'y' }), 0, 'ไม่มีคีย์ = ไม่มีใครสมัคร ⇒ 0');

  reset();
  เตรียมคีย์();
  data.set('push-subs', [{ endpoint: 'https://a', keys: { p256dh: 'k', auth: 'a' } }]);
  const n = await pushToAdmins({ title: 'x', body: 'y' });
  assert.ok(typeof n === 'number' && n >= 0, `ต้องเป็นตัวเลข ได้ ${n}`);
  assert.notEqual(n, null, 'มีเครื่องสมัครอยู่ ห้ามคืน null');
});
