// รัน: node --test scripts/tests/slip-archive.test.mjs
// 15 ก.ย. 2569 · งานกระดาน t_mu1y49yb — เก็บสลิปจาก ZORT ลงถังปิด (ZORT ปลอม · ที่เก็บในหน่วยความจำ)
// 🔴 สิ่งที่เฝ้า: เก็บเฉพาะตัวไฟล์จริง (html ไม่เก็บ) · ของที่เก็บแล้วไม่ดึงซ้ำ · อ่าน ZORT/ที่เก็บไม่ได้ = ไม่ครบ ·
//    ตัวไฟล์ไม่หลุดในคำตอบ · เพดานเวลาส่งใบที่เหลือกลับ · สรุปอ่านไม่ได้ = unknown ไม่ใช่ 0
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 9)]);
const HTML = Buffer.from('<!DOCTYPE html><html>login</html>');
let zort = {};        // docno -> { files: [{id, content: Buffer}] } | 'throw'
let calls = [];
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  calls.push(u.pathname + u.search);
  const docno = u.searchParams.get('number');
  const entry = zort[docno];
  if (entry === 'throw') throw new Error('timeout');
  const body = u.pathname.endsWith('GetOrderFiles')
    ? (entry?.files ?? []).map((f) => ({ id: f.id, fileName: `${f.id}.png`, type: 'PNG' }))
    : (() => {
        const f = (entry?.files ?? []).find((x) => String(x.id) === u.searchParams.get('fileid'));
        return f ? { id: f.id, fileName: `${f.id}.png`, type: 'PNG', content: f.content.toString('base64'), uploadType: 1 } : { res: { resCode: '100', resDesc: 'Not found' } };
      })();
  return { status: 200, text: async () => JSON.stringify(body) };
};

function memStore({ failList = false, failSet = false, failMeta = false } = {}) {
  const m = new Map();
  return {
    m,
    getMetadata: async (k) => { if (failMeta) throw new Error('blob down'); return m.has(k) ? { metadata: m.get(k).metadata } : null; },
    set: async (k, v, o) => { if (failSet) throw new Error('blob down'); m.set(k, { bytes: v.byteLength, metadata: o?.metadata }); },
    list: async ({ prefix } = {}) => { if (failList) throw new Error('blob down'); return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix ?? '')).map((key) => ({ key })) }; },
  };
}

const { archiveSlips, slipArchiveSummary, SLIP_BATCH_MAX } = await import('../../netlify/lib/slip-archive.mjs');

test('เก็บตัวไฟล์จริงลงคีย์รายไฟล์ + metadata · ตัวไฟล์ไม่หลุดในคำตอบ · ครบ = complete', async () => {
  zort = { 'SO-1': { files: [{ id: 5, content: JPEG }, { id: 6, content: JPEG }] } }; calls = [];
  const store = memStore();
  const r = await archiveSlips({ docnos: ['SO-1'], store });
  assert.equal(r.ok, true);
  assert.equal(r.complete, true);
  assert.deepEqual(r.totals, { orders: 1, zortFiles: 2, stored: 2, already: 0, bad: 0, errors: 0, notStarted: 0 });
  assert.ok(store.m.has('f/SO-1/5') && store.m.has('f/SO-1/6'));
  const meta = store.m.get('f/SO-1/5').metadata;
  assert.equal(meta.kind, 'jpeg', 'ชนิดจากไบต์ ไม่ใช่ type PNG ที่ ZORT บอก');
  assert.equal(meta.bytes, String(JPEG.length));
  assert.match(meta.sha256, /^[0-9a-f]{64}$/);
  assert.equal(store.m.get('f/SO-1/5').bytes, JPEG.length);
  assert.ok(!JSON.stringify(r).includes(JPEG.toString('base64').slice(0, 30)), 'ห้ามคืนตัวไฟล์');
});

test('ยิงซ้ำ ⇒ ของที่เก็บแล้วไม่ดึงรายละเอียดซ้ำ (already) และยังนับว่าครบ', async () => {
  zort = { 'SO-1': { files: [{ id: 5, content: JPEG }] } };
  const store = memStore();
  await archiveSlips({ docnos: ['SO-1'], store });
  calls = [];
  const r = await archiveSlips({ docnos: ['SO-1'], store });
  assert.equal(r.totals.already, 1);
  assert.equal(r.totals.stored, 0);
  assert.equal(calls.filter((c) => c.includes('GetOrderFileDetail')).length, 0, 'ห้ามดึงไฟล์ที่เก็บแล้วซ้ำ');
  assert.equal(r.complete, true);
});

