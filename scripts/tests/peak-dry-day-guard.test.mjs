// รัน: node --test scripts/tests/peak-dry-day-guard.test.mjs
// 15 ก.ย. 2569 — ?peak=dry&day= ต้องตีกลับวันที่ไม่มีจริง (เดิมได้ 0 ใบ + 200 = เหมือนวันนั้นไม่มีขาย) + บอกเมื่อชนเพดาน 200 ใบ
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isRealDay } from '../../netlify/lib/param-guard.mjs';

const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
const a = src.indexOf('if (mode === "dry") {');
const blk = src.slice(a, src.indexOf('peak รับได้เฉพาะ status หรือ dry', a));

test('isRealDay ใช้แยกวันจริงได้', () => {
  assert.equal(isRealDay('2026-09-14'), true);
  assert.equal(isRealDay('2026-13-45'), false);
  assert.equal(isRealDay('2026-02-30'), false);
});

test('peak dry ตรวจ day ก่อนคิวรี · ตอบ 400', () => {
  const guard = blk.indexOf('if (!isRealDay(day)) return json({ error:');
  assert.ok(guard > 0, 'ต้องมีด่าน isRealDay');
  assert.ok(guard < blk.indexOf('const orders = await coreQuery('), 'ด่านต้องมาก่อนคิวรี');
  assert.match(blk.slice(guard, guard + 200), /\}, 400\);/);
});

test('peak dry บอก truncated เมื่อชนเพดานคิวรี', () => {
  const lim = blk.match(/LIMIT (\d+)`/);
  assert.ok(lim, 'คิวรีต้องมี LIMIT');
  assert.match(blk, new RegExp(`truncated: orders\\.length >= ${lim[1]},`));
});
