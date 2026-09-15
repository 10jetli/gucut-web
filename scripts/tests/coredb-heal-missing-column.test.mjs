// รัน: node --test scripts/tests/coredb-heal-missing-column.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu2ugvf0 — coreQuery ซ่อมโครงตารางเองเมื่อเจอ "no such column" (เหตุจริง 270f04e · fc52832)
// 🔴 สิ่งที่เฝ้า: ① ซ่อมแล้วลองซ้ำได้ผล ② คำขอพร้อมกันรัน coreInit ครั้งเดียว ③ error อื่นไม่ซ่อม
//    ④ ซ่อมแล้วยังไม่มีคอลัมน์ = โยน ไม่วน ⑤ { heal:false } ไม่ซ่อม
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.CLOUDFLARE_D1_TOKEN = 't';
let hasCol = false;
let alters = 0;
let selects = 0;
let booms = 0;
globalThis.fetch = async (_url, init) => {
  const { sql } = JSON.parse(init.body);
  const ok = (rows = []) => ({ ok: true, status: 200, json: async () => ({ success: true, result: [{ results: rows }] }) });
  const bad = (msg) => ({ ok: false, status: 400, json: async () => ({ success: false, errors: [{ code: 7500, message: msg }] }) });
  if (/ALTER TABLE orders ADD COLUMN tag\b/.test(sql)) { alters++; await new Promise((r) => setTimeout(r, 20)); hasCol = true; return ok(); }
  if (/^\s*(CREATE|ALTER)/i.test(sql)) return ok();
  if (/BOOM/.test(sql)) { booms++; return bad('syntax error near BOOM'); }
  if (/SELECT tag FROM orders/.test(sql)) { selects++; return hasCol ? ok([{ tag: 'VIP' }]) : bad('no such column: tag at offset 7: SQLITE_ERROR'); }
  if (/SELECT nope FROM orders/.test(sql)) return bad('no such column: nope');
  return ok();
};
const { coreQuery } = await import('../../netlify/lib/coredb.mjs');

test('ไม่มีคอลัมน์ ⇒ ซ่อมครั้งเดียวแม้ยิงพร้อมกัน แล้วได้ผล', async () => {
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => coreQuery('SELECT tag FROM orders')));
  for (const r of [a, b, c]) assert.deepEqual(r, [{ tag: 'VIP' }]);
  assert.equal(alters, 1, 'coreInit ต้องรันครั้งเดียว');
  const before = alters;
  assert.deepEqual(await coreQuery('SELECT tag FROM orders'), [{ tag: 'VIP' }]);
  assert.equal(alters, before, 'ทางปกติไม่รัน coreInit ซ้ำ');
});

test('error อื่นไม่ซ่อม · ส่งต่อทันที', async () => {
  const before = alters;
  await assert.rejects(coreQuery('SELECT BOOM'), /syntax error/);
  assert.equal(alters, before);
  assert.equal(booms, 1, 'error อื่นต้องไม่ถูกยิงซ้ำ');
});

test('ซ่อมแล้วยังไม่มีคอลัมน์ = โยนพร้อมบอกเหตุ ไม่วน', async () => {
  await assert.rejects(coreQuery('SELECT nope FROM orders'), /ซ่อมโครงตาราง \(coreInit\) แล้วยังไม่มีคอลัมน์/);
});

test('{ heal:false } ไม่ซ่อม', async () => {
  await assert.rejects(coreQuery('SELECT nope FROM orders', [], { heal: false }), (e) => /no such column: nope/.test(e.message) && !/ซ่อมโครงตาราง/.test(e.message));
});
