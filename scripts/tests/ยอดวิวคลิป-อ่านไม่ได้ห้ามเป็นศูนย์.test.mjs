// รัน: node --experimental-test-module-mocks --test "scripts/tests/ยอดวิวคลิป-อ่านไม่ได้ห้ามเป็นศูนย์.test.mjs"
// t_musjp79x · B10 — list สะดุด ⇒ ยอดวิว/หัวใจต้องเป็น "ไม่รู้" ไม่ใช่ 0
//
// 🔑 เคสนี้ **ท่อยังตอบ 200** โดยตั้งใจ (แถวที่อ่านได้ก็ยังมีประโยชน์)
//    ⇒ จอที่ดักแค่ `r.ok` มองไม่เห็น ⇒ ธงต้องเดินมาใน **เนื้อ JSON** และต้องมีเสมอ
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const data = new Map();
const state = { failList: null, failGet: null };
const fakeStore = {
  get: async (key) => {
    if (state.failGet && String(key).startsWith(state.failGet)) throw new Error('blobs อ่านล้มจำลอง');
    return data.has(key) ? structuredClone(data.get(key)) : null;
  },
  setJSON: async (key, value) => data.set(key, structuredClone(value)),
  set: async (key, value) => data.set(key, value),
  delete: async (key) => data.delete(key),
  list: async ({ prefix }) => {
    // failList เป็นรายการ prefix ที่ให้ล้ม — ทั้งสามช่องต้องพังแยกกันได้
    if (state.failList && state.failList.includes(prefix)) throw new Error('blobs list ล้มจำลอง');
    return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
  },
};

mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('../../netlify/lib/admin-gate.mjs', { namedExports: { adminGate: async () => ({ ok: true }) } });

const { readViews, readWatch } = await import('../../netlify/lib/views.mjs');
const { default: clipStats } = await import('../../netlify/functions/clip-stats.mjs');

const เรียก = () => clipStats(new Request('https://gucut.com/api/clip-stats'), {});

function reset({ มีคนดู = true } = {}) {
  data.clear();
  state.failList = null;
  state.failGet = null;
  if (มีคนดู) {
    // คลิป AAA: 2 คนดู · 1 คนดูถึงครึ่ง · คลิป BBB: 1 คนดู
    data.set('w/AAA/u1', 1); data.set('w/AAA/u2', 1); data.set('q/AAA/u1', 1);
    data.set('w/BBB/u1', 1);
    data.set('counts', { AAA: [5, 2] });
  }
}

/* ───────── readViews — ฟีดหน้าร้าน ต้องเสิร์ฟต่อ แต่ต้องบอกว่าไม่รู้ ───────── */

test('B10 อ่าน w/ ไม่ได้: readViews คืน unknown:true (ไม่โยน เพราะฟีดต้องขึ้นได้)', async () => {
  reset();
  state.failList = ['w/'];
  const r = await readViews();
  assert.equal(r.unknown, true);
  assert.deepEqual(r.views, {});
});

test('ตัวควบคุมลบ: อ่านได้และมีคนดู ⇒ unknown:false พร้อมยอดจริง', async () => {
  reset();
  const r = await readViews();
  assert.equal(r.unknown, false, 'ช่อง unknown ต้องมีเสมอ แม้ไม่มีปัญหา');
  assert.deepEqual(r.views, { AAA: 2, BBB: 1 });
});

test('ตัวควบคุมลบ: อ่านได้แต่ยังไม่มีใครดูจริง ⇒ unknown:false และ {} (ว่างจริงยังว่างได้)', async () => {
  reset({ มีคนดู: false });
  const r = await readViews();
  assert.equal(r.unknown, false, '0 เพราะไม่มีคนดู ห้ามถูกรายงานว่าอ่านไม่ได้');
  assert.deepEqual(r.views, {});
});

/* ───────── readWatch — หลังร้าน สามช่องพังแยกกันได้ ───────── */

test('B10 อ่าน q/ ไม่ได้ช่องเดียว: unreadable บอกเฉพาะ half · อีกสองช่องยังได้ของจริง', async () => {
  reset();
  state.failList = ['q/'];
  const w = await readWatch();
  assert.deepEqual(w.unreadable, ['half'], 'ต้องบอกเป็นรายช่อง ไม่ใช่ธงเดียวรวม ๆ');
  assert.deepEqual(w.views, { AAA: 2, BBB: 1 });
  assert.deepEqual(w.full, {});
});

test('ตัวควบคุมลบ: อ่านได้ครบ ⇒ unreadable เป็น [] (**ต้องมีช่องนี้** แม้ว่าง)', async () => {
  reset();
  const w = await readWatch();
  assert.ok(Array.isArray(w.unreadable), 'ไม่มีช่อง ≠ ไม่มีปัญหา — จอจะแยกท่อรุ่นเก่าไม่ออก');
  assert.deepEqual(w.unreadable, []);
});

