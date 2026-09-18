// รัน: node --experimental-test-module-mocks --test scripts/tests/return-orders-search.test.mjs
// 15 ก.ย. 2569 — ?list=returnorders&q= ค้นจากกระจก return_orders_v2 (เดิมเมิน q ทิ้ง · gucut2 จับได้ 5d1ce6d)
// 🔴 สิ่งที่เฝ้า: มีคำค้นต้องกรองจริงที่ฐาน (ไม่ยิง ZORT) · % _ ในคำค้นเป็นตัวอักษรธรรมดา
//    ฐานล้มต้องเป็น error ไม่ใช่ 0 แถว · applied.q สะท้อนค่าที่ใช้จริง · ไม่มีคำค้น = ดึงสดเหมือนเดิม
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let sqls = [];
let failD1 = false;
let failMeta = false;
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => {
    const s = String(sql); sqls.push({ s, params });
    if (/FROM core_meta WHERE k = 'sync_returns'/.test(s)) {
      if (failMeta) throw new Error('D1 500');
      return [{ v: 'complete', at: '2026-09-14 18:33:34' }];
    }
    if (/FROM return_orders_v2/.test(s)) {
      if (failD1) throw new Error('D1 500: no such table');
      if (/COUNT\(\*\)/.test(s)) return [{ c: 3 }];
      return [{ id: '9', number: 'CN-1', reference: 'SO-7', customer: 'ก', amount: '120.5', status: 'Success', warehouse: 'NEW', return_date: '2026-09-10', paid: 'Paid' }];
    }
    return [];
  },
} });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';

/* 🔴 ล้างสถานะ **ก่อน** ทุกเทส ไม่ใช่ท้ายเทส
   ถ้า assert ล้มกลางเทส บรรทัด reset ท้ายเทสจะไม่ถูกเรียก ⇒ ค่าค้างไปเทสถัดไป
   ⇒ เทสถัดไปแดงด้วยเหตุผลปลอม แล้วคนไล่บั๊กจะไปดูผิดจุด (เจอจริง 18 ก.ย. 2569) */
beforeEach(() => { failD1 = false; failMeta = false; sqls = []; });

const { listReturnOrders } = await import('../../netlify/lib/core-purchases.mjs');

const withFetch = async (fn) => {
  const saved = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (u) => {
    urls.push(String(u));
    return { ok: true, json: async () => ({ count: 689, list: [{ id: 1, number: 'CN-9', warehousecode: 'NEW' }] }) };
  };
  try { return await fn(urls); } finally { globalThis.fetch = saved; }
};

