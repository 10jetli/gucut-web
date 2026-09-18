// รัน: node --experimental-test-module-mocks --test scripts/tests/push-two-devices.test.mjs
// B07 — ลูกค้าคนเดียวมีหลายเครื่อง: เครื่องที่สมัครทีหลังต้องไม่ทับเครื่องแรก
//
// 🔴 ของเดิม addUserSub ทำท่า อ่าน → แก้ → เขียนกลับ ทั้งก้อน
//    สองเครื่องของคนเดียวกันกดไล่กัน (อ่านทั้งคู่ก่อน แล้วค่อยเขียน) = เครื่องแรกหาย
//    ⇒ `hasUserSub` ตอบ false ทั้งที่ลูกค้ากดรับแล้ว · ไม่มี error ให้ใครเห็น
//
// 🔑 ตัวทดสอบนี้ต้อง **ตกกับโค้ดเดิม** ไม่งั้นมันไม่ได้ทดสอบอะไรเลย
//    พิสูจน์แล้ว 18 ก.ย. 2569: คืนโค้ดเดิม → ตก 1 ข้อ ("ระบบเห็น 1 เครื่อง") · ใส่ตัวแก้ → ผ่าน 4/4
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// ถังจำลอง — จดลำดับการเขียนไว้ให้ตรวจได้ว่ามีใครเขียนทับใคร
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
mock.module('web-push', {
  defaultExport: { setVapidDetails() {}, generateVAPIDKeys: () => ({ publicKey: 'p', privateKey: 's' }), sendNotification: async () => {} },
});
mock.module('../../netlify/lib/session.mjs', { namedExports: { normPhone: (p) => String(p || '').replace(/\D/g, '') } });

const { addUserSub, hasUserSub, removeUserSub, pushToUser } = await import('../../netlify/lib/push.mjs');

/* 🔑 นับเครื่องด้วย pushToUser เพราะ webpush ถูกปลอมให้สำเร็จเสมอ ⇒ ค่าที่คืน = จำนวนเครื่องที่ระบบเห็นจริง
   **ห้ามวัดด้วยการกดสมัครซ้ำแล้วดูตัวเลข** — รอบแรกผมทำแบบนั้น แล้วการกดซ้ำไปเติมเครื่องที่หายกลับพอดี
   ตัวทดสอบเลยผ่านทั้งโค้ดเก่าและใหม่ = ไม่ได้ทดสอบอะไรเลย (กฎ test-must-discriminate) */
const นับเครื่อง = (phone) => pushToUser(phone, { title: 'x', body: 'y' });

const เครื่อง = (n) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'a', auth: 'b' } });

test('สองเครื่องของลูกค้าคนเดียวกันสมัครพร้อมกัน ⇒ ต้องอยู่ครบทั้งคู่', async () => {
  หน่วยความจำ.clear();
  // ยิงพร้อมกันจริง ๆ ไม่ใช่ไล่ทีละตัว — ท่า อ่าน→แก้→เขียน จะทับกันตรงนี้
  await Promise.all([addUserSub('081-111-1111', เครื่อง('มือถือ')), addUserSub('0811111111', เครื่อง('คอม'))]);
  assert.equal(await hasUserSub('0811111111'), true, 'กดรับแล้วต้องนับว่ามี');
  const n = await นับเครื่อง('0811111111');
  assert.equal(n, 2, `ต้องเหลือ 2 เครื่อง แต่ระบบเห็น ${n} — เครื่องหนึ่งถูกเขียนทับตอนสมัครพร้อมกัน`);
});

test('เบอร์ที่มีขีดกับไม่มีขีด ต้องเป็นคนเดียวกัน', async () => {
  หน่วยความจำ.clear();
  await addUserSub('063-143-8888', เครื่อง('ก'));
  assert.equal(await hasUserSub('0631438888'), true);
});

test('ถอนเครื่องหนึ่ง เครื่องที่เหลือต้องไม่หายตาม', async () => {
  หน่วยความจำ.clear();
  await addUserSub('0811111111', เครื่อง('ก'));
  await addUserSub('0811111111', เครื่อง('ข'));
  await removeUserSub('0811111111', 'https://push.example/ก');
  assert.equal(await hasUserSub('0811111111'), true, 'ถอนเครื่องเดียวต้องไม่ล้างหมด');
  assert.equal(await นับเครื่อง('0811111111'), 1, 'ต้องเหลือเครื่องเดียว');
});

test('ของเก่าที่เก็บเป็นอาร์เรย์ไว้แล้ว ต้องยังอ่านเจอ (ห้ามทำลูกค้าเดิมเงียบ)', async () => {
  หน่วยความจำ.clear();
  หน่วยความจำ.set('u/0811111111', JSON.stringify([เครื่อง('ของเก่า')]));
  assert.equal(await hasUserSub('0811111111'), true, 'ลูกค้าที่เคยกดไว้ต้องไม่หายไป');
  await addUserSub('0811111111', เครื่อง('ของใหม่'));
  assert.equal(await นับเครื่อง('0811111111'), 2, 'ของเก่า + ของใหม่ = 2 เครื่อง');
});
