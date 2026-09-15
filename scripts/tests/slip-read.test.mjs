// รัน: node --test scripts/tests/slip-read.test.mjs
// 15 ก.ย. 2569 — อ่านสลิปของใบเดียวให้จอรายละเอียดใบขาย (?slips= · ?slip=&fileid=)
// 🔴 สิ่งที่เฝ้า: รายการไม่ลากใบอื่นที่เลขขึ้นต้นเหมือนกัน (SO-1 กับ SO-10) · content-type มาจาก kind ที่ตรวจจากไบต์
//    ไม่ใช่ type ที่ ZORT บอก · อ่านที่เก็บไม่ได้ = unknown ไม่ใช่ "ไม่มีสลิป" · เส้นใน core.mjs เป็น GET และติดหัวกันแคช
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const { listOrderSlips, readOrderSlip } = await import('../../netlify/lib/slip-archive.mjs');

function memStore({ failList = false, failGet = false } = {}) {
  const m = new Map();
  const put = (docno, fileid, kind, type = 'PNG') => m.set(`f/${encodeURIComponent(docno)}/${fileid}`,
    { buf: new Uint8Array([1, 2, 3, 4]).buffer, metadata: { docno, fileid: String(fileid), kind, type, bytes: '4', at: '2026-09-15T01:05:00.000Z' } });
  return {
    put,
    list: async ({ prefix } = {}) => { if (failList) throw new Error('down'); return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix ?? '')).map((key) => ({ key })) }; },
    getMetadata: async (k) => { if (failGet) throw new Error('down'); return m.has(k) ? { metadata: m.get(k).metadata } : null; },
    get: async (k) => { if (failGet) throw new Error('down'); return m.get(k)?.buf ?? null; },
  };
}

test('รายการของใบเดียว — SO-1 ไม่ลากไฟล์ของ SO-10 มา · ติดวันที่เก็บ', async () => {
  const s = memStore(); s.put('SO-1', 5, 'jpeg'); s.put('SO-1', 6, 'png'); s.put('SO-10', 7, 'jpeg');
  const r = await listOrderSlips({ docno: 'SO-1', store: s });
  assert.equal(r.ok, true);
  assert.deepEqual(r.files.map((f) => f.fileid).sort(), ['5', '6']);
  assert.equal(r.files[0].archivedAt, '2026-09-15T01:05:00.000Z');
  assert.equal('fileName' in r.files[0], false, 'ห้ามส่งชื่อไฟล์จาก ZORT (อาจมีชื่อลูกค้า)');
});

test('เลขที่ใบเพี้ยน = 400 · อ่านที่เก็บไม่ได้ = unknown ห้ามได้รายการว่าง', async () => {
  assert.equal((await listOrderSlips({ docno: '../x', store: memStore() })).ok, false);
  const r = await listOrderSlips({ docno: 'SO-1', store: memStore({ failList: true }) });
  assert.equal(r.ok, false); assert.equal(r.unknown, true); assert.equal(r.files, undefined);
});

test('ตัวไฟล์ — content-type จาก kind ไม่ใช่ type · ไม่พบ 404 · kind นอกรายการ 415 · fileid เพี้ยน 400 · ที่เก็บล้ม 502', async () => {
  const s = memStore(); s.put('SO-1', 5, 'jpeg', 'PNG'); s.put('SO-1', 8, 'html');
  const ok = await readOrderSlip({ docno: 'SO-1', fileid: '5', store: s });
  assert.equal(ok.ok, true); assert.equal(ok.contentType, 'image/jpeg'); assert.equal(ok.buf.byteLength, 4);
  assert.equal((await readOrderSlip({ docno: 'SO-1', fileid: '9', store: s })).status, 404);
  assert.equal((await readOrderSlip({ docno: 'SO-1', fileid: '8', store: s })).status, 415);
  assert.equal((await readOrderSlip({ docno: 'SO-1', fileid: 'abc', store: s })).status, 400);
  assert.equal((await readOrderSlip({ docno: 'SO-1', fileid: '5', store: memStore({ failGet: true }) })).status, 502);
});

test('เส้นใน core.mjs — GET เท่านั้น · หัวกันแคช/กันเดาชนิด/x-core-build · ชื่อไฟล์ไม่ใช้ fileName', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const start = src.indexOf('url.searchParams.has("slip")');
  assert.ok(start > 0, 'หาเส้น ?slip= ไม่เจอ');
  const block = src.slice(start, src.indexOf('/* GET ?zortfiles=', start));
  assert.match(block, /req\.method !== "GET"/);
  assert.match(block, /"cache-control": "private, no-store"/);
  assert.match(block, /"x-content-type-options": "nosniff"/);
  assert.match(block, /"x-core-build": CORE_BUILD/);
  assert.doesNotMatch(block, /fileName/);
});
