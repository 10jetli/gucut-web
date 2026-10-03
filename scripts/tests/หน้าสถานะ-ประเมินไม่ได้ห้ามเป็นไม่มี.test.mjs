// รัน: node --experimental-test-module-mocks --test "scripts/tests/หน้าสถานะ-ประเมินไม่ได้ห้ามเป็นไม่มี.test.mjs"
// t_muslvgrw · B19 — ตัวเช็คอ่านข้อมูลไม่ได้ ห้ามตอบว่า "ยังไม่มีเครื่องไหนเปิดรับ"
//
// 🔑 กติกาที่ฝั่งท่อตั้งไว้และใบนี้ต้องเคารพ: **หน้าสถานะต้องเสิร์ฟได้แม้ของบางชิ้นอ่านไม่ได้**
//    ⇒ ห้ามแก้ให้โยน · ทางออกคือ `warn` (สถานะที่ทั้งท่อและจอรองรับอยู่แล้ว)
//      + ฟิลด์ `unknown` ที่จอเอาไปกรอง/นับ/เตือนได้ (ไม่ใช่ยัดคำเตือนลงในสตริง)
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const ถัง = new Map();
const state = { failGet: null, failList: false };
const ร้าน = () => ({
  get: async (key) => {
    if (state.failGet && String(key).startsWith(state.failGet)) throw new Error('blobs อ่านล้มจำลอง');
    return ถัง.has(key) ? structuredClone(ถัง.get(key)) : null;
  },
  setJSON: async (k, v) => ถัง.set(k, structuredClone(v)),
  set: async (k, v) => ถัง.set(k, v),
  delete: async (k) => ถัง.delete(k),
  list: async ({ prefix }) => {
    if (state.failList) throw new Error('blobs list ล้มจำลอง');
    return { blobs: [...ถัง.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
  },
});
mock.module('@netlify/blobs', { namedExports: { getStore: ร้าน } });
mock.module('../../netlify/lib/admin-gate.mjs', { namedExports: { adminGate: async () => ({ ok: true }) } });
mock.module('../../netlify/lib/coredb.mjs', {
  namedExports: { coreReady: () => true, coreQuery: async () => [] },
});
// ตัวเช็คอื่นยิงออกเน็ตจริง — ตัดทิ้งให้หมด เหลือเฉพาะเรื่องที่ใบนี้วัด
globalThis.fetch = async () => { throw new Error('ตัดเน็ตในเทส'); };

const { default: status } = await import('../../netlify/functions/status.mjs');

const เรียก = async () => {
  const r = await status(new Request('https://gucut.com/api/status'), {});
  return { status: r.status, body: await r.json() };
};
const หา = (checks, ชื่อ) => checks.find((c) => c.name === ชื่อ);
const reset = () => { ถัง.clear(); state.failGet = null; state.failList = false; };

test('B19 อ่าน push-subs ไม่ได้: ห้ามขึ้น "ยังไม่มีเครื่องไหนเปิดรับ" และต้องติดธง unknown', async () => {
  reset();
  ถัง.set('push-subs', [{ endpoint: 'x' }, { endpoint: 'y' }]);   // ของจริงมี 2 เครื่อง
  state.failGet = 'push-subs';
  const { status: code, body } = await เรียก();
  assert.equal(code, 200, 'หน้าสถานะต้องยังเสิร์ฟได้ — ห้ามโยน');
  const c = หา(body.checks, 'แจ้งเตือนเด้งมือถือ');
  assert.equal(c.unknown, true, 'ต้องบอกเป็นฟิลด์ ไม่ใช่ซ่อนในข้อความ');
  assert.notEqual(c.state, 'off', '"off" อ่านว่า "ยังไม่ได้เปิดใช้" ซึ่งเป็นคำยืนยันที่ผิด');
  assert.ok(!/ยังไม่มีเครื่องไหนเปิดรับ/.test(c.note), 'ข้อความต้องไม่ยืนยันว่าไม่มีใครเปิด');
  assert.match(c.note, /ยังไม่รู้/);
});

/* ⚠️ ตัวควบคุมลบสองข้อนี้ **จงใจไม่ตรวจว่ามีช่อง `unknown`** (ใช้ `!== true` ไม่ใช่ `=== false`)
   เพื่อให้ **รันผ่านได้ทั้งโค้ดเดิมและตัวแก้** ⇒ เป็นตัวควบคุมที่ใช้ได้จริง
   ถ้าเขียน `=== false` มันจะตกบนโค้ดเดิมเพราะ *ยังไม่มีช่องนั้น* ซึ่งไม่ได้พิสูจน์อะไรเลย
   (การบังคับว่าช่องต้องมีอยู่ในทุกตัวเช็ค อยู่ในข้อถัดไปซึ่งประกาศตัวว่าเป็นเกณฑ์ของสัญญาใหม่) */
test('ตัวควบคุมลบ: อ่านได้และยังไม่มีใครเปิดรับจริง ⇒ off และไม่ติดธงไม่รู้', async () => {
  reset();
  const { body } = await เรียก();
  const c = หา(body.checks, 'แจ้งเตือนเด้งมือถือ');
  assert.equal(c.state, 'off');
  assert.notEqual(c.unknown, true, 'ไม่มีใครเปิดจริง = คำยืนยันที่ถูก ห้ามถูกรายงานว่าไม่รู้');
  assert.match(c.note, /ยังไม่มีเครื่องไหนเปิดรับ/);
});

test('ตัวควบคุมลบ: อ่านได้และมี 2 เครื่องจริง ⇒ บอกจำนวนถูกและไม่ติดธงไม่รู้', async () => {
  reset();
  ถัง.set('push-subs', [{ endpoint: 'x' }, { endpoint: 'y' }]);
  const { body } = await เรียก();
  const c = หา(body.checks, 'แจ้งเตือนเด้งมือถือ');
  assert.notEqual(c.unknown, true);
  assert.match(c.note, /เปิดรับอยู่ 2 เครื่อง/);
});

/* 🆕 ข้อนี้เป็น **เกณฑ์ของสัญญาใหม่** — โค้ดเดิมตกแน่นอนเพราะยังไม่มีช่องนี้
   จึงไม่ใช่หลักฐานเทียบรุ่น แต่เป็นด่านกันไม่ให้ตัวเช็คที่เพิ่มวันหน้าลืมส่งช่องนี้ */
test('🔑 ทุกตัวเช็คต้องมีช่อง unknown — ไม่มีช่อง = จอแยก "ท่อรุ่นเก่า" จาก "ประเมินได้ครบ" ไม่ออก', async () => {
  reset();
  const { body } = await เรียก();
  const ขาด = body.checks.filter((c) => typeof c.unknown !== 'boolean').map((c) => c.name);
  assert.deepEqual(ขาด, [], `ตัวเช็คที่ไม่ส่งช่อง unknown: ${ขาด.join(' · ')}`);
});

test('🔑 แยกแยะได้: "อ่านไม่ได้" ต้องไม่ตอบเหมือน "ไม่มีใครเปิดรับจริง"', async () => {
  reset();
  const ไม่มีใครเปิดจริง = JSON.stringify(หา((await เรียก()).body.checks, 'แจ้งเตือนเด้งมือถือ'));

  reset();
  ถัง.set('push-subs', [{ endpoint: 'x' }]);
  state.failGet = 'push-subs';
  const อ่านไม่ได้ = JSON.stringify(หา((await เรียก()).body.checks, 'แจ้งเตือนเด้งมือถือ'));

  // ตัด ms ออกก่อนเทียบ — มันต่างกันทุกรอบอยู่แล้ว ไม่ใช่หลักฐานอะไร
  const ตัดเวลา = (j) => j.replace(/"ms":\d+/, '"ms":0');
  assert.notEqual(
    ตัดเวลา(อ่านไม่ได้), ตัดเวลา(ไม่มีใครเปิดจริง),
    'สองสถานการณ์ตอบเหมือนกัน ⇒ เจ้าของร้านอ่านว่าแอดมินยังไม่เปิดแจ้งเตือน แล้วไปตั้งใหม่\n'
    + '    ขณะที่ความจริงคือที่เก็บข้อมูลอ่านไม่ได้ และแจ้งเตือนอาจเงียบอยู่โดยไม่มีใครรู้',
  );
});
