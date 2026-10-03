// รัน: node --experimental-test-module-mocks --test scripts/tests/มาร์เก็ตเพลส-ตรวจเชื่อมไม่ได้ห้ามแปลว่าไม่ได้เชื่อม.test.mjs
// B28 — `validToken().catch(() => null)` ทำให้ "ตรวจไม่ได้" กลายเป็น "ยังไม่ได้กดอนุญาต"
//
// 🔴 `validToken()` ของ Lazada คืน `null` **เฉพาะตอนไม่มี token เก็บไว้** (ยังไม่เคยเชื่อมจริง)
//    และ **โยน** เมื่ออ่าน token ไม่ได้ (Blobs สะดุด · คีย์เสีย)
//    ⇒ `.catch(() => null)` รวมสองเหตุนี้เป็นอย่างเดียวกัน
//    ⇒ จอขึ้นว่า **"ยังไม่ได้กดอนุญาตให้เว็บเข้าถึงร้าน Lazada"** ซึ่งเป็น
//      **คำสั่งให้ไปทำสิ่งที่ไม่ต้องทำ** (ร้านกดอนุญาตไปแล้ว)
//    ⇒ และ Lazada **ถูกตัดออกจาก sources** ⇒ ไม่โผล่ใน `checked` และไม่โผล่ใน `failed` ด้วย
//      ⇒ **หายไปจากรายงานทั้งใบ** โดยไม่มีช่องไหนบอกว่าหายไปเพราะอะไร
//
// 🔑 ไฟล์นี้เขียนแยกสามสถานะไว้เองแล้วที่หัวไฟล์
//    (`failed` = ถามแล้วล้ม · `notConnected` = ยังไม่ได้เชื่อม · `unreliable` = ตอบมาแต่ผิด)
//    **แต่ไม่มีช่องสำหรับ "ตรวจสถานะการเชื่อมไม่ได้"** ⇒ มันถูกยัดลง notConnected
//
// 🔑 ต้องตกกับโค้ดเดิม · พิสูจน์แล้ว 4 ต.ค. 2569: โค้ดเดิม ⇒ ตก 3 ข้อ · ตัวแก้ ⇒ ผ่าน 6/6
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const ถัง = new Map();
const fakeStore = {
  get: async (k) => (ถัง.has(k) ? JSON.parse(ถัง.get(k)) : null),
  setJSON: async (k, v) => { ถัง.set(k, JSON.stringify(v)); },
  delete: async () => {},
  list: async () => ({ blobs: [] }),
};
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });

// ผลของ validToken ตั้งได้ทีละเคส: 'มี' | 'ไม่มี' | 'โยน'
let โทเคน = 'มี';
mock.module('../../netlify/lib/lazada.mjs', {
  namedExports: {
    validToken: async () => {
      if (โทเคน === 'โยน') throw new Error('อ่าน token ไม่ได้');
      return โทเคน === 'มี' ? { accessToken: 'a', expiresAt: Date.now() + 9e8 } : null;
    },
    shopCall: async () => ({}),
  },
});
// ช่องทางอื่นให้ตอบของจริงนิดหน่อย เพื่อไม่ให้รอบนี้ล้มทั้งใบ
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ list: [] }), text: async () => '' });

const { marketplaceListings } = await import('../../netlify/lib/marketplace-listings.mjs');

const ยิง = async () => { ถัง.clear(); return marketplaceListings({ force: true }); };

test('B28 · ตรวจ token ไม่ได้ (โยน) ⇒ **ห้ามบอกว่า "ยังไม่ได้กดอนุญาต"**', async () => {
  โทเคน = 'โยน';
  const r = await ยิง();
  assert.ok(!/ยังไม่ได้กดอนุญาต/.test(String(r.notConnected?.lazada ?? '')),
    'อ่าน token ไม่ได้ ≠ ยังไม่ได้เชื่อม — ข้อความนี้สั่งให้ร้านไปทำสิ่งที่ทำไปแล้ว');
});

test('B28 · ตรวจ token ไม่ได้ ⇒ ต้องมีช่องที่บอกว่า **ตรวจไม่ได้** ไม่ใช่หายไปเงียบ', async () => {
  โทเคน = 'โยน';
  const r = await ยิง();
  const เอ่ยถึง = JSON.stringify(r);
  assert.ok(/ตรวจ(สถานะ)?(การเชื่อม)?ไม่ได้|เชื่อมไม่ทราบ|unknown/i.test(เอ่ยถึง),
    'ต้องมีสักช่องที่บอกว่า Lazada ตรวจสถานะไม่ได้ในรอบนี้');
  assert.ok(!r.checked?.includes('lazada'), 'ตรวจไม่ได้ ⇒ ห้ามนับว่า checked');
});

test('ตัวควบคุมลบ · ไม่มี token จริง (null) ⇒ ยังต้องบอกว่า "ยังไม่ได้กดอนุญาต"', async () => {
  โทเคน = 'ไม่มี';
  const r = await ยิง();
  assert.match(String(r.notConnected?.lazada ?? ''), /ยังไม่ได้กดอนุญาต/,
    'ยังไม่เคยเชื่อมจริง = ข้อความเดิมถูกต้อง ห้ามเปลี่ยน');
});

test('ตัวควบคุมลบ · ไม่มี token จริง ⇒ ต้องไม่ขึ้นว่า "ตรวจไม่ได้"', async () => {
  โทเคน = 'ไม่มี';
  const r = await ยิง();
  assert.ok(!/ตรวจสถานะการเชื่อมไม่ได้/.test(JSON.stringify(r)),
    'ไม่เคยเชื่อม ≠ ตรวจไม่ได้ — สองสถานะต้องไม่ปนกันทั้งสองทิศ');
});

test('ตัวควบคุมลบ · มี token ⇒ lazada ต้องเข้าลูปถาม (โผล่ใน checked หรือ failed)', async () => {
  โทเคน = 'มี';
  const r = await ยิง();
  const โผล่ = (r.checked ?? []).includes('lazada') || 'lazada' in (r.failed ?? {});
  assert.ok(โผล่, 'มี token = ต้องถูกถาม · ผลเป็นอย่างไรค่อยว่ากัน');
  assert.ok(!r.notConnected?.lazada, 'มี token แล้วห้ามบอกว่ายังไม่ได้เชื่อม');
});

test('B28 · ทั้งสามสถานะต้องแยกกันได้จากคำตอบ ไม่ใช่เดาจากการหายไป', async () => {
  const เก็บ = {};
  for (const s of ['มี', 'ไม่มี', 'โยน']) { โทเคน = s; เก็บ[s] = await ยิง(); }
  const ป้าย = (r) => [
    (r.checked ?? []).includes('lazada') ? 'checked' : '',
    r.notConnected?.lazada ? 'notConnected' : '',
    'lazada' in (r.failed ?? {}) ? 'failed' : '',
    /ตรวจสถานะการเชื่อมไม่ได้/.test(JSON.stringify(r)) ? 'ตรวจไม่ได้' : '',
  ].filter(Boolean).join('+') || '(หายไปเงียบ)';
  const ผล = { มี: ป้าย(เก็บ['มี']), ไม่มี: ป้าย(เก็บ['ไม่มี']), โยน: ป้าย(เก็บ['โยน']) };
  assert.notEqual(ผล['ไม่มี'], ผล['โยน'], `สองสถานะนี้ต้องต่างกัน แต่ได้ ${JSON.stringify(ผล)}`);
  assert.notEqual(ผล['โยน'], '(หายไปเงียบ)', 'ตรวจไม่ได้ ห้ามหายไปจากรายงาน');
});