/* ───────── /api/clip-stats — ธงต้องถึงจอในเนื้อ JSON ───────── */

test('B10 list ล้มทั้งสามช่อง: ยังตอบ 200 แต่ต้องบอก unreadable ครบสาม', async () => {
  reset();
  state.failList = ['w/', 'q/', 'f/'];
  const r = await เรียก();
  assert.equal(r.status, 200, 'เส้นนี้ตั้งใจเสิร์ฟต่อ — จอจึงพึ่ง r.ok ไม่ได้');
  const d = await r.json();
  assert.deepEqual(d.rows.length, 1, 'ยังเหลือแถวจาก counts ที่อ่านได้');
  assert.deepEqual([...d.unreadable].sort(), ['full', 'half', 'views']);
});

test('B10 อ่าน counts ไม่ได้: countsUnknown:true (ยอดหัวใจ 0 ห้ามดูเหมือนไม่มีใครกด)', async () => {
  reset();
  state.failGet = 'counts';
  const r = await เรียก();
  const d = await r.json();
  assert.equal(d.countsUnknown, true);
  assert.deepEqual(d.unreadable, [], 'ช่องวิวอ่านได้ ⇒ ต้องไม่ถูกรายงานว่าอ่านไม่ได้');
});

test('ตัวควบคุมลบ: ทุกอย่างอ่านได้ ⇒ ธงครบและเป็นค่าปกติ + ยอดถูก', async () => {
  reset();
  const r = await เรียก();
  const d = await r.json();
  assert.equal(d.countsUnknown, false, 'ช่อง countsUnknown ต้องมีเสมอ');
  assert.deepEqual(d.unreadable, []);
  const AAA = d.rows.find((x) => x.id === 'AAA');
  assert.deepEqual([AAA.views, AAA.half, AAA.likes, AAA.comments], [2, 1, 5, 2]);
});

test('ตัวควบคุมลบ: ไม่มีใครดูคลิปเลยจริง ⇒ rows ว่าง แต่ธงบอกว่าอ่านได้ครบ', async () => {
  reset({ มีคนดู: false });
  const r = await เรียก();
  const d = await r.json();
  assert.deepEqual(d.rows, []);
  assert.deepEqual(d.unreadable, [], 'ว่างเพราะไม่มีของ ต้องแยกจากว่างเพราะอ่านไม่ได้');
  assert.equal(d.countsUnknown, false);
});


/* ───────────────────────────────────────────────────────────────────────────
   🔑 **ข้อที่ใช้พิสูจน์ว่าแยกแยะได้จริง — อ่านได้ทั้งโค้ดเดิมและตัวแก้**
   ข้ออื่นข้างบนตรวจ "สัญญารูปแบบใหม่" (ช่อง unknown/unreadable) ⇒ โค้ดเดิม
   ตกทุกข้อเพราะ **ยังไม่มีช่องนั้น** ซึ่งบอกได้แค่ว่า "สัญญาเปลี่ยน" ไม่ใช่ว่า
   พฤติกรรมเดิมผิด · ข้อนี้จึงไม่แตะชื่อช่องเลย แต่ถามคำถามของบั๊กตรง ๆ:

     "คนอ่านคำตอบ แยก **ว่างเพราะอ่านไม่ได้** ออกจาก **ว่างเพราะไม่มีใครดู** ได้ไหม"

   โค้ดเดิมตอบสองสถานการณ์นี้ด้วย JSON ที่ **เหมือนกันทุกตัวอักษร** ⇒ แยกไม่ได้ = บั๊ก
   ตัวแก้ต้องตอบต่างกัน · ข้อนี้รันได้ทั้งสองรุ่น จึงเป็นหลักฐานที่ใช้เทียบได้จริง
   ─────────────────────────────────────────────────────────────────────────── */
test('🔑 แยกแยะได้: "ว่างเพราะอ่านไม่ได้" ต้องไม่ตอบเหมือน "ว่างเพราะไม่มีใครดู"', async () => {
  // สถานการณ์ A — มีคนดูอยู่จริง แต่ที่เก็บข้อมูลอ่านรายชื่อคีย์ไม่ได้
  reset();
  state.failList = ['w/', 'q/', 'f/'];
  state.failGet = 'counts';
  const A = await (await เรียก()).text();

  // สถานการณ์ B — ที่เก็บข้อมูลปกติดี แต่ยังไม่มีใครดูคลิปเลยจริง ๆ
  reset({ มีคนดู: false });
  const B = await (await เรียก()).text();

  assert.notEqual(
    A, B,
    'ทั้งสองสถานการณ์ตอบ JSON เหมือนกันทุกตัวอักษร ⇒ จอแยกไม่ได้ ⇒ '
    + 'มันจะเขียนว่า "ยังไม่มีคลิปที่มีคนดู" ตอนที่ความจริงคือ "อ่านไม่ได้"\n'
    + `    ทั้งสองได้: ${A}`,
  );
});
