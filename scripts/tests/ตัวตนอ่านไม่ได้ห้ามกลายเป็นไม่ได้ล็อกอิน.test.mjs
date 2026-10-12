// รัน: node --experimental-test-module-mocks --test scripts/tests/ตัวตนอ่านไม่ได้ห้ามกลายเป็นไม่ได้ล็อกอิน.test.mjs
//
// 🔴 **ใบ B26 (t_mv4yoeiz)** — "อ่านบัญชี/เซสชันไม่ได้" ถูกแปลว่า **"ไม่ได้ล็อกอิน"**
//    ⇒ ลูกค้าที่ล็อกอินอยู่ถูกจอบอกให้เข้าสู่ระบบ · กดเข้าสู่ระบบซ้ำก็เจอเหมือนเดิม = ทางตัน
//
// 🔑 **สิ่งที่ไฟล์นี้ตรวจ ไม่ใช่สิ่งที่ใบชี้**: `auth.mjs` กับ `session.mjs` (ที่ใบชี้)
//    ถูกแก้ไปแล้ว 4 ต.ค. และ `session.mjs` แยกสามสถานะไว้ดี (guest / unknown / user)
//    ของที่ยังค้างคือ **ผู้เรียก** ที่ใช้ `currentUser` (ตัวที่ยุบ unknown เป็น null)
//    ในจุดที่คอมเมนต์ข้าง `currentUser` **ห้ามไว้เอง**:
//      *"จุดที่ให้สิทธิ์ · เขียนทับข้อมูล · หรือบอกลูกค้าว่าเขาเป็นใคร ⇒ ห้ามใช้ตัวนี้"*
//    ⇒ คำกล่าวอ้างว่า "ผู้เรียกที่เหลือทุกตัวใช้ไปให้สิทธิ์น้อยลงเท่านั้น" **เป็นเท็จ 3 จุด**
//    ⇒ ไฟล์นี้จึงตรวจ **ที่ผู้เรียก** ไม่ใช่ที่ตัวอ่าน
//
// ⚠️ ขอบเขต: ใช้ `session.mjs` **ตัวจริง** (ไม่ม็อก) เพื่อให้ `currentUserState` อ่านถังจริง
//    ⇒ ที่ม็อกคือถัง Blobs กับด่านหลังร้านเท่านั้น
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const โทเคน = 'A'.repeat(32);
let พฤติกรรม = { โยนคีย์: [], ของ: {} };
mock.module('@netlify/blobs', { namedExports: {
  getStore: () => ({
    async get(k) {
      if ((พฤติกรรม.โยนคีย์ || []).includes(k)) throw new Error('Blobs สะดุด (จำลอง)');
      return พฤติกรรม.ของ[k] ?? null;
    },
    async set(k, v) { พฤติกรรม.ของ[k] = v; },
    async setJSON(k, v) { พฤติกรรม.ของ[k] = v; },
    async delete(k) { delete พฤติกรรม.ของ[k]; },
    async list() { return { blobs: Object.keys(พฤติกรรม.ของ).map((key) => ({ key })) }; },
  }),
} });
mock.module('../../netlify/lib/admin-gate.mjs', { namedExports: {
  adminGate: async () => ({ wants: false, ok: false, deny: null }),
} });
mock.module('../../netlify/lib/push.mjs', { namedExports: { pushToAdmins: async () => {} } });
mock.module('../../netlify/lib/blob-keys.mjs', { namedExports: {
  อ่านทุกแถว: async () => ({ items: [], unreadable: 0 }),
} });

const permitDoc = (await import('../../netlify/functions/permit-doc.mjs')).default;
const coupon = (await import('../../netlify/functions/coupon.mjs')).default;

const ตั้ง = (x) => { พฤติกรรม = { โยนคีย์: [], ของ: {}, ...x }; };
const มีเซสชัน = (phone = '0800000000') => ({
  [`s/${โทเคน}`]: { phone, at: Date.now() },
  [`u/${phone}`]: { phone, name: 'ลูกค้า' },
});
const ยิง = (f, url, init = {}) => f(new Request(url, {
  ...init, headers: { cookie: `gu_sess=${โทเคน}`, ...(init.headers || {}) },
}), {});
const เนื้อ = async (res) => { try { return await res.json(); } catch { return {}; } };

