// รัน: node --experimental-test-module-mocks --test scripts/tests/contacts-sync-schedule.test.mjs
// 15 ก.ย. 2569 · งานกระดาน t_mu2045bl — ซิงก์ผู้ติดต่อตามเวลา (D1 ปลอม · ZORT ปลอม)
// 🔴 สิ่งที่เฝ้า: กวาดครบต้องบอกครบในรอบที่ครบจริง · หมดเวลาห้ามบอกครบ · อ่าน cursor ไม่ได้ห้ามเดาหน้า 1 ·
//    หน้าล้ม cursor ชี้หน้าที่ล้ม · จอได้ชีพจรซิงก์ หรือ null เมื่ออ่านไม่ได้
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let meta = new Map();        // k -> {v, at}
let failCursorRead = false;
let failMetaRead = false;
let sqls = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => {
    const s = String(sql); sqls.push({ s, params });
    if (/SELECT v FROM core_meta WHERE k = 'contacts_cursor'/.test(s)) {
      if (failCursorRead) throw new Error('D1 500');
      return meta.has('contacts_cursor') ? [{ v: meta.get('contacts_cursor').v }] : [];
    }
    if (/INSERT INTO core_meta/.test(s)) { meta.set(params[0], { v: params[1], at: '2026-09-15 02:00:00' }); return []; }
    if (/FROM core_meta WHERE k IN/.test(s)) {
      if (failMetaRead) throw new Error('D1 500');
      return [...meta.entries()].map(([k, x]) => ({ k, v: x.v, at: x.at }));
    }
    if (/SELECT COUNT\(\*\) AS c,/.test(s) && /FROM contacts/.test(s)) return [{ c: 5, with_phone: 1, with_email: 1, with_tax: 0 }];
    return [];
  },
} });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';

/* ZORT ปลอม: TOTAL_PAGES หน้า · หน้าเต็ม 200 · หน้าสุดท้ายไม่เต็ม */
let TOTAL_PAGES = 10;
let failPages = new Set();
let fetchedPages = [];
globalThis.fetch = async (url) => {
  const page = Number(new URL(String(url)).searchParams.get('page'));
  fetchedPages.push(page);
  if (failPages.has(page)) return { ok: false, status: 500, json: async () => null };
  const n = page < TOTAL_PAGES ? 200 : page === TOTAL_PAGES ? 37 : 0;
  const list = Array.from({ length: n }, (_, i) => ({ id: `${page}-${i}`, name: `c${page}-${i}`, type: 'Undefined' }));
  return { ok: true, status: 200, json: async () => ({ count: (TOTAL_PAGES - 1) * 200 + 37, list }) };
};

const { syncContacts, syncContactsScheduled, listContacts } = await import('../../netlify/lib/core-contacts.mjs');
const reset = () => { meta = new Map(); failCursorRead = false; failMetaRead = false; failPages = new Set(); fetchedPages = []; sqls = []; TOTAL_PAGES = 10; };

test('syncContacts: หน้าสุดท้ายไม่เต็มตามหลังหน้าเต็มในรอบเดียว ⇒ nextPage null (ครบ) ไม่ใช่เลขหน้าสุดท้าย', async () => {
  reset();
  const r = await syncContacts({ startPage: 9, maxPages: 6 });
  assert.deepEqual(fetchedPages, [9, 10]);
  assert.equal(r.nextPage, null, 'เดิมค้างเป็น 10 ⇒ ผู้เรียกไม่มีวันรู้ว่าครบในรอบนั้น');
  assert.equal(r.fetched, 237);
});

test('syncContacts: หมดเวลาก่อนหน้าแรก ⇒ nextPage ชี้หน้าที่ยังไม่เริ่ม · ไม่ใช่ null', async () => {
  reset();
  const r = await syncContacts({ startPage: 4, maxPages: 3, deadlineAt: 1, now: () => 2 });
  assert.equal(r.nextPage, 4);
  assert.equal(r.stoppedByDeadline, true);
  assert.equal(fetchedPages.length, 0);
});

