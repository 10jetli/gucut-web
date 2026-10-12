// ด่าน /api/parts-map — เส้นเดียวที่มีทั้ง "คนเขียน" (ท่านประธานกรอกมือ) และ "คนอ่าน" (ลูกค้า)
// 🔑 คุณส้มวัดเจอ 12 ต.ค. 2569 ด้วยวงจร ใส่ → อ่าน → ลบ → อ่านซ้ำ:
//    แคชที่ขอบ 60 วิ ทำให้คนกรอกเห็นของเก่า ⇒ อ่านว่า "งานที่เพิ่งบันทึกหายไป"
//    ⇒ ข้อที่แพงที่สุด: คนกรอกจะโทษตัวเองว่าพิมพ์พลาด แล้วไม่มีใครรายงานบั๊กนี้เลย
// 🔴 และตารางนี้พิมพ์ด้วยมือ ไม่มีสำเนาที่อื่น (รหัสคู่มือ STIHL ↔ รหัสร้าน ตรงกัน 0 ตัว)
//    ⇒ ขาเขียนที่กลืนการอ่านพลาดแล้ว setJSON ทับทั้งรุ่น = ลบแรงงานคนทิ้งแบบตอบ ok:true
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const data = new Map();
let failKey = null;
let writes = [];
const fakeStore = {
  get: async (k) => { if (failKey && k === failKey) throw new Error('blobs ล่มจำลอง'); return data.has(k) ? data.get(k) : null; },
  setJSON: async (k, v) => { writes.push(k); data.set(k, v); },
};
const reset = () => { data.clear(); failKey = null; writes = []; };
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('../../netlify/lib/admin-gate.mjs', { namedExports: { adminGate: async () => ({ ok: true }) } });
const { default: partsMap } = await import('../../netlify/functions/parts-map.mjs');

const KEY = 'parts-map/f440';
const get = (admin) => new Request('https://x/api/parts-map?model=f440',
  { method: 'GET', headers: admin ? { 'x-admin-key': 'k' } : {} });
const post = (body) => new Request('https://x/api/parts-map?model=f440',
  { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': 'k' }, body: JSON.stringify(body) });

test('คนเขียน (มีรหัส) ⇒ ห้ามแคชที่ขอบ · คนอ่าน (ไม่มีรหัส) ⇒ แคชได้ · ทั้งสองทางต้องมี Vary', async () => {
  reset();
  data.set(KEY, { '11230201209': '04382' });

  const w = await partsMap(get(true), {});
  assert.equal(w.status, 200);
  assert.match(w.headers.get('cache-control') || '', /no-store/, 'คนเขียนต้องไม่ถูกแคชในเบราว์เซอร์');
  assert.match(w.headers.get('netlify-cdn-cache-control') || '', /no-store/,
    '🔑 ต้องกันที่ขอบด้วย — no-store เฉย ๆ คุมแค่เบราว์เซอร์ (ข้อที่คุณส้มชี้)');

  const r = await partsMap(get(false), {});
  assert.match(r.headers.get('netlify-cdn-cache-control') || '', /s-maxage=60/, 'คนอ่านยังต้องได้แคช');

  for (const [ชื่อ, res] of [['คนเขียน', w], ['คนอ่าน', r]])
    assert.match(res.headers.get('vary') || '', /x-admin-key/,
      `${ชื่อ}: ต้องมี Vary ทั้งสองทาง ไม่งั้นขอบเอาคำตอบที่แคชไว้ให้คนอ่าน มาเสิร์ฟให้คนเขียน`);
});

test('🔴 ขาเขียน: อ่านตารางเดิมพลาด ⇒ 503 ไม่เขียนทับ (ของที่หายเอาคืนไม่ได้)', async () => {
  reset();
  data.set(KEY, { A: '001', B: '002', C: '003' });
  failKey = KEY;
  const r = await partsMap(post({ part: 'D', sku: '004' }), {});
  assert.equal(r.status, 503);
  assert.equal(writes.length, 0, 'ห้ามเขียนอะไรเลยตอนอ่านไม่ได้');
  assert.equal(Object.keys(data.get(KEY)).length, 3, 'สามคู่เดิมต้องอยู่ครบ');
});

test('ขาเขียนปกติ ⇒ คืน map ทั้งก้อน + ธงว่ายังไม่ได้อ่านกลับ (จอต้องไม่เชื่อค่าที่ตัวเองพิมพ์)', async () => {
  reset();
  data.set(KEY, { A: '001' });
  const r = await partsMap(post({ part: 'B', sku: '002' }), {});
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.deepEqual(b.map, { A: '001', B: '002' });
  assert.equal(b.จับคู่แล้ว, 2);
  assert.equal(b.อ่านกลับแล้ว, false, 'ต้องบอกตรง ๆ ว่ายังไม่ใช่ค่าที่อ่านกลับจากที่เก็บ');
});

test('ขาอ่าน: อ่านพลาด ⇒ ห้ามตอบ 200 ว่า "ยังไม่จับคู่" และห้ามแคช', async () => {
  reset();
  data.set(KEY, { A: '001' });
  failKey = KEY;
  const r = await partsMap(get(false), {});
  assert.notEqual(r.status, 200);
  const b = await r.json();
  assert.equal(b.อ่านไม่ได้, true);
  assert.equal(b.map, undefined, 'ห้ามส่ง map ว่าง — จอจะเขียนว่า "ยังไม่ได้จับคู่" ทุกแถว');
  assert.ok(!/s-maxage/.test(r.headers.get('netlify-cdn-cache-control') || ''), 'ห้ามแคชความว่าง');

  // ไม่มีคีย์เลย = ยังไม่เคยจับคู่จริง ⇒ 200 + map ว่าง ถูกต้อง
  reset();
  const fresh = await partsMap(get(false), {});
  assert.equal(fresh.status, 200);
  assert.deepEqual((await fresh.json()).map, {});
});
