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
  /* 🔑 เพิ่ม `delete` ตอนเขียนเทส B07 — **ตัวปลอมเดิมไม่มีมันเลย**
     ⇒ ถ้าไม่เพิ่ม เทสจะล้มด้วย "s.delete is not a function" ซึ่ง **เป็นข่าวดี**
       (ตัวปลอมที่ขาดมิติแล้วเงียบ จะทำให้พฤติกรรมการลบไม่เคยถูกทดสอบเลย
        และเราจะอ่านว่า "ผ่าน" — คลาส mock-cant-see-missing-dimension) */
  delete: async (k) => { data.delete(k); },
  list: async (o) => {
    const พรีฟิกซ์ = o?.prefix ?? '';
    return { blobs: [...data.keys()].filter((k) => k.startsWith(พรีฟิกซ์) && k !== พรีฟิกซ์.replace(/\/$/, '')).map((key) => ({ key })) };
  },
};
const reset = () => { data.clear(); failKey = null; };
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
/** ตั้งให้ sendNotification ปฏิเสธด้วย statusCode ที่กำหนด — ใช้แยก 404/410 ออกจาก 500 */
let ส่งพลาด = null;
mock.module('web-push', { defaultExport: {
  generateVAPIDKeys: () => ({ publicKey: 'ปลอม-pub', privateKey: 'ปลอม-priv' }),
  setVapidDetails: () => {},
  sendNotification: async () => { if (ส่งพลาด) throw ส่งพลาด; return { statusCode: 201 }; },
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

/* ── B07 ฝั่งลูกค้า (ใบ t_mv4la7u4) ────────────────────────────────────────
   ใบงานชี้ addSub/removeSub ซึ่งถูกแก้ไปแล้ว 14 ก.ย. และ `addUserSub` ปลอดภัย
   โดยโครงสร้างอยู่แล้ว (หนึ่งเครื่อง–หนึ่งคีย์ ⇒ ไม่มีอ่าน-แล้ว-เขียนทับ)
   ของจริงที่เหลือ: `readUserSubs` กลืนการอ่านพลาด ⇒ ผู้เรียกแยกไม่ออกระหว่าง
   "ไม่มีเครื่อง" กับ "อ่านไม่ได้" ⇒ `hasUserSub` ตอบ false · `pushToUser` คืน 0
   ⚠️ ทิศ "ส่งเท่าที่รู้" ถูกแล้ว **ไม่แก้** — ที่เพิ่มคือธงบอกว่ารอบนั้นอ่านไม่ครบ */
const { hasUserSub, pushToUser, removeUserSub, addUserSub } = await import('../../netlify/lib/push.mjs');

test('🔴 hasUserSub: อ่านไม่ครบ ⇒ null (ไม่รู้) ไม่ใช่ false', async () => {
  reset();
  เตรียมคีย์();
  failKey = 'u/0812345678';
  assert.equal(await hasUserSub('0812345678'), null,
    '🔑 ตัวนี้ตอบคำถาม ไม่ได้ลดสิทธิ์ ⇒ ยุบ "ไม่รู้" เป็น false ไม่ได้');
});

test('ตัวควบคุมลบของ hasUserSub: ไม่มีเครื่องจริง ⇒ false · มีเครื่อง ⇒ true', async () => {
  reset(); เตรียมคีย์();
  assert.equal(await hasUserSub('0812345678'), false, 'อ่านได้แต่ว่าง = ไม่มีเครื่องจริง');
  reset(); เตรียมคีย์();
  data.set('u/0812345678', [{ endpoint: 'https://a' }]);
  assert.equal(await hasUserSub('0812345678'), true);
});

test('🔴 pushToUser: อ่านไม่ครบและไม่เจอเครื่อง ⇒ null · ไม่มีเครื่องจริง ⇒ 0', async () => {
  reset(); เตรียมคีย์();
  failKey = 'u/0812345678';
  assert.equal(await pushToUser('0812345678', { title: 'x' }), null, 'ไม่รู้ ห้ามตอบ 0');
  reset(); เตรียมคีย์();
  assert.equal(await pushToUser('0812345678', { title: 'x' }), 0, 'ไม่มีเครื่องจริง ⇒ 0');
});

test('removeUserSub: อ่านรายชื่อเก่าไม่ได้ ⇒ บอกผู้เรียก (ห้ามเงียบ) และห้ามเขียนทับ', async () => {
  reset(); เตรียมคีย์();
  data.set('u/0812345678', [{ endpoint: 'https://a' }, { endpoint: 'https://b' }]);
  failKey = 'u/0812345678';
  const ผล = await removeUserSub('0812345678', 'https://a');
  assert.equal(ผล.ตรวจของเก่าได้, false, 'ต้องบอกว่าตรวจของเก่าไม่ได้');
  assert.equal(data.get('u/0812345678').length, 2, 'ห้ามเขียนทับรายชื่อเก่า');

  reset(); เตรียมคีย์();
  data.set('u/0812345678', [{ endpoint: 'https://a' }, { endpoint: 'https://b' }]);
  const ดี = await removeUserSub('0812345678', 'https://a');
  assert.equal(ดี.ตรวจของเก่าได้, true);
  assert.deepEqual(data.get('u/0812345678').map((x) => x.endpoint), ['https://b'], 'อ่านได้ ⇒ ลบจริง');
});

/* ── B11 ครึ่งที่เหลือ (ใบ t_mv4oaw7d) ────────────────────────────────────
   ตัวนับ `ok` ของทั้งสองฝั่งถูกแล้วตั้งแต่ 3 ต.ค. (นับจาก `.then()` ไม่ใช่ `all - dead`)
   🔴 ที่เหลือคือ **ขาลูกค้ากลืนความล้มที่ไม่ใช่ 404/410 เงียบสนิท** ขณะที่ขาแอดมินรายงาน
   ⇒ ความไม่สมมาตรในไฟล์เดียวกัน · ของที่หายคือแจ้งเตือนออเดอร์ของลูกค้า */
test('🔴 ส่งล้มด้วย 500 ⇒ ok ต้องไม่นับ · ห้ามลบเครื่องทิ้ง · และต้องรายงาน (ไม่เงียบ)', async () => {
  reset();
  เตรียมคีย์();
  data.set('u/0812345678', [{ endpoint: 'https://a', keys: { p256dh: 'k', auth: 'a' } }]);
  const เตือน = [];
  const เดิม = console.warn;
  console.warn = (m) => เตือน.push(String(m));
  try {
    ส่งพลาด = { statusCode: 500 };
    const n = await pushToUser('0812345678', { title: 'ออเดอร์จัดส่งแล้ว' });
    assert.equal(n, 0, '🔑 ล้ม 500 ห้ามนับเป็นสำเร็จ (คลาส B11)');
    assert.ok(Array.isArray(data.get('u/0812345678')) && data.get('u/0812345678').length === 1,
      '500 = ปลายทางสะดุดชั่วคราว ห้ามลบเครื่องทิ้ง');
    assert.ok(เตือน.some((m) => /ไม่สำเร็จ/.test(m)),
      `🔑 ต้องรายงานออก console — เงียบ = ลูกค้าไม่ได้แจ้งเตือนแล้วไม่มีใครรู้ (ได้: ${เตือน.join('|')})`);
  } finally { console.warn = เดิม; ส่งพลาด = null; }
});

test('ตัวควบคุมลบ: 410 ⇒ ลบเครื่องทิ้งได้ (ถอนสิทธิ์จริง) และไม่ต้องรายงานว่าผิดปกติ', async () => {
  reset();
  เตรียมคีย์();
  data.set('u/0812345678', [{ endpoint: 'https://a', keys: { p256dh: 'k', auth: 'a' } }]);
  const เตือน = [];
  const เดิม = console.warn;
  console.warn = (m) => เตือน.push(String(m));
  try {
    ส่งพลาด = { statusCode: 410 };
    const n = await pushToUser('0812345678', { title: 'x' });
    assert.equal(n, 0);
    assert.deepEqual(data.get('u/0812345678'), [], '410 = ถอนสิทธิ์จริง ⇒ เก็บกวาดได้');
    assert.ok(!เตือน.some((m) => /ไม่สำเร็จ/.test(m)), '410 ไม่ใช่ความผิดปกติ ⇒ ไม่ต้องร้อง');
  } finally { console.warn = เดิม; ส่งพลาด = null; }
});
