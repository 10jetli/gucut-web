/* ด่าน B16 ขาอ่าน (ใบ t_mv4qh1r3) — ทางเขียนแก้ไปแล้ว 14 ก.ย.
 * 🔴 ที่เหลือคืออาการในใบงาน: "หัวใจและความคิดเห็นเดิมหาย · GET ส่งกองว่างเหมือนยังไม่มี"
 * 🔑 และที่หนักกว่าตัวกลืนคือ **หัวแคช**: เส้นนี้ตอบพร้อม s-maxage=60 + stale-while-revalidate=300
 *    ⇒ สะดุดครั้งเดียวถูกแจกต่อให้ลูกค้าทุกคนนาน 5 นาที (คลาสเดียวกับ clip-shop B01)
 * 📌 ตอนแก้ B10 ใส่ธงให้ views แล้ว แต่ counts ที่อยู่ใน Promise.all บรรทัดเดียวกันไม่ได้ธง
 */
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const data = new Map();
let failKey = null;
const fakeStore = {
  get: async (k) => { if (failKey && k === failKey) throw new Error('blobs ล่มจำลอง'); return data.has(k) ? data.get(k) : null; },
  setJSON: async (k, v) => data.set(k, v),
  delete: async (k) => { data.delete(k); },
  list: async () => ({ blobs: [] }),
};
const reset = () => { data.clear(); failKey = null; };
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('../../netlify/lib/admin-gate.mjs', { namedExports: { adminGate: async () => ({ ok: true }) } });
/* 🔑 mock ทับ **ทั้งโมดูล** ⇒ export ที่ลืมเติมจะกลายเป็น 'does not provide an export named'
   ⇒ เทสล้มเสียงดัง ซึ่งเป็นข่าวดี (ถ้ามันเงียบ เราจะทดสอบของที่ไม่ใช่ของจริง)
   📏 social.mjs import { addView, readViews } ⇒ ต้องมีครบทั้งคู่ */
mock.module('../../netlify/lib/views.mjs', { namedExports: {
  addView: async () => {},
  readViews: async () => ({ views: { c1: 9 }, unknown: false }),
} });
const { default: social } = await import('../../netlify/functions/social.mjs');
const getรวม = () => new Request('https://x/api/social', { method: 'GET' });
const getคอม = (id) => new Request(`https://x/api/social?id=${id}`, { method: 'GET' });

test('🔴 อ่าน counts ไม่ได้ ⇒ ต้องมีธง countsUnknown และ **ห้ามแคช**', async () => {
  reset();
  data.set('counts', { c1: [12, 3] });
  failKey = 'counts';
  const r = await social(getรวม(), {});
  assert.equal(r.status, 200, 'ฟีดลูกค้าต้องขึ้นได้ ⇒ ไม่โยน');
  const b = await r.json();
  assert.equal(b.countsUnknown, true, '🔑 ต้องบอกว่าไม่รู้ ไม่ใช่ส่ง {} เฉย ๆ');
  const cc = r.headers.get('cache-control') || '';
  assert.match(cc, /no-store/, `ห้ามแคชความไม่รู้ (ได้: ${cc})`);
  assert.ok(!/s-maxage|stale-while-revalidate/.test(cc), 'ห้ามมีหัวแคชที่ขอบติดมากับความไม่รู้');
});

test('ตัวควบคุมลบ: อ่านได้ (แม้ว่าง) ⇒ countsUnknown false และ **แคชได้ตามเดิม**', async () => {
  reset();
  const r = await social(getรวม(), {});
  const b = await r.json();
  assert.equal(b.countsUnknown, false, 'อ่านได้แต่ไม่มีคีย์ = ยังไม่มีใครกดหัวใจจริง');
  assert.deepEqual(b.counts, {});
  assert.match(r.headers.get('cache-control') || '', /s-maxage=60/, 'ของจริงที่ว่าง ต้องยังแคชได้ (ฟีดต้องเร็ว)');

  reset();
  data.set('counts', { c1: [12, 3] });
  const r2 = await social(getรวม(), {});
  assert.deepEqual((await r2.json()).counts, { c1: [12, 3] });
});

test('🔴 อ่านคอมเมนต์ของคลิปไม่ได้ ⇒ ธง commentsUnknown + ห้ามแคช', async () => {
  reset();
  data.set('cmt/c1', [{ name: 'ก', text: 'ดีมาก', at: 1 }]);
  failKey = 'cmt/c1';
  const r = await social(getคอม('c1'), {});
  const b = await r.json();
  assert.equal(b.commentsUnknown, true, 'ไม่งั้นใต้คลิปขึ้นว่า "ยังไม่มีความคิดเห็น" ทั้งที่มีอยู่');
  assert.match(r.headers.get('cache-control') || '', /no-store/);

  reset();
  data.set('cmt/c1', [{ name: 'ก', text: 'ดีมาก', at: 1 }]);
  const ดี = await social(getคอม('c1'), {});
  const b2 = await ดี.json();
  assert.equal(b2.commentsUnknown, false, 'ส่งธงทุกครั้งแม้ false — จอแยก "ท่อยังไม่ส่ง" ออกจาก "ส่งแล้วเป็นเท็จ" ได้');
  assert.equal(b2.comments.length, 1);
  assert.match(ดี.headers.get('cache-control') || '', /s-maxage=15/);
});