test('ได้หน้า HTML แทนไฟล์ ⇒ ไม่เก็บ · อยู่ใน bad · ไม่ครบ', async () => {
  zort = { 'SO-2': { files: [{ id: 7, content: HTML }] } };
  const store = memStore();
  const r = await archiveSlips({ docnos: ['SO-2'], store });
  assert.equal(store.m.size, 0);
  assert.deepEqual(r.orders[0].bad, [{ fileid: 7, kind: 'html', bytes: HTML.length }]);
  assert.equal(r.complete, false);
});

test('อ่านรายการไฟล์จาก ZORT ไม่ได้ ⇒ ไม่เก็บอะไร · error ระบุ unknown · ไม่ครบ', async () => {
  zort = { 'SO-3': 'throw' };
  const store = memStore();
  const r = await archiveSlips({ docnos: ['SO-3'], store });
  assert.equal(store.m.size, 0);
  assert.equal(r.orders[0].zortFiles, null);
  assert.equal(r.orders[0].errors[0].unknown, true);
  assert.equal(r.complete, false);
});

test('ไฟล์ที่ ZORT ไม่ส่งรายละเอียด (resCode 100) ⇒ error ไม่ครบ', async () => {
  zort = { 'SO-4': { files: [{ id: 8, content: JPEG }] } };
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('GetOrderFileDetail')
    ? { status: 200, text: async () => JSON.stringify({ res: { resCode: '100', resDesc: 'Access Denied.' } }) }
    : orig(url);
  const r = await archiveSlips({ docnos: ['SO-4'], store: memStore() });
  globalThis.fetch = orig;
  assert.equal(r.orders[0].errors[0].stage, 'detail');
  assert.equal(r.complete, false);
});

test('ที่เก็บเขียนไม่ได้ / ตรวจของเดิมไม่ได้ ⇒ ไม่นับว่าเก็บแล้ว · ไม่ครบ', async () => {
  zort = { 'SO-5': { files: [{ id: 9, content: JPEG }] } };
  const a = await archiveSlips({ docnos: ['SO-5'], store: memStore({ failSet: true }) });
  assert.equal(a.totals.stored, 0);
  assert.equal(a.orders[0].errors[0].stage, 'store');
  assert.equal(a.complete, false);
  calls = [];
  const b = await archiveSlips({ docnos: ['SO-5'], store: memStore({ failMeta: true }) });
  assert.equal(b.orders[0].errors[0].stage, 'check');
  assert.equal(calls.filter((c) => c.includes('GetOrderFileDetail')).length, 0, 'ตรวจของเดิมไม่ได้ ห้ามดึงต่อ');
  assert.equal(b.complete, false);
});

test('ข้อมูลเข้าผิด ⇒ ตีกลับไม่ยิง ZORT', async () => {
  calls = [];
  assert.match((await archiveSlips({ docnos: [] })).error, /docnos/);
  assert.match((await archiveSlips({ docnos: Array.from({ length: SLIP_BATCH_MAX + 1 }, (_, i) => `SO-${i}`) })).error, /ไม่เกิน/);
  assert.match((await archiveSlips({ docnos: ['SO 1'] })).error, /รูปแบบ/);
  assert.equal(calls.length, 0);
});

test('เลยเพดานเวลา ⇒ ใบที่เหลือไป notStarted และไม่ครบ', async () => {
  zort = { 'SO-6': { files: [{ id: 1, content: JPEG }] }, 'SO-7': { files: [{ id: 2, content: JPEG }] } };
  let t = 0;
  const r = await archiveSlips({ docnos: ['SO-6', 'SO-7'], store: memStore(), deadlineMs: 1000, now: () => (t += 800) });
  assert.deepEqual(r.notStarted, ['SO-7']);
  assert.equal(r.totals.stored, 1);
  assert.equal(r.complete, false);
});

test('สรุป: นับไฟล์/ใบจากคีย์ · เทียบ expected · อ่านรายการไม่ได้ = unknown ไม่ใช่ 0', async () => {
  zort = { 'SO-8': { files: [{ id: 1, content: JPEG }, { id: 2, content: JPEG }] }, 'SO-9': { files: [{ id: 3, content: JPEG }] } };
  const store = memStore();
  await archiveSlips({ docnos: ['SO-8', 'SO-9'], store });
  const s = await slipArchiveSummary({ store, expectedFiles: '3' });
  assert.equal(s.files, 3);
  assert.equal(s.orders, 2);
  assert.deepEqual(s.byOrder, { 'SO-8': 2, 'SO-9': 1 });
  assert.equal(s.complete, true);
  assert.equal((await slipArchiveSummary({ store, expectedFiles: '381' })).complete, false);
  assert.equal((await slipArchiveSummary({ store })).complete, null);
  const bad = await slipArchiveSummary({ store: memStore({ failList: true }) });
  assert.equal(bad.ok, false);
  assert.equal(bad.unknown, true);
  assert.equal(bad.files, undefined, 'อ่านไม่ได้ ห้ามคืน files: 0');
});
