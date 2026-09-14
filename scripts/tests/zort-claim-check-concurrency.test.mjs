// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-claim-check-concurrency.test.mjs
// zortclaims ยิงพร้อมกันแบบจำกัดจำนวน (แก้ 14 ก.ย. 2569 — ยิงเรียงกัน 46 ชื่อใช้ 12–14.5 วิ จากเพดาน 26 วิ)
// ⚠️ ไม่ยิงเน็ตจริง: ส่ง probe ปลอมเข้าไปแทน
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('@netlify/blobs', { namedExports: { getStore: () => ({ get: async () => null, setJSON: async () => {} }) } });
globalThis.fetch = async () => { throw new Error('ห้ามยิงเน็ตในเทส'); };
const { zortClaimCheck, mapLimit, PROBE_CONCURRENCY } = await import('../../netlify/lib/zort-claim-check.mjs');
const { ZORT_NO_API, ZORT_CAN_BUT_NOT_BUILT } = await import('../../netlify/lib/zort-write.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('mapLimit: ไม่เกินเพดานพร้อมกัน · ผลเรียงตามลำดับเดิมแม้ตัวหลังเสร็จก่อน', async () => {
  let inFlight = 0; let peak = 0;
  const items = Array.from({ length: 20 }, (_, i) => i);
  const out = await mapLimit(items, 4, async (x) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await sleep(x % 2 ? 5 : 25);
    inFlight--;
    return x * 10;
  });
  assert.deepEqual(out, items.map((x) => x * 10));
  assert.equal(peak, 4);
});

test('zortClaimCheck: ยิงพร้อมกันจริงแต่ไม่เกิน PROBE_CONCURRENCY · เร็วกว่ายิงเรียงชัดเจน', async () => {
  let inFlight = 0; let peak = 0; let calls = 0;
  const fake = async (path) => {
    calls++; inFlight++; peak = Math.max(peak, inFlight);
    await sleep(20);
    inFlight--;
    if (path === 'Product/GetProducts' || path === 'Order/GetOrders') return 'exists';
    return 'missing';
  };
  const t0 = Date.now();
  const r = await zortClaimCheck({ probe: fake });
  const elapsed = Date.now() - t0;
  const jobs = calls - 2;
  assert.ok(jobs > 20, `ต้องยิงชื่อจากทะเบียนจริง (ได้ ${jobs})`);
  assert.ok(peak > 1, 'ต้องยิงพร้อมกันจริง ไม่ใช่เรียงทีละตัว');
  assert.ok(peak <= Math.max(PROBE_CONCURRENCY, 2), `พร้อมกันสูงสุด ${peak} เกินเพดาน ${PROBE_CONCURRENCY}`);
  assert.ok(elapsed < (jobs * 20) / 2, `ใช้ ${elapsed}ms ยังช้าเท่ายิงเรียง (${jobs * 20}ms)`);
  assert.equal(r.ok, false, 'ชื่อใน CAN_BUT_NOT_BUILT ได้ missing ทั้งหมด ⇒ ต้องนับเป็นความสามารถหาย');
});

test('ผลต้องผูกกับแถวที่ถูกต้องหลังยิงพร้อมกัน: exists ในทะเบียน "ไม่มี" · missing ในทะเบียน "มี"', async () => {
  const noApiRow = ZORT_NO_API.find((r) => r.what.startsWith('ตั้งค่ากระจายสินค้า'));
  const target = [...String(noApiRow.probe).matchAll(/\b([A-Z][A-Za-z]+\/[A-Za-z_]+)/g)][2][1];
  const canRow = ZORT_CAN_BUT_NOT_BUILT.find((r) => /BookOrderShipment/.test(r.probe));
  /* ชื่อตัวแรกของแต่ละแถว "มีแต่ยังไม่ทำ" — ดึงด้วย regex เดียวกับตัวตรวจ
     ⚠️ เดิมใช้ probe.startsWith(ชื่อ) ซึ่งผิด: หลายแถวขึ้นต้นด้วยคำอื่นก่อนชื่อเส้น (เช่น "POST …") ⇒ เทสแดงเอง */
  const canFirst = new Set(ZORT_CAN_BUT_NOT_BUILT
    .map((r) => [...String(r.probe).matchAll(/\b([A-Z][A-Za-z]+\/[A-Za-z_]+)/g)][0]?.[1]).filter(Boolean));
  const fake = async (path) => {
    await sleep(path.length % 7);
    if (path === target) return 'exists';
    if (path === 'Order/BookOrderShipment') return 'missing';
    if (path === 'Product/GetProducts' || path === 'Order/GetOrders') return 'exists';
    // ชื่ออื่นตอบตรงตามที่ทะเบียนอ้าง
    return canFirst.has(path) ? 'exists' : 'missing';
  };
  const r = await zortClaimCheck({ probe: fake });
  const falseClaims = r.claimsNowFalse ?? r.broke;
  const gone = r.capabilitiesGone ?? r.gone;
  assert.deepEqual(falseClaims.map((x) => [x.what, x.endpoint]), [[noApiRow.what, target]]);
  assert.deepEqual(gone.map((x) => [x.what, x.endpoint]), [[canRow.what, 'Order/BookOrderShipment']]);
});

test('ตัวควบคุมไม่ผ่าน ⇒ inconclusive ไม่ยิงทะเบียนต่อ', async () => {
  let calls = 0;
  const r = await zortClaimCheck({ probe: async () => { calls++; return 'unknown'; } });
  assert.equal(r.inconclusive, true);
  assert.equal(calls, 2);
});
