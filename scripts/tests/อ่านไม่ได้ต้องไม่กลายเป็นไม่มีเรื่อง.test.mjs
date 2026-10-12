// รัน: node --experimental-test-module-mocks --test scripts/tests/อ่านไม่ได้ต้องไม่กลายเป็นไม่มีเรื่อง.test.mjs
//
// 🔴 **ใบ B25 (t_mv4xdjei)** — คลาสเดียวกับ B18 แต่อยู่ที่ทะเบียนเลื่อยโซ่ยนต์
//    `.catch(() => null)` ทำให้ "อ่านที่เก็บข้อมูลไม่ได้" กลายเป็น "ไม่มีเรื่องนี้"
//    ⇒ ร้านเชื่อว่าลูกค้าไม่เคยยื่น แล้วไปบอกลูกค้าผิด (เรื่องทางราชการ ตามกลับยาก)
//
// 🔑 **ทำไมไฟล์นี้เกิดหลังการแก้**: สามทางในไฟล์เดียวถูกแก้ไปแล้ว (GET · PATCH)
//    แต่ **ทางลบยังเหลือ `.catch(() => null)`** ⇒ ทางที่เหลือดูเหมือนถูกเพราะเพื่อนบ้านถูก
//    (คลาสฝาแฝดที่ถูกแก้คนละรอบแล้วไม่เท่ากัน — โผล่ 3 รอบในวันเดียวที่ฝั่งท่อ)
//    ⇒ เทสนี้จับทั้งสามทางพร้อมกัน เพื่อให้ "แก้ทางเดียว" แดงทันที
//
// ⚠️ ขอบเขต: ตรวจ **ทิศของความไม่รู้ + ถ้อยคำ** ไม่ได้ตรวจเนื้อหาเอกสาร
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let พฤติกรรม = { throwOnGet: false, ของ: {}, โยนคีย์: [] };
const เรียก = { delete: [], setJSON: [] };
mock.module('@netlify/blobs', { namedExports: {
  getStore: () => ({
    async get(k) {
      /* 🔑 ต้องสั่งให้ **บางคี่** พังได้ ไม่ใช่พังทั้งถัง — เพราะอาการจริงของรูปที่หาย
         คือถังอ่านได้แต่คีย์หนึ่งอ่านไม่ได้ (ถังพังทั้งใบจะไม่ถึงกิ่งนั้นเลย) */
      if (พฤติกรรม.throwOnGet || (พฤติกรรม.โยนคีย์ || []).includes(k)) {
        throw new Error('Blobs สะดุด (จำลอง)');
      }
      return พฤติกรรม.ของ[k] ?? null;
    },
    async set(k, v) { เรียก.setJSON.push(k); พฤติกรรม.ของ[k] = v; },
    async setJSON(k, v) { เรียก.setJSON.push(k); พฤติกรรม.ของ[k] = v; },
    async delete(k) { เรียก.delete.push(k); delete พฤติกรรม.ของ[k]; },
    async list() { return { blobs: Object.keys(พฤติกรรม.ของ).map((key) => ({ key })) }; },
  }),
} });
mock.module('../../netlify/lib/admin-gate.mjs', { namedExports: {
  adminGate: async () => ({ wants: true, ok: true, deny: null }),
} });
mock.module('../../netlify/lib/push.mjs', { namedExports: { pushToAdmins: async () => {} } });
mock.module('../../netlify/lib/session.mjs', { namedExports: {
  currentUser: async () => ({ phone: '0800000000' }),
  store: () => ({ async get() { return null; }, async setJSON() {} }),
} });
mock.module('../../netlify/lib/blob-keys.mjs', { namedExports: {
  อ่านทุกแถว: async () => ({ items: [], unreadable: 0 }),
} });

const handler = (await import('../../netlify/functions/permit-doc.mjs')).default;
const ctx = {};
const ยิง = (url, init = {}) => handler(new Request(url, init), ctx);
const ตั้ง = (x) => {
  พฤติกรรม = { throwOnGet: false, ของ: {}, โยนคีย์: [], ...x };
  เรียก.delete.length = 0; เรียก.setJSON.length = 0;
};
const เนื้อ = async (res) => { try { return await res.json(); } catch { return {}; } };

test('🔴 GET ?phone= : อ่านไม่ได้ ⇒ 503 ไม่ใช่ 404 และห้ามพูดว่าไม่พบ', async () => {
  ตั้ง({ throwOnGet: true });
  const res = await ยิง('https://x/api/permit-doc?phone=0800000000');
  assert.equal(res.status, 503, 'อ่านไม่ได้ต้องเป็น 503 — 404 แปลว่า "ไม่มีเรื่องนี้" ซึ่งเราไม่รู้');
  const b = await เนื้อ(res);
  assert.ok(!/ไม่พบเรื่องนี้$/.test(b.error || ''), 'ห้ามใช้ถ้อยคำเดียวกับกรณีไม่มีจริง');
});