test('งานตามเวลา: หน้าแรก 1–2 + กวาดต่อจาก cursor · เลื่อน cursor · จดชีพจร recent', async () => {
  reset();
  meta.set('contacts_cursor', { v: '3', at: 'x' });
  const r = await syncContactsScheduled({ now: () => 0 });
  assert.equal(r.ok, true);
  assert.deepEqual(fetchedPages, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(r.sweep.from, 3);
  assert.equal(r.sweep.nextCursor, 9);
  assert.equal(meta.get('contacts_cursor').v, '9');
  assert.ok(meta.has('sync_contacts_recent'));
  assert.equal(meta.has('sync_contacts_full'), false, 'ยังไม่ครบห้ามจดว่ากวาดครบ');
});

test('งานตามเวลา: กวาดถึงหน้าสุดท้าย ⇒ จด sync_contacts_full + cursor กลับหน้า 1', async () => {
  reset();
  meta.set('contacts_cursor', { v: '8', at: 'x' });
  const r = await syncContactsScheduled({ now: () => 0 });
  assert.equal(r.sweep.sweepComplete, true);
  assert.equal(meta.get('contacts_cursor').v, '1');
  assert.equal(meta.get('sync_contacts_full').v, 'complete');
});

test('งานตามเวลา: อ่าน cursor ไม่ได้ ⇒ ข้ามการกวาด ไม่เดาหน้า 1 และไม่เขียน cursor', async () => {
  reset();
  failCursorRead = true;
  const r = await syncContactsScheduled({ now: () => 0 });
  assert.equal(r.ok, false);
  assert.equal(r.errors.at(-1).stage, 'cursor');
  assert.deepEqual(fetchedPages, [1, 2], 'กวาดทั้งฐานต้องไม่เริ่ม');
  assert.equal(meta.has('contacts_cursor'), false);
});

test('งานตามเวลา: หน้าในรอบกวาดล้ม ⇒ cursor ชี้หน้าที่ล้ม · ไม่จดว่าครบ · ok false', async () => {
  reset();
  meta.set('contacts_cursor', { v: '5', at: 'x' });
  failPages = new Set([6]);
  const r = await syncContactsScheduled({ now: () => 0 });
  assert.equal(r.ok, false);
  assert.equal(meta.get('contacts_cursor').v, '6');
  assert.equal(meta.has('sync_contacts_full'), false);
});

test('งานตามเวลา: หน้าแรกล้ม ⇒ ไม่จดชีพจร recent · มี error', async () => {
  reset();
  failPages = new Set([1]);
  const r = await syncContactsScheduled({ now: () => 0 });
  assert.equal(meta.has('sync_contacts_recent'), false);
  assert.equal(r.errors[0].stage, 'recent');
});

test('งานตามเวลา: หมดงบเวลาระหว่างกวาด ⇒ cursor ชี้หน้าที่ยังไม่เริ่ม ไม่จดว่าครบ', async () => {
  reset();
  meta.set('contacts_cursor', { v: '2', at: 'x' });
  let t = 0;
  const r = await syncContactsScheduled({ now: () => (t += 1000), budgetMs: 5500 });
  assert.equal(r.sweep.sweepComplete, false);
  assert.ok(Number(meta.get('contacts_cursor').v) > 2 && Number(meta.get('contacts_cursor').v) < 9);
  assert.equal(meta.has('sync_contacts_full'), false);
});

test('listContacts ส่ง sync ให้จอ · อ่านชีพจรไม่ได้ ⇒ sync null (ไม่รู้)', async () => {
  reset();
  meta.set('sync_contacts_recent', { v: 'ok', at: '2026-09-15 02:19:00' });
  meta.set('contacts_cursor', { v: '12', at: 'x' });
  const a = await listContacts({ limit: 5 });
  assert.deepEqual(a.sync, { recentAtUtc: '2026-09-15 02:19:00', fullSweepAtUtc: null, cursor: 12 });
  failMetaRead = true;
  const b = await listContacts({ limit: 5 });
  assert.equal(b.sync, null);
});
