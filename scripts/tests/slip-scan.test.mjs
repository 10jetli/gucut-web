// รัน: node --test scripts/tests/slip-scan.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu2sow9d — ตัวไล่ดึงสลิปใหม่: ตำแหน่งเดินหน้าถูก · ไม่ข้ามใบที่ยังไม่ได้ทำ · เลขผิดรูปไม่ทำให้วนติด
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slipScanStep } from '../../netlify/lib/slip-scan.mjs';

function fakeDb(rows, { failMeta = false } = {}) {
  const db = { meta: null };
  db.q = async (sql, params = []) => {
    if (/SELECT v FROM core_meta/.test(sql)) { if (failMeta) throw new Error('D1 500'); return db.meta === null ? [] : [{ v: db.meta }]; }
    if (/INSERT INTO core_meta/.test(sql)) { db.meta = params[1]; return []; }
    if (/FROM orders/.test(sql)) return rows;
    return [];
  };
  return db;
}
const R = (n, day = '2026-09-15') => ({ number: n, order_date: day });

test('เดินหน้าทีละชุด แล้ววนกลับต้นเมื่อหมด', async () => {
  const rows = Array.from({ length: 10 }, (_, i) => R(`SO-${String(i).padStart(2, '0')}`));
  const db = fakeDb(rows); const sent = [];
  const archiveSlips = async ({ docnos }) => { sent.push(docnos); return { ok: true, notStarted: [], totals: { stored: 1, errors: 0, bad: 0 } }; };
  const a = await slipScanStep({ coreQuery: db.q, archiveSlips });
  assert.equal(sent[0].length, 8); assert.equal(a.cursor.number, 'SO-07'); assert.equal(a.scanned, 8);
  await slipScanStep({ coreQuery: db.q, archiveSlips });
  assert.deepEqual(sent[1], ['SO-08', 'SO-09']);
  const c = await slipScanStep({ coreQuery: db.q, archiveSlips });
  assert.equal(c.wrapped, true); assert.equal(sent.length, 2, 'รอบวนกลับไม่ยิง ZORT'); assert.equal(db.meta, '');
  await slipScanStep({ coreQuery: db.q, archiveSlips });
  assert.equal(sent[2][0], 'SO-00', 'หลังวนกลับเริ่มต้นใหม่');
});

test('ใบที่ไม่ได้เริ่มเพราะหมดเวลา ห้ามเลื่อนตำแหน่งข้าม', async () => {
  const rows = Array.from({ length: 8 }, (_, i) => R(`SO-${i}`));
  const db = fakeDb(rows);
  const archiveSlips = async () => ({ ok: true, notStarted: ['SO-5', 'SO-6', 'SO-7'], totals: { stored: 0, errors: 0, bad: 0 } });
  const r = await slipScanStep({ coreQuery: db.q, archiveSlips });
  assert.equal(r.cursor.number, 'SO-4'); assert.equal(r.scanned, 5);
});

test('เลขที่ใบผิดรูปไม่ถูกส่ง · ตำแหน่งเลื่อนข้ามไป ไม่วนติด', async () => {
  const rows = [R('SO-1'), R('เลข ผิด'), R('SO-3')];
  const db = fakeDb(rows); let sent = null;
  const archiveSlips = async ({ docnos }) => { sent = docnos; return { ok: true, notStarted: [], totals: { stored: 0, errors: 0, bad: 0 } }; };
  const r = await slipScanStep({ coreQuery: db.q, archiveSlips });
  assert.deepEqual(sent, ['SO-1', 'SO-3']); assert.equal(r.skippedBad, 1); assert.equal(r.cursor.number, 'SO-3');
});

test('อ่านตำแหน่งไม่ได้ = โยน · ตัวเก็บล้มทั้งชุด = ไม่เลื่อนตำแหน่ง', async () => {
  const rows = [R('SO-1')];
  await assert.rejects(slipScanStep({ coreQuery: fakeDb(rows, { failMeta: true }).q, archiveSlips: async () => ({ ok: true }) }));
  const db = fakeDb(rows);
  const r = await slipScanStep({ coreQuery: db.q, archiveSlips: async () => ({ ok: false, error: 'boom' }) });
  assert.equal(r.ok, false); assert.equal(db.meta, null, 'ไม่เขียนตำแหน่ง');
});