test('⚖️ GET ?phone= : อ่านได้แต่ไม่มีเรื่อง ⇒ 404 "ไม่พบเรื่องนี้" (สองกรณีต้องพูดต่างกัน)', async () => {
  ตั้ง({ ของ: {} });
  const res = await ยิง('https://x/api/permit-doc?phone=0800000000');
  assert.equal(res.status, 404);
  const b = await เนื้อ(res);
  assert.ok((b.error || '').includes('ไม่พบ'), 'ไม่มีจริงต้องบอกตรง ๆ ว่าไม่พบ');
});

test('🔴 PATCH : อ่านไม่ได้ ⇒ 503 และ **ห้ามเขียนอะไรลงไป**', async () => {
  ตั้ง({ throwOnGet: true });
  const res = await ยิง('https://x/api/permit-doc', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '0800000000', stage: 'lz2' }),
  });
  assert.equal(res.status, 503);
  assert.deepEqual(เรียก.setJSON, [], 'อ่านไม่ได้แล้วยังเขียน = ทับประวัติด้วยของที่เดาเอา');
});

test('🔴 DELETE : อ่านไม่ได้ ⇒ 503 และ **ห้ามลบอะไรเลย**', async () => {
  ตั้ง({ throwOnGet: true });
  /* ⚠️ เส้นลบต้องมี `?shop=` ด้วย — รุ่นแรกผมใช้ `?delete=1` แล้วได้ **405**
     ⇒ ถ้าผมเขียน assert หลวมกว่านี้ (เช่นดูแค่ `res.status !== 200`) เทสจะ **เขียวโดยไม่เคยเดินถึงโค้ดที่ตรวจ**
     🔑 เทสที่ยิง URL ผิดจะเงียบที่สุดตอนเกณฑ์กว้าง ⇒ เกณฑ์ต้องเจาะจงรหัสที่คาด (503) */
  const res = await ยิง('https://x/api/permit-doc?shop=1&phone=0800000000&confirm=1', { method: 'DELETE' });
  assert.equal(res.status, 503, 'ทางนี้คือทางที่ยังเหลือ .catch(() => null) ก่อนรอบนี้');
  assert.deepEqual(เรียก.delete, [], 'อ่านไม่ได้แล้วลบ = ลบของที่ไม่รู้ว่ามีอะไร');
  const b = await เนื้อ(res);
  assert.ok(!/ไม่พบเรื่องของเบอร์นี้/.test(b.error || ''),
    'ของเดิมตอบข้อความนี้ ⇒ ร้านเชื่อว่าลูกค้าไม่เคยยื่น');
});

test('🔴 รูปที่อ่านไม่ได้ ห้ามหายจากจอเงียบ ๆ — ต้องบอกจำนวนที่หยิบมาไม่ได้', async () => {
  ตั้ง({
    ของ: {
      'c/0800000000': { name: 'ทดสอบ', images: 2, stage: 'lz2' },
      'img/0800000000/0': 'รูปหนึ่ง',
      'img/0800000000/1': 'รูปสอง',
    },
    โยนคีย์: ['img/0800000000/1'],
  });
  const res = await ยิง('https://x/api/permit-doc?phone=0800000000');
  assert.equal(res.status, 200, 'รูปหายหนึ่งใบไม่ควรทำให้ทั้งเรื่องล้ม');
  const b = await เนื้อ(res);
  assert.equal(b.imageData.length, 1, 'ได้รูปที่อ่านได้มา');
  assert.equal(b['รูปอ่านไม่ได้'], 1,
    'ทะเบียนบอก images:2 แต่ส่งกลับ 1 ⇒ ต้องบอกว่าหยิบมาไม่ได้ 1 ใบ ไม่ใช่เงียบ');
  assert.equal(b.images, 2, 'จำนวนในทะเบียนต้องยังเป็น 2 — ห้ามแก้ให้ตรงกับที่หยิบได้');

  /* ⚖️ ตัวควบคุม: อ่านรูปได้ครบ ⇒ ต้องเป็น 0 ไม่ใช่ undefined
     (ถ้าเป็น undefined จอจะเขียน `Number(x) || 0` แล้วเท่ากัน แต่ "ไม่มีช่อง" กับ "0" คนละเรื่อง) */
  ตั้ง({
    ของ: {
      'c/0800000000': { name: 'ทดสอบ', images: 2, stage: 'lz2' },
      'img/0800000000/0': 'รูปหนึ่ง',
      'img/0800000000/1': 'รูปสอง',
    },
  });
  const ok = await เนื้อ(await ยิง('https://x/api/permit-doc?phone=0800000000'));
  assert.equal(ok.imageData.length, 2);
  assert.equal(ok['รูปอ่านไม่ได้'], 0, 'ครบแล้วต้องส่ง 0 มาด้วย เพื่อให้จอแยก "ไม่มีช่อง" ออกจาก "ศูนย์"');
});