test('🔴 ทะเบียน ?mine=1 : อ่านบัญชีไม่ได้ ⇒ 503 และ **ห้ามบอกว่าต้องเข้าสู่ระบบ**', async () => {
  ตั้ง({ ของ: มีเซสชัน(), โยนคีย์: ['u/0800000000'] });
  const res = await ยิง(permitDoc, 'https://x/api/permit-doc?mine=1');
  assert.equal(res.status, 503, 'อ่านตัวตนไม่ได้ ⇒ 503 ไม่ใช่ 401');
  const b = await เนื้อ(res);
  assert.notEqual(b.needLogin, true, 'needLogin:true ทำให้หน้าเว็บเด้งไปหน้าล็อกอิน/ล้างสถานะ');
  assert.ok(!/ต้องเข้าสู่ระบบก่อน/.test(b.error || ''),
    'ห้ามใช้ถ้อยคำเดียวกับคนที่ไม่ได้ล็อกอินจริง — เขาล็อกอินอยู่');
});

test('🔴 ทะเบียน ?mine=1 : อ่าน **เซสชัน** ไม่ได้ ⇒ 503 ด้วย (คนละคีย์ กลไกเดียวกัน)', async () => {
  ตั้ง({ ของ: มีเซสชัน(), โยนคีย์: [`s/${โทเคน}`] });
  const res = await ยิง(permitDoc, 'https://x/api/permit-doc?mine=1');
  assert.equal(res.status, 503);
});

test('⚖️ ทะเบียน ?mine=1 : อ่านได้และล็อกอินอยู่ ⇒ 200 (ของปกติต้องไม่โดนร้อง)', async () => {
  ตั้ง({ ของ: มีเซสชัน() });
  const res = await ยิง(permitDoc, 'https://x/api/permit-doc?mine=1');
  assert.equal(res.status, 200);
  const b = await เนื้อ(res);
  assert.equal(b.item.phone, '0800000000');
});

test('⚖️ ทะเบียน ?mine=1 : ไม่มีเซสชันจริง ⇒ 401 needLogin (สองกรณีต้องพูดต่างกัน)', async () => {
  ตั้ง({ ของ: {} });
  const res = await permitDoc(new Request('https://x/api/permit-doc?mine=1'), {});
  assert.equal(res.status, 401, 'คนนอกจริงต้องได้ 401');
  const b = await เนื้อ(res);
  assert.equal(b.needLogin, true, 'คนนอกจริงต้องได้ needLogin เพื่อให้จอพาไปล็อกอิน');
});

test('🔴 โค้ดเฉพาะสมาชิก : อ่านตัวตนไม่ได้ ⇒ ห้ามบอกว่า "เข้าสู่ระบบก่อนใช้ได้เลย"', async () => {
  ตั้ง({
    ของ: { ...มีเซสชัน(), list: [{ code: 'VIP', type: 'baht', value: 100, memberOnly: true }] },
    โยนคีย์: ['u/0800000000'],
  });
  const res = await ยิง(coupon, 'https://x/api/coupon', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'VIP', subtotal: 1000 }),
  });
  const b = await เนื้อ(res);
  assert.equal(b.ok, false, 'ยังไม่ให้ส่วนลด (ทิศของเงินต้องไม่เปลี่ยน)');
  assert.equal(b['ตรวจไม่ได้'], true, 'ต้องมีธงให้จอแยกกรณีได้');
  assert.ok(!/เข้าสู่ระบบก่อน/.test(b.error || ''),
    'คนที่ล็อกอินอยู่แล้วถูกบอกให้เข้าสู่ระบบ = ทางตัน กดซ้ำก็เจอเหมือนเดิม');
});

test('⚖️ โค้ดเฉพาะสมาชิก : อ่านตัวตนได้และเป็นสมาชิก ⇒ ใช้ได้ (พลังแยกแยะ)', async () => {
  ตั้ง({ ของ: { ...มีเซสชัน(), list: [{ code: 'VIP', type: 'baht', value: 100, memberOnly: true }] } });
  const res = await ยิง(coupon, 'https://x/api/coupon', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'VIP', subtotal: 1000 }),
  });
  const b = await เนื้อ(res);
  assert.equal(b.ok, true, 'สมาชิกจริงต้องใช้โค้ดได้ — ไม่ใช่โดนธง ตรวจไม่ได้ ใส่ทุกคน');
  assert.equal(b.discount, 100);
});
