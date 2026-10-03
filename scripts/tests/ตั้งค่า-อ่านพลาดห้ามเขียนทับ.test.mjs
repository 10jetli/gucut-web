// รัน: node --experimental-test-module-mocks --test scripts/tests/ตั้งค่า-อ่านพลาดห้ามเขียนทับ.test.mjs
// B15 — อ่านค่าตั้งค่าพลาด แล้ว "ค่าเริ่มต้นว่าง" ถูกเขียนทับของจริง
//
// 🔴 รูปของบั๊ก: ตัวอ่านมี `catch { return ค่าเริ่มต้น }`
//    และ **ทางเขียนใช้ตัวอ่านตัวเดียวกันนั้น** เพื่อเก็บค่าเดิมไว้
//    (หน้าเว็บส่ง token เป็น "" ตอนไม่ได้แก้ ⇒ โค้ดตั้งใจให้ "" = ไม่แตะของเดิม)
//    ⇒ Blobs สะดุดครั้งเดียวตอนกดบันทึก ⇒ `cur` เป็นค่าว่าง ⇒ **เขียนค่าว่างทับ token จริง**
//
// 🔑 ที่ร้ายที่สุดคือ `ensurePushKey`: อ่านพลาด ⇒ เห็นว่า "ยังไม่มีคีย์" ⇒ **สร้างคีย์ใหม่**
//    แล้วเขียนทับค่าทั้งก้อน ⇒ สคริปต์ใน Google Ads ที่ถือคีย์เก่า **ยืนยันตัวไม่ผ่านอีกเลย**
//    ⇒ ค่าโฆษณารายวันหยุดไหลเข้าระบบแบบเงียบ ๆ (ไม่มี error ให้ใครเห็น)
//
// 🔑 ท่าที่ถูกมีตัวอย่างในรีโปแล้ว — `netlify/lib/push.mjs` (addSub/removeSub)
//    คอมเมนต์ที่นั่นเขียนไว้ตรง ๆ ว่า "ทางเขียนปล่อยให้ throw เมื่ออ่านไม่ได้"
//    ⇒ B15 คือคลาสเดียวกันที่ยังไม่ได้ไล่ให้ครบทั้งรีโป
//
// 🔑 ต้อง **ตกกับโค้ดเดิม** พิสูจน์แล้ว 3 ต.ค. 2569: โค้ดเดิม ⇒ ตก 4 ข้อ · ตัวแก้ ⇒ ผ่าน 8/8
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let อ่านพลาด = false;
let ของในถัง = null;
const เขียนไป = [];

const fakeStore = {
  get: async () => {
    if (อ่านพลาด) throw new Error('Blobs สะดุด');
    return ของในถัง;
  },
  setJSON: async (k, v) => { เขียนไป.push(v); ของในถัง = v; },
  delete: async () => {},
};
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });

const { readConfig, saveConfig, ensurePushKey, savePushed } = await import('../../netlify/lib/adstats.mjs');
const { readMarketing, writeMarketing } = await import('../../netlify/lib/marketing.mjs');
const { writeLoyalty } = await import('../../netlify/lib/points.mjs');

const ตั้งต้น = (v) => { ของในถัง = v; เขียนไป.length = 0; อ่านพลาด = false; };

// ── adstats ────────────────────────────────────────────────────────────────
test('B15 · saveConfig: อ่านพลาด ⇒ ต้องโยน และ **ห้ามเขียนอะไรลงถัง**', async () => {
  ตั้งต้น({ fb: { on: true, accountId: '111', token: 'โทเคนจริง' }, google: {} });
  อ่านพลาด = true;
  await assert.rejects(() => saveConfig({ fb: { on: true, token: '' } }));
  assert.equal(เขียนไป.length, 0, 'อ่านไม่ได้แล้วยังเขียน = โทเคนจริงถูกทับด้วยค่าว่าง');
});

test('B15 · ensurePushKey: อ่านพลาด ⇒ ต้องโยน ห้ามสร้างคีย์ใหม่ทับของเดิม', async () => {
  ตั้งต้น({ fb: {}, google: { pushKey: 'คีย์เดิมที่สคริปต์ถืออยู่' } });
  อ่านพลาด = true;
  await assert.rejects(() => ensurePushKey());
  assert.equal(เขียนไป.length, 0, 'สร้างคีย์ใหม่ทับ = สคริปต์ใน Google Ads ยืนยันตัวไม่ผ่านอีกเลย');
});

