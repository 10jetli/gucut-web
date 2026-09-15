// รัน: node --test scripts/tests/zort-write-store-guard.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu2pekwt — เส้นที่อ่าน/เขียน ZORT ผ่าน zort-write (รหัสร้าน z1 เท่านั้น) ต้องปฏิเสธ store อื่น
// 🔴 สิ่งที่เฝ้า: ด่านอยู่ก่อนเรียกตัวเขียนจริง · ไม่ส่ง store = z1 เหมือนเดิม · ใบร้าน z2 ห้ามไปหา/รับของใน ZORT ร้าน z1
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
const GUARD_Q = 'if (url.searchParams.get("store") && url.searchParams.get("store") !== "z1")';

test('zortpo / zortpoid — ด่าน store อยู่ก่อน import ตัวอ่าน', () => {
  for (const [route, fn] of [['zortpo', 'zortFindPurchaseOrder'], ['zortpoid', 'zortGetPurchaseOrderById']]) {
    const at = src.indexOf(`if (url.searchParams.has("${route}")) {`);
    assert.ok(at > 0, route);
    const body = src.slice(at, src.indexOf(fn, at));
    assert.ok(body.includes(GUARD_Q), `${route} ต้องมีด่าน store ก่อนเรียก ${fn}`);
  }
});

test('ชุดเส้นเขียนที่วนตารางจับคู่ (poreceive ฯลฯ) — ตรวจ body.store ก่อน mod[fnName](body)', () => {
  const loop = src.indexOf('["poreceive", "zortReceivePurchaseOrder"]');
  assert.ok(loop > 0);
  const call = src.indexOf('const r = await mod[fnName](body);', loop);
  const guard = src.indexOf('body.store !== "z1"', loop);
  assert.ok(guard > loop && guard < call, 'ด่าน body.store ต้องอยู่ก่อนเรียกตัวเขียน');
});
