// รัน: node --experimental-test-module-mocks --test scripts/tests/read-before-write-2.test.mjs
// งานกระดาน t_mu17h90m ชุด 2 — แชท (B13) · คอมเมนต์/หัวใจ (B16) : อ่าน Blobs พลาดต้อง 503 ไม่เขียนทับ
// (Blobs ปลอม · ไม่ยิงเน็ตจริง) · gucut2 ยืนยันบั๊กจากโค้ด 14 ก.ย. 2569 19:14
// เกณฑ์: อ่านพลาด (throw) ⇒ ไม่เขียนทับของเดิม · ไม่มีคีย์ (null) ⇒ ทำงานตามปกติ
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const data = new Map();
let failPrefix = null;
let writes = [];
const fakeStore = {
  get: async (k) => {
    if (failPrefix && String(k).startsWith(failPrefix)) throw new Error('blobs ล่มจำลอง');
    return data.has(k) ? structuredClone(data.get(k)) : null;
  },
  setJSON: async (k, v) => { writes.push(k); data.set(k, structuredClone(v)); },
  delete: async (k) => { data.delete(k); },
  list: async () => ({ blobs: [...data.keys()].map((key) => ({ key })) }),
};
const reset = () => { data.clear(); failPrefix = null; writes = []; };

let asAdmin = false;
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('../../netlify/lib/admin-gate.mjs', { namedExports: { adminGate: async () => ({ ok: asAdmin }) } });
mock.module('../../netlify/lib/push.mjs', { namedExports: { pushToAdmins: async () => 0 } });
mock.module('../../netlify/lib/views.mjs', { namedExports: { addView: async () => {}, readViews: async () => ({}) } });
delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID; delete process.env.CHAT_NOTIFY_URL;

const { default: chat } = await import('../../netlify/functions/chat.mjs');
const { default: social } = await import('../../netlify/functions/social.mjs');
const req = (method, url, body) => new Request(url, {
  method, headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '1.2.3.4' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const CID = 'abcd1234-room';

test('B13 แชท: อ่านเธรดพลาด ⇒ 503 ไม่เขียนทับ (ทั้งลูกค้าและร้าน) · ไม่มีเธรด ⇒ เปิดเธรดใหม่ได้', async () => {
  reset();
  const old = { cid: CID, created: 1, name: 'คุณสมชาย', phone: '0812345678', product: { h: 'saw', t: 'เลื่อย' },
    messages: [{ from: 'c', text: 'สวัสดีครับ', at: 1 }, { from: 's', text: 'ยินดีครับ', at: 2 }] };
  data.set(CID, old);
  failPrefix = CID;
  asAdmin = false;
  const r1 = await chat(req('POST', 'https://x/api/chat', { cid: CID, text: 'ถามต่อครับ' }), {});
  assert.equal(r1.status, 503);
  asAdmin = true;
  const r2 = await chat(req('POST', 'https://x/api/chat', { cid: CID, text: 'ร้านตอบ' }), {});
  assert.equal(r2.status, 503);
  assert.equal(writes.length, 0, 'ห้ามเขียนเธรดทับ');
  assert.equal(data.get(CID).messages.length, 2);
  assert.equal(data.get(CID).phone, '0812345678', 'ตัวตนลูกค้าต้องอยู่ครบ');

  reset();
  asAdmin = false;
  const r3 = await chat(req('POST', 'https://x/api/chat', { cid: 'newroom-9999', text: 'ห้องใหม่', name: 'ลูกค้าใหม่' }), {});
  assert.equal(r3.status, 200);
  assert.equal(data.get('newroom-9999').messages.length, 1);
});

test('B16 ลบคอมเมนต์ (ร้าน): อ่านคอมเมนต์พลาด ⇒ 503 ไม่ลบทั้งคลิป', async () => {
  reset();
  asAdmin = true;
  data.set('cmt/clipA', [{ i: 'x1', t: 'ดีมาก' }, { i: 'x2', t: 'สนใจครับ' }, { i: 'x3', t: 'ราคาเท่าไหร่' }]);
  data.set('counts', { clipA: [9, 3], clipB: [4, 1] });
  failPrefix = 'cmt/';
  const r = await social(req('DELETE', 'https://x/api/social?id=clipA&cid=x2'), {});
  assert.equal(r.status, 503);
  assert.equal(writes.length, 0);
  assert.equal(data.get('cmt/clipA').length, 3);
});

test('B16 กดหัวใจ: อ่านยอดรวมพลาด ⇒ 503 ไม่ทับยอดทั้งร้าน · อ่านได้ ⇒ บวกเฉพาะคลิปนั้น', async () => {
  reset();
  asAdmin = false;
  data.set('counts', { clipA: [9, 3], clipB: [4, 1], clipC: [27, 6] });
  failPrefix = 'counts';
  const r = await social(req('POST', 'https://x/api/social', { action: 'like', id: 'clipA' }), {});
  assert.equal(r.status, 503);
  assert.equal(writes.filter((k) => k === 'counts').length, 0);
  assert.deepEqual(data.get('counts'), { clipA: [9, 3], clipB: [4, 1], clipC: [27, 6] });

  failPrefix = null; writes = [];
  const ok = await social(req('POST', 'https://x/api/social', { action: 'like', id: 'clipA' }), {});
  assert.equal(ok.status, 200);
  assert.deepEqual(data.get('counts'), { clipA: [10, 3], clipB: [4, 1], clipC: [27, 6] });
});

test('B16 คอมเมนต์: อ่านคอมเมนต์พลาด ⇒ 503 ไม่ทับ · อ่านยอดรวมพลาดอย่างเดียว ⇒ คอมเมนต์บันทึก แต่ไม่ทับยอดทั้งร้าน', async () => {
  reset();
  asAdmin = false;
  data.set('cmt/clipA', [{ i: 'x1', t: 'ดีมาก' }, { i: 'x2', t: 'สนใจครับ' }]);
  data.set('counts', { clipA: [9, 2], clipB: [4, 1] });
  failPrefix = 'cmt/';
  const r1 = await social(req('POST', 'https://x/api/social', { action: 'comment', id: 'clipA', text: 'ขอราคาหน่อยครับ', name: 'ต้น' }), {});
  assert.equal(r1.status, 503);
  assert.equal(data.get('cmt/clipA').length, 2);
  assert.equal(writes.filter((k) => k.startsWith('cmt/')).length, 0);

  failPrefix = 'counts'; writes = [];
  const r2 = await social(req('POST', 'https://x/api/social', { action: 'comment', id: 'clipA', text: 'ขอราคาหน่อยครับ', name: 'ต้น' }), {});
  assert.equal(r2.status, 200);
  assert.equal(data.get('cmt/clipA').length, 3, 'คอมเมนต์บันทึกแล้ว');
  assert.equal(writes.filter((k) => k === 'counts').length, 0, 'ห้ามเขียนยอดรวมทั้งร้านที่อ่านไม่ได้');
  assert.deepEqual(data.get('counts'), { clipA: [9, 2], clipB: [4, 1] });
});