test('B15 · savePushed: อ่านพลาด ⇒ ต้องโยน ห้ามเขียนทับประวัติค่าโฆษณา', async () => {
  ตั้งต้น({ fb: {}, google: { pushKey: 'k', daily: [{ d: '2026-10-01', c: 'ก', s: 100 }] } });
  อ่านพลาด = true;
  await assert.rejects(() => savePushed([{ date: '2026-10-02', campaign: 'ข', cost: 5 }]));
  assert.equal(เขียนไป.length, 0);
});

test('ตัวควบคุมลบ · saveConfig: อ่านได้ปกติ + ส่ง token ว่าง ⇒ ต้องเก็บโทเคนเดิมไว้', async () => {
  ตั้งต้น({ fb: { on: true, accountId: '111', token: 'โทเคนจริง' }, google: {} });
  const next = await saveConfig({ fb: { on: true, accountId: '111', token: '' } });
  assert.equal(next.fb.token, 'โทเคนจริง', 'ค่าว่าง = ไม่เปลี่ยน ไม่ใช่ลบ');
});

test('ตัวควบคุมลบ · ensurePushKey: ยังไม่เคยมีคีย์ (ถังว่าง) ⇒ ต้องสร้างได้ปกติ', async () => {
  ตั้งต้น(null);
  const k = await ensurePushKey();
  assert.match(k, /^[0-9a-f]{48}$/, 'ครั้งแรกต้องสร้างคีย์ได้ ไม่ใช่โยน');
});

test('ตัวควบคุมลบ · readConfig (ทางอ่าน) ยังถอยเป็นค่าว่างได้ตอนอ่านพลาด', async () => {
  ตั้งต้น({ fb: { token: 'x' }, google: {} });
  อ่านพลาด = true;
  const c = await readConfig();
  assert.equal(c.fb.token, '', 'จอแสดงค่าว่างได้ — แต่ทางเขียนต้องโยน (คนละหน้าที่)');
});

// ── marketing ──────────────────────────────────────────────────────────────
test('B15 · writeMarketing: อ่านพลาด ⇒ ต้องโยน และห้ามเขียนทับพิกเซล', async () => {
  ตั้งต้น({ meta: { on: true, pixelId: '123', token: 'โทเคนเมตา' } });
  อ่านพลาด = true;
  await assert.rejects(() => writeMarketing({ meta: { on: true, pixelId: '123', token: '' } }));
  assert.equal(เขียนไป.length, 0);
});

test('ตัวควบคุมลบ · writeMarketing: อ่านได้ปกติ + token ว่าง ⇒ เก็บของเดิม', async () => {
  ตั้งต้น({ meta: { on: true, pixelId: '123', token: 'โทเคนเมตา' } });
  const m = await writeMarketing({ meta: { on: true, pixelId: '123', token: '' } });
  assert.equal(m.meta.token, 'โทเคนเมตา');
  void readMarketing;
});

// ── points (ไล่ทั้งคลาส ไม่ใช่แก้เฉพาะไฟล์ที่ใบงานระบุ) ────────────────────
test('B15 · writeLoyalty: อ่านพลาด ⇒ ต้องโยน ห้ามรีเซ็ตกติกาแต้มเป็นค่าเริ่มต้น', async () => {
  ตั้งต้น({ on: true, earnPer: 50, redeemValue: 2, minRedeem: 100, maxPercent: 30 });
  อ่านพลาด = true;
  await assert.rejects(() => writeLoyalty({ on: true }));
  assert.equal(เขียนไป.length, 0, 'อ่านไม่ได้แล้วยังเขียน = อัตราแต้มที่ร้านตั้งไว้หาย');
});

test('ตัวควบคุมลบ · writeLoyalty: อ่านได้ปกติ + ส่งมาแค่ on ⇒ ช่องอื่นต้องคงค่าเดิม', async () => {
  ตั้งต้น({ on: true, earnPer: 50, redeemValue: 2, minRedeem: 100, maxPercent: 30 });
  const r = await writeLoyalty({ on: true });
  assert.equal(r.earnPer, 50, 'ช่องที่ไม่ได้ส่งมาต้องคงค่าเดิม ไม่ใช่ค่าเริ่มต้น');
  assert.equal(r.maxPercent, 30);
});
