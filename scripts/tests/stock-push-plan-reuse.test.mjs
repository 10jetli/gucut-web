// รัน: node --experimental-test-module-mocks --test scripts/tests/stock-push-plan-reuse.test.mjs
// 17 ก.ย. 2569 · gucut2 — กวาดยิงจริง 31.5 วิ ⇒ HTTP 500 ตอน 25.4 วิ ทั้งที่ยิงสำเร็จ 21/21
// ครึ่งหนึ่งของเวลาคือคิดแผนสองรอบ ⇒ ตัวกวาดส่งแผนที่เพิ่งคิดให้ตัวยิงใช้ซ้ำ
// 🔴 สิ่งที่เฝ้า: ① แผนสด (≤60 วิ) ใช้ซ้ำ ไม่คิดใหม่ ② แผนเก่า/รูปไม่ครบ ⇒ คิดใหม่สด + บอกเหตุ
//    ③ เส้น HTTP ส่งแผนเข้ามาไม่ได้ (เรียกด้วย body อย่างเดียว) ④ ด่านทิศลงยังทำงานกับแผนที่ใช้ซ้ำ
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

let คิดแผน = 0;
const แผน = () => ({ lazada: {
  wouldPush: 2,
  push: [{ sku: 'UP1', from: 1, to: 5, kind: 'up' }, { sku: 'DN1', from: 9, to: 3, kind: 'down' }],
} });
mock.module('../../netlify/lib/stock-push.mjs', { namedExports: {
  stockPushDryRun: async () => { คิดแผน += 1; return แผน(); },
} });
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({ get: async () => null, setJSON: async () => {} }) } });

const { stockPushLive, แผนใช้ซ้ำได้ไม่เกิน_ms } = await import('../../netlify/lib/stock-push-live.mjs');
const body = { platform: 'lazada', skus: ['UP1', 'DN1'], dryCheck: true };

test('แผนที่ตัวกวาดเพิ่งคิด ⇒ ใช้ซ้ำ ไม่คิดแผนรอบสอง', async () => {
  คิดแผน = 0;
  const r = await stockPushLive(body, { แผนที่คิดแล้ว: { plan: แผน(), คิดเมื่อ: Date.now() - 3000 } });
  assert.equal(คิดแผน, 0, 'ต้องไม่เรียก stockPushDryRun ซ้ำ');
  assert.equal(r.planSource, 'ตัวกวาดคิดในคำขอเดียวกัน');
  assert.ok(r.planAgeMs >= 3000 && r.planAgeMs < 10000);
  // ④ ด่านทิศลงยังอยู่: DN1 ต้องไม่ถูกยิงถ้าไม่มี allowClose
  assert.equal(r.wouldFire, 1);
  assert.equal(r.wouldSkip, 1);
});

test('แผนเก่าเกินเพดาน ⇒ คิดใหม่สด และบอกว่าทำไมไม่ใช้ของที่ส่งมา', async () => {
  คิดแผน = 0;
  const r = await stockPushLive(body, { แผนที่คิดแล้ว: { plan: แผน(), คิดเมื่อ: Date.now() - แผนใช้ซ้ำได้ไม่เกิน_ms - 1000 } });
  assert.equal(คิดแผน, 1);
  assert.equal(r.planSource, 'คิดสดในตัวยิง');
  assert.match(r.planReuseRejected, /คิดใหม่/);
});

test('แผนรูปไม่ครบ / เวลาจากอนาคต / ไม่ได้ส่ง ⇒ คิดใหม่สดทุกกรณี', async () => {
  for (const opts of [
    { แผนที่คิดแล้ว: { plan: {}, คิดเมื่อ: Date.now() } },
    { แผนที่คิดแล้ว: { plan: แผน(), คิดเมื่อ: Date.now() + 60_000 } },
    { แผนที่คิดแล้ว: { plan: แผน(), คิดเมื่อ: 'abc' } },
    undefined,
  ]) {
    คิดแผน = 0;
    const r = await stockPushLive(body, opts);
    assert.equal(คิดแผน, 1, JSON.stringify(opts)?.slice(0, 60));
    assert.equal(r.planSource, 'คิดสดในตัวยิง');
  }
});

test('เส้น HTTP เรียกตัวยิงด้วย body อย่างเดียว — ยัดแผนจากข้างนอกไม่ได้', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const calls = [...src.matchAll(/stockPushLive\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.ok(calls.length >= 1);
  for (const a of calls) assert.equal(a, 'body', `core.mjs ต้องเรียก stockPushLive(body) เท่านั้น ได้ (${a})`);
});
