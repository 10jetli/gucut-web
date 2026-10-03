// รัน: node --experimental-test-module-mocks --test scripts/tests/push-นับสำเร็จจริง.test.mjs
// B11 — `pushToAdmins` คืน "จำนวนที่ส่งสำเร็จ" ที่ไม่ได้นับความสำเร็จ
//
// 🔴 ของเดิม: `return all.length - dead.length` และ `dead` เพิ่มเฉพาะ 404/410
//    ⇒ พลาดด้วย 500 · เน็ตหลุด · VAPID ไม่ตรง ⇒ **ถูกนับเป็นสำเร็จ**
//    ⇒ `/api/push` ตอบ `{ok:true, sent:1}` ทั้งที่ไม่มีเครื่องไหนได้รับเลย
//    และเจ้าของร้านกดปุ่ม "ทดสอบการแจ้งเตือน" แล้วเห็นว่าใช้งานได้ ⇒ **เชื่อว่าระบบพร้อม**
//    วันที่ลูกค้าทักจริงแล้วไม่เด้ง จะไม่มีใครย้อนมาสงสัยปุ่มทดสอบที่เคยขึ้นเขียว
//
// 🔑 ท่าที่ถูกอยู่ในไฟล์เดียวกันห่างกันสามฟังก์ชัน: `pushToUser` นับ `ok++` จาก `.then()`
//    ⇒ คลาส: **สองฟังก์ชันรูปเดียวกันในไฟล์เดียวกัน นับคนละความหมาย**
//      `ok` = สำเร็จจริง · `all - dead` = "ทั้งหมดลบที่เรารู้ว่าตาย" (ซึ่งไม่ใช่ความสำเร็จ)
//
// 🔑 ตัวทดสอบนี้ต้อง **ตกกับโค้ดเดิม** ไม่งั้นไม่ได้ทดสอบอะไรเลย
//    พิสูจน์แล้ว 3 ต.ค. 2569: โค้ดเดิม ⇒ ตก 2 ข้อ (ได้ 1/2 ทั้งที่ควรได้ 0/1) · ตัวแก้ ⇒ ผ่าน 5/5
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const หน่วยความจำ = new Map();
const fakeStore = {
  get: async (k) => (หน่วยความจำ.has(k) ? JSON.parse(หน่วยความจำ.get(k)) : null),
  setJSON: async (k, v) => { หน่วยความจำ.set(k, JSON.stringify(v)); },
  delete: async (k) => { หน่วยความจำ.delete(k); },
  list: async ({ prefix } = {}) => ({
    blobs: [...หน่วยความจำ.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((key) => ({ key })),
  }),
};
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });

// ผลลัพธ์ต่อ endpoint — ตั้งได้ทีละเคส
let ผลตามปลายทาง = new Map();
mock.module('web-push', {
  defaultExport: {
    setVapidDetails() {},
    generateVAPIDKeys: () => ({ publicKey: 'p', privateKey: 's' }),
    sendNotification: async (sub) => {
      const รหัส = ผลตามปลายทาง.get(sub.endpoint);
      if (!รหัส) return;                       // ไม่ตั้ง = สำเร็จ
      const e = new Error(`HTTP ${รหัส}`);
      e.statusCode = รหัส;
      throw e;
    },
  },
});
mock.module('../../netlify/lib/session.mjs', { namedExports: { normPhone: (p) => String(p || '').replace(/\D/g, '') } });

const { addSub, pushToAdmins, listSubs } = await import('../../netlify/lib/push.mjs');

const เครื่อง = (n) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'a', auth: 'b' } });
const ตั้งเครื่อง = async (...ชื่อ) => {
  หน่วยความจำ.clear();
  ผลตามปลายทาง = new Map();
  for (const n of ชื่อ) await addSub(เครื่อง(n));
};

test('B11 · เครื่องเดียวและปลายทางตอบ 500 ⇒ ต้องคืน 0 ไม่ใช่ 1', async () => {
  await ตั้งเครื่อง('มือถือ');
  ผลตามปลายทาง.set('https://push.example/มือถือ', 500);
  const n = await pushToAdmins({ title: 'x' });
  assert.equal(n, 0,
    `ส่งไม่สำเร็จสักเครื่องแต่ระบบคืน ${n} — ผู้เรียกจะรายงานว่าส่งแล้ว`);
});

test('B11 · สองเครื่อง สำเร็จ 1 พลาด 1 (503) ⇒ ต้องคืน 1', async () => {
  await ตั้งเครื่อง('มือถือ', 'คอม');
  ผลตามปลายทาง.set('https://push.example/คอม', 503);
  assert.equal(await pushToAdmins({ title: 'x' }), 1);
});

test('B11 · เครื่องที่พลาดด้วย 500 **ห้ามถูกลบ** (อาจเป็นปลายทางสะดุดชั่วคราว)', async () => {
  await ตั้งเครื่อง('มือถือ', 'คอม');
  ผลตามปลายทาง.set('https://push.example/คอม', 500);
  await pushToAdmins({ title: 'x' });
  assert.equal((await listSubs()).length, 2, 'สะดุดชั่วคราวไม่ใช่เหตุให้ถอนเครื่องออก');
});

test('ตัวควบคุมลบ · 404/410 ยังต้องถูกเก็บกวาดเหมือนเดิม', async () => {
  await ตั้งเครื่อง('มือถือ', 'เก่า');
  ผลตามปลายทาง.set('https://push.example/เก่า', 410);
  const n = await pushToAdmins({ title: 'x' });
  assert.equal(n, 1, 'เหลือเครื่องที่ส่งสำเร็จ 1 เครื่อง');
  assert.deepEqual((await listSubs()).map((x) => x.endpoint), ['https://push.example/มือถือ'],
    'เครื่องที่ถอนสิทธิ์แล้วต้องถูกลบ');
});

test('ตัวควบคุมลบ · ทุกเครื่องสำเร็จ ⇒ ต้องคืนจำนวนเต็มเท่าเดิม (ตัวแก้ไม่ทำให้ของปกติเพี้ยน)', async () => {
  await ตั้งเครื่อง('มือถือ', 'คอม', 'แท็บเล็ต');
  assert.equal(await pushToAdmins({ title: 'x' }), 3);
});
