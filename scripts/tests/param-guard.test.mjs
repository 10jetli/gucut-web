// รัน: node --test scripts/tests/param-guard.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu2pekwt — ค่าผิดต้อง 400 ไม่ใช่ผลว่างที่หน้าตาเหมือนข้อมูลจริง
// 🔴 สิ่งที่เฝ้า: วันที่เป็นไปไม่ได้ (2026-13-40 · 2026-02-30) · from > to · ตัวเลขที่ไม่ใช่ตัวเลข · ค่าว่าง = ไม่ได้ส่ง ·
//    ด่านอยู่หลังตรวจรหัสและก่อนเส้นแรก
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { isRealDay, badParamError } from '../../netlify/lib/param-guard.mjs';

const sp = (q) => new URLSearchParams(q);

test('วันที่จริงตามปฏิทินเท่านั้น', () => {
  for (const ok of ['2026-09-15', '2024-02-29', '2026-12-31']) assert.equal(isRealDay(ok), true, ok);
  for (const bad of ['2026-13-40', '2026-02-30', '2025-02-29', '2026-9-1', 'abc', '', '2026-09-15T00:00']) assert.equal(isRealDay(bad), false, bad);
});

test('เส้นที่กรองด้วยวันที่: วันเพี้ยน · from > to = error · วันจริง/ค่าว่าง = ผ่าน', () => {
  assert.match(badParamError(sp('list=orders&from=2026-13-40&to=2026-09-14')), /from ต้องเป็นวันที่จริง/);
  assert.match(badParamError(sp('list=orders&from=2026-02-30&to=2026-03-05')), /from ต้องเป็นวันที่จริง/);
  assert.match(badParamError(sp('list=orders&from=2026-09-14&to=2026-09-01')), /ต้องไม่มากกว่า/);
  assert.match(badParamError(sp('list=sales&day=abc')), /day ต้องเป็นวันที่จริง/);
  assert.match(badParamError(sp('list=orderfacets&from=abc')), /from/);
  assert.match(badParamError(sp('list=topproducts&to=2026-13-01')), /to/);
  assert.equal(badParamError(sp('list=orders&from=2026-09-01&to=2026-09-14&limit=5')), null);
  assert.equal(badParamError(sp('list=orders&from=&to=')), null);
  assert.equal(badParamError(sp('list=sales&day=2026-09-14')), null);
  // เส้นอื่นที่ไม่ใช้วันที่กรอง ไม่แตะ day (เครื่องมืออื่นรับรูปแบบอื่นได้)
  assert.equal(badParamError(sp('zortone=1&day=2026-09-15T10:00:00')), null);
});

test('limit · offset · days ต้องเป็นจำนวนเต็ม — ทุกเส้น · ค่าว่าง = ไม่ได้ส่ง', () => {
  assert.match(badParamError(sp('list=stock&limit=abc')), /limit ต้องเป็นจำนวนเต็ม/);
  assert.match(badParamError(sp('list=stock&offset=-1')), /offset/);
  assert.match(badParamError(sp('list=deadstock&days=abc')), /days/);
  assert.match(badParamError(sp('list=stock&limit=5.5')), /limit/);
  assert.equal(badParamError(sp('list=stock&limit=5&offset=0')), null);
  assert.equal(badParamError(sp('list=stock&limit=')), null);
  assert.equal(badParamError(sp('bycustomer=1&days=0&limit=0')), null);
});

test('core.mjs — ด่านอยู่หลังตรวจรหัส และก่อนเส้นแรก · ตอบ 400 ติด x-core-build', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const gate = src.indexOf('if (!gate.ok && !ticket) {');
  const guard = src.indexOf('badParamError(url.searchParams)');
  const firstRoute = src.indexOf('url.searchParams.get("list")');
  assert.ok(gate > 0 && guard > gate, 'ด่านต้องอยู่หลังตรวจรหัส');
  assert.ok(firstRoute > guard, 'ด่านต้องอยู่ก่อนเส้นแรก');
  const block = src.slice(guard, guard + 400);
  assert.match(block, /status: 400/);
  assert.match(block, /"x-core-build": CORE_BUILD/);
});