test('มีคำค้น ⇒ กรองที่กระจก ไม่ยิง ZORT · applied.q ตรง · total มาจากตัวนับ ไม่ใช่จำนวนแถวที่ได้', async () => {
  failD1 = false; failMeta = false; sqls = [];
  await withFetch(async (urls) => {
    const r = await listReturnOrders(50, 1, '  CN-1 ');
    assert.equal(urls.length, 0, 'มีคำค้นต้องไม่ยิง ZORT — ZORT ไม่มีช่องค้น');
    // 18 ก.ย. 2569: สัญญาเพิ่มช่องช่วงวัน (from/to/days) — ไม่ส่งมา ⇒ ต้องเป็น null ไม่ใช่หายไป
    assert.deepEqual(r.applied, { q: 'CN-1', from: null, to: null, days: null, source: 'mirror' });
    assert.equal(r.source, 'mirror');
    assert.equal(r.live, false);
    assert.equal(r.total, 3);
    assert.equal(r.rows.length, 1);
    assert.deepEqual(r.rows[0], { id: '9', number: 'CN-1', reference: 'SO-7', customer: 'ก', amount: 120.5, status: 'Success', warehouse: 'NEW', date: '2026-09-10', paid: 'Paid' });
    assert.equal(r.syncedAtUtc, '2026-09-14 18:33:34');
    assert.equal(r.syncComplete, true);
    const rowQ = sqls.find((x) => /SELECT id, number/.test(x.s) && /return_orders_v2/.test(x.s));
    assert.ok(rowQ, 'ต้องมีคำสั่งดึงแถวจากกระจก');
    assert.match(rowQ.s, /WHERE \(instr\(lower\(number\), lower\(\?\)\) > 0 OR instr\(lower\(reference\), lower\(\?\)\) > 0 OR instr\(lower\(customer\), lower\(\?\)\) > 0/);
    assert.doesNotMatch(rowQ.s, /LIKE/, 'ห้าม LIKE — D1 จำกัดรูปแบบ 50 ไบต์');
    assert.deepEqual(rowQ.params, ['CN-1', 'CN-1', 'CN-1', 'z1']);
    const cntQ = sqls.find((x) => /COUNT\(\*\)/.test(x.s));
    assert.deepEqual(cntQ.params, rowQ.params, 'ตัวนับกับตัวดึงแถวต้องใช้เงื่อนไขชุดเดียวกัน');
  });
});

test('คำค้นส่งดิบ ไม่ห่อ % — ชื่อไทย 20 ตัว (60 ไบต์) ไม่ถูกตัด · % _ เป็นตัวอักษรธรรมดา', async () => {
  /* 🔴 รุ่นแรกห่อ %…% ด้วย LIKE ⇒ D1 ปฏิเสธรูปแบบเกิน 50 ไบต์ · ไทย ≥17 ตัว = ล้ม (gucut2 ยิงจับได้ 15 ก.ย.) */
  for (const q of ['ก'.repeat(20), '50%_a']) {
    sqls = [];
    const r = await listReturnOrders(50, 1, q);
    const rowQ = sqls.find((x) => /SELECT id, number/.test(x.s));
    assert.deepEqual(rowQ.params, [q, q, q, 'z1']);
    assert.equal(r.applied.q, q);
    assert.equal(r.error, undefined);
  }
});

test('หน้าและขนาดหน้า: offset = (page-1)*limit · limit เพดาน 200', async () => {
  sqls = [];
  await listReturnOrders(20, 3, 'x');
  assert.match(sqls.find((x) => /SELECT id, number/.test(x.s)).s, /LIMIT 20 OFFSET 40/);
  sqls = [];
  await listReturnOrders(9999, 1, 'x');
  assert.match(sqls.find((x) => /SELECT id, number/.test(x.s)).s, /LIMIT 200 OFFSET 0/);
});

test('ฐานล้ม ⇒ error และไม่มี rows/total (ไม่ใช่ "ค้นแล้วไม่เจอ")', async () => {
  failD1 = true;
  const r = await listReturnOrders(50, 1, 'CN-1');
  assert.ok(r.error);
  assert.equal(r.rows, undefined);
  assert.equal(r.total, undefined);
  assert.deepEqual(r.applied, { q: 'CN-1', from: null, to: null, days: null, source: 'mirror' });
});

test('ชีพจรอ่านไม่ได้ ⇒ syncComplete null (ไม่รู้) ไม่ใช่ true · ผลค้นยังได้', async () => {
  failMeta = true;
  const r = await listReturnOrders(50, 1, 'CN-1');
  assert.equal(r.syncComplete, null);
  assert.equal(r.syncedAtUtc, null);
  assert.equal(r.total, 3);
  failMeta = false;
});

test('ไม่มีคำค้น (หรือช่องว่างล้วน) ⇒ ดึงสด ZORT เหมือนเดิม ส่ง page · ไม่แตะกระจก', async () => {
  for (const q of [undefined, null, '', '   ']) {
    sqls = [];
    await withFetch(async (urls) => {
      const r = await listReturnOrders(50, 2, q);
      assert.equal(urls.length, 1);
      assert.match(urls[0], /GetReturnOrders\?limit=50&page=2/);
      assert.deepEqual(r.applied, { q: null, source: 'zort' });
      assert.equal(r.live, true);
      assert.equal(r.total, 689);
      /* 17 ก.ย. 2569: เส้นสดอ่านกระจกได้ **เฉพาะยอดรวม** (mirrorTotals) — แถวต้องมาจาก ZORT สดเท่านั้น */
      const อ่านแถวจากกระจก = sqls.filter((x) => /return_orders_v2/.test(x.s) && !/COUNT\(\*\) AS c, ROUND\(COALESCE\(SUM\(amount\)/.test(x.s));
      assert.equal(อ่านแถวจากกระจก.length, 0, 'ไม่มีคำค้นต้องไม่อ่านแถวจากกระจก (อ่านได้แค่ยอดรวม)');
    });
  }
});

test('ยอดรวมจากกระจกส่งคู่กับ total ของ ZORT · อ่านกระจกพัง ⇒ mirrorTotals = null ไม่ใช่ 0', async () => {
  sqls = [];
  await withFetch(async () => {
    const r = await listReturnOrders(50, 1, '');
    assert.ok('mirrorTotals' in r);
    const q = sqls.find((x) => /return_orders_v2/.test(x.s) && /SUM\(amount\)/.test(x.s));
    assert.ok(q, 'ต้องมีคำสั่งรวมยอด');
    assert.match(q.s, /WHERE source = \?/);
  });
});
