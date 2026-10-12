/* ด่าน /api/parts-skus — เส้นที่คุณส้มรออยู่ (ใบ t_mv4hthvf ฝั่งจอ · 12 ต.ค. 2569)
 * 🔑 เหตุที่ต้องเป็นเส้นรวม: F440 มี 368 แถว ⇒ ยิงรายชิ้น = ยิง ZORT 368 ครั้งต่อการเปิดหน้าเดียว
 *    ⇒ ค่าโควตาที่ท่านประธานจ่าย ไม่ใช่เรื่องความเร็ว ⇒ เส้นนี้ **ห้ามยิง ZORT รายชิ้น**
 * 🔑 สัญญา: `st`/`price` เป็นตัวเลข = รู้ · `null` = ไม่รู้ ⇒ จอห้ามแปลงเป็น 0 / "สินค้าหมด"
 */
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const data = new Map();
let failKey = null;
const fakeStore = {
  get: async (k) => { if (failKey && k === failKey) throw new Error('blobs ล่มจำลอง'); return data.has(k) ? data.get(k) : null; },
  setJSON: async (k, v) => data.set(k, v),
};
let สต็อก = { map: {}, at: 111, stale: false, partial: false };
let liveพลาด = false;
const reset = () => { data.clear(); failKey = null; liveพลาด = false; สต็อก = { map: {}, at: 111, stale: false, partial: false }; };

mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('../../netlify/lib/zort-stock.mjs', { namedExports: {
  liveStock: async () => { if (liveพลาด) throw new Error('สต็อกอ่านไม่ได้'); return สต็อก; },
} });
mock.module('../../netlify/lib/licensed-stock.mjs', { namedExports: { licensedStock: () => null } });

const ฐานสินค้า = { list: [{ sku: '04382', t: 'โซ่ KINGKONG', h: 'โซ่-kk', img: '/img/a.webp', p: 1250, st: 3 }] };
globalThis.fetch = async () => new Response(JSON.stringify(ฐานสินค้า), { status: 200 });

const { default: partsSkus } = await import('../../netlify/functions/parts-skus.mjs');
const get = (q = 'model=f440') => new Request(`https://x/api/parts-skus?${q}`, { method: 'GET' });
const KEY = 'parts-map/f440';

test('ยังไม่จับคู่เลย ⇒ 200 + items ว่าง (เป็นความจริง แคชได้)', async () => {
  reset();
  const r = await partsSkus(get());
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.deepEqual(b.items, {});
  assert.equal(b.จับคู่แล้ว, 0);
  assert.match(r.headers.get('netlify-cdn-cache-control') || '', /s-maxage/, 'ความจริงที่ว่าง แคชได้');
});

test('🔴 อ่านตารางจับคู่ไม่ได้ ⇒ 503 + items:null + ห้ามแคช', async () => {
  reset();
  data.set(KEY, { '11230201209': '04382' });
  failKey = KEY;
  const r = await partsSkus(get());
  assert.equal(r.status, 503);
  const b = await r.json();
  assert.equal(b.items, null, '🔑 ห้ามส่ง items ว่าง — จอจะเขียนว่า "ยังไม่ได้จับคู่" ทุกแถว');
  assert.equal(b.อ่านไม่ได้, true);
  assert.match(r.headers.get('netlify-cdn-cache-control') || '', /no-store/, 'ห้ามแคช "ไม่รู้"');
});

test('จับคู่แล้ว ⇒ ส่งรูป/ราคา/สต็อก และสต็อกสดชนะค่าที่แช่ไว้', async () => {
  reset();
  data.set(KEY, { '11230201209': '04382' });
  สต็อก = { map: { '04382': [7, 1390] }, at: 222, stale: false, partial: false };
  const b = await (await partsSkus(get())).json();
  assert.deepEqual(b.items['11230201209'],
    { sku: '04382', title: 'โซ่ KINGKONG', price: 1390, image: '/img/a.webp', handle: 'โซ่-kk', st: 7 });
  assert.equal(b.ไม่รู้สต็อก, 0);
  assert.equal(b.สต็อกเก่า, false);
});

test('🔑 สต็อกอ่านไม่ได้ ⇒ st เป็น null **ไม่ใช่ 0** และเส้นไม่ล้ม', async () => {
  reset();
  data.set(KEY, { X: '09999' });        // รหัสที่ไม่มีใน feed-base ด้วย
  liveพลาด = true;
  const r = await partsSkus(get());
  assert.equal(r.status, 200, 'สต็อกอ่านไม่ได้ ห้ามล้มทั้งเส้น — ชื่อ/รูปยังส่งได้');
  const b = await r.json();
  assert.equal(b.items.X.st, null, '🔴 null = ไม่รู้ · 0 = หมดจริง — ยุบกันไม่ได้');
  assert.equal(b.items.X.price, null);
  assert.equal(b.ไม่รู้สต็อก, 1, 'ต้องมีตัวนับบอก');
  assert.equal(b.ไม่พบในคลัง, 1);
});

test('🔑 เกิน 200 คู่ ⇒ ต้องบอกว่าถูกตัด (จอจะได้ไม่นับ items แล้วเข้าใจว่าเท่านั้น)', async () => {
  reset();
  const ใหญ่ = {};
  for (let i = 0; i < 250; i++) ใหญ่[`p${i}`] = '04382';
  data.set(KEY, ใหญ่);
  const b = await (await partsSkus(get())).json();
  assert.equal(b.ส่งมา, 200);
  assert.equal(b.จับคู่แล้ว, 250, 'ต้องบอกจำนวนจริงทั้งหมด');
  assert.equal(b.ตัดที่, 200, 'ต้องบอกว่าตัดที่เท่าไร — ป้ายขอบเขตมาก่อนตัวเลข');
});

test('ไม่ระบุ model ⇒ 400 · POST ⇒ 405 (ตัวควบคุมลบ)', async () => {
  reset();
  assert.equal((await partsSkus(get('x=1'))).status, 400);
  assert.equal((await partsSkus(new Request('https://x/api/parts-skus?model=f440', { method: 'POST' }))).status, 405);
});
