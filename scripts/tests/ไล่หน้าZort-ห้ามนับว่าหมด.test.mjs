// รัน: node --experimental-test-module-mocks --test scripts/tests/ไล่หน้าZort-ห้ามนับว่าหมด.test.mjs
// B22 — กติกาไล่หน้าของ ZORT (ที่เดียว) · ทดสอบ `netlify/lib/zort-pages.mjs` ตรง ๆ
//
// 🔑 **ปลูกของเสียเข้ากติกากลางโดยตรง ไม่พิสูจน์ผ่านผู้เรียก**
//    เพราะรวมกติกามาที่เดียวแล้วได้ความเสี่ยงใหม่: ผิดที่นี่ = **ผิดพร้อมกันทุกฝั่ง**
//    (parity-cant-see-shared-error) ⇒ ด่าน parity ของผู้เรียกจะมองไม่เห็นความผิดที่ใช้ร่วมกัน
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { อ่านหน้าZort, ตรวจชนเพดาน } = await import('../../netlify/lib/zort-pages.mjs');

let ตอบ;
globalThis.fetch = async () => {
  if (ตอบ === 'ไม่ถึง') throw new Error('network');
  return { ok: ตอบ.status >= 200 && ตอบ.status < 300, status: ตอบ.status, json: ตอบ.json };
};
const ok = (list) => ({ status: 200, json: async () => ({ list }) });

test('B22 · ยิงไม่ถึง ZORT ⇒ ต้องโยน (ห้ามคืน [] ให้ลูปแปลว่าหมดหน้า)', async () => {
  ตอบ = 'ไม่ถึง';
  await assert.rejects(() => อ่านหน้าZort('u', {}, { หน้า: 2, ชื่อ: 'ท' }),
    (e) => /ห้ามนับว่าหมดหน้า/.test(e.message));
});

test('B22 · ZORT ตอบ 500 ⇒ ต้องโยน', async () => {
  ตอบ = { status: 500, json: async () => ({}) };
  await assert.rejects(() => อ่านหน้าZort('u', {}, { หน้า: 1, ชื่อ: 'ท' }));
});

test('B22 · 200 แต่ JSON เสีย ⇒ ต้องโยน', async () => {
  ตอบ = { status: 200, json: async () => { throw new SyntaxError('bad'); } };
  await assert.rejects(() => อ่านหน้าZort('u', {}, { หน้า: 1, ชื่อ: 'ท' }),
    (e) => /อ่าน JSON ไม่ได้/.test(e.message));
});

test('B22 · หน้า 2 ไม่มีช่อง list ⇒ ต้องโยน (เป็นไปไม่ได้ถ้าปกติ)', async () => {
  ตอบ = { status: 200, json: async () => ({ ok: true }) };
  await assert.rejects(() => อ่านหน้าZort('u', {}, { หน้า: 2, ชื่อ: 'ท' }),
    (e) => /กลางการไล่หน้า/.test(e.message));
});

test('ตัวควบคุมลบ · หน้าแรกไม่มีช่อง list ⇒ ถือว่าไม่มีรายการ **ห้ามโยน**', async () => {
  // รูปจริงตอนไม่มีข้อมูลยังวัดไม่ได้ (ไม่มีรหัส ZORT ตอนเขียน) ⇒ ไม่ตั้งด่านบนรูปที่เดาเอา
  ตอบ = { status: 200, json: async () => ({}) };
  assert.deepEqual(await อ่านหน้าZort('u', {}, { หน้า: 1, ชื่อ: 'ท' }), []);
});

test('ตัวควบคุมลบ · หน้าปกติ ⇒ คืนรายการตามจริง', async () => {
  ตอบ = ok([{ id: 1 }, { id: 2 }]);
  assert.equal((await อ่านหน้าZort('u', {}, { หน้า: 1, ชื่อ: 'ท' })).length, 2);
});

test('ตัวควบคุมลบ · list ว่างจริง ⇒ คืน [] ไม่โยน', async () => {
  ตอบ = ok([]);
  assert.deepEqual(await อ่านหน้าZort('u', {}, { หน้า: 1, ชื่อ: 'ท' }), []);
});

test('B22·2 · ชนเพดานหน้า (ไม่เคยเจอหน้าสั้น) ⇒ ต้องคืน Error', () => {
  const e = ตรวจชนเพดาน({ ถึงหน้าสุดท้ายจริง: false, เพดานหน้า: 10, ต่อหน้า: 100, ชื่อ: 'ท' });
  assert.ok(e instanceof Error);
  assert.match(e.message, /ไม่ครบ/);
});

test('ตัวควบคุมลบ · เจอหน้าสั้น = หมดจริง ⇒ ต้องคืน null (ไม่ร้องใส่ของปกติ)', () => {
  assert.equal(ตรวจชนเพดาน({ ถึงหน้าสุดท้ายจริง: true, เพดานหน้า: 10, ต่อหน้า: 100, ชื่อ: 'ท' }), null);
});
