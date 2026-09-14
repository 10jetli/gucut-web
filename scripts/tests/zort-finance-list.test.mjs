// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-finance-list.test.mjs
// เส้นอ่าน ZORT แบบส่งตรง (รายได้อื่น · รายจ่ายอื่น · โอนเงิน · สินค้าหลากคุณสมบัติ) — ZORT ปลอม ไม่ยิงเน็ตจริง
// 🔴 สิ่งที่เฝ้า: พารามิเตอร์วันที่ต้องไปชื่อที่ถูกของแต่ละเส้น · ถามไม่สำเร็จห้ามกลายเป็น "ว่าง" · เพดาน limit ต้องบอกจอ
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';

let calls = [];
let reply = () => ({ ok: true, status: 200, json: async () => ({ res: { resCode: '200' }, list: [], count: 0 }) });
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), method: init?.method ?? 'GET' });
  return reply();
};
const { zortReadList } = await import('../../netlify/lib/zort-finance.mjs');
const reset = () => { calls = []; };
const params = () => new URL(calls[0].url).searchParams;

test('ชื่อพารามิเตอร์วันที่ต่างกันต่อเส้น — ต้องไปถูกชื่อ · GET เท่านั้น', async () => {
  for (const [kind, path, after, before] of [
    ['incomes', '/v4/Finance/GetIncomes', 'incomedateafter', 'incomedatebefore'],
    ['expenses', '/v4/Finance/GetExpenses', 'expensedateafter', 'expensedatebefore'],
    ['moneytransfers', '/v4/Finance/GetMoneyTransfers', 'dateafter', 'datebefore'],
  ]) {
    reset();
    const r = await zortReadList({ kind, from: '2026-09-01', to: '2026-09-14', keyword: 'ค่าไฟ', page: 2, limit: 50 });
    assert.equal(r.ok, true, kind);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.equal(new URL(calls[0].url).pathname, path);
    assert.equal(params().get(after), '2026-09-01', `${kind} ต้องส่ง ${after}`);
    assert.equal(params().get(before), '2026-09-14', `${kind} ต้องส่ง ${before}`);
    assert.equal(params().get('keyword'), 'ค่าไฟ');
    assert.equal(params().get('page'), '2');
    assert.equal(params().get('limit'), '50');
  }
});

test('variations กรองวันที่ไม่ได้ ⇒ 400 ไม่ยิง ZORT', async () => {
  reset();
  const r = await zortReadList({ kind: 'variations', from: '2026-09-01' });
  assert.equal(r.ok, false);
  assert.ok(!r.unknown);
  assert.equal(calls.length, 0);
});

test('ชนิดผิด · วันที่ผิดรูป · from หลัง to ⇒ ไม่ยิง ZORT', async () => {
  reset();
  assert.equal((await zortReadList({ kind: 'salepages' })).ok, false);
  assert.equal((await zortReadList({ kind: 'incomes', from: '14/09/2026' })).ok, false);
  assert.equal((await zortReadList({ kind: 'incomes', from: '2026-09-14', to: '2026-09-01' })).ok, false);
  assert.equal(calls.length, 0);
});

test('limit เกิน 500 ⇒ บีบเป็น 500 และบอกจอ (limitClamped)', async () => {
  reset();
  const r = await zortReadList({ kind: 'incomes', limit: 2000 });
  assert.equal(params().get('limit'), '500');
  assert.equal(r.limitClamped, true);
  assert.equal(r.limitRequested, 2000);
});

test('สามสถานะ: list ว่างจริง = rows [] · ไม่มีช่อง list / HTTP ล้ม / เน็ตล้ม = unknown ห้ามเป็นว่าง', async () => {
  reset();
  reply = () => ({ ok: true, status: 200, json: async () => ({ list: [], count: 0 }) });
  const empty = await zortReadList({ kind: 'expenses' });
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.count, 0);

  reply = () => ({ ok: true, status: 200, json: async () => ({ res: { resCode: '401', resDesc: 'unauthorized' } }) });
  const noList = await zortReadList({ kind: 'expenses' });
  assert.equal(noList.ok, false);
  assert.equal(noList.unknown, true);
  assert.equal(noList.rows, undefined, 'ห้ามมี rows ว่างแนบมา — จอจะอ่านเป็นไม่มีรายการ');
  assert.equal(noList.zortCode, '401');
  assert.equal(noList.zortDesc, 'unauthorized', 'ต้องส่งข้อความของ ZORT ออกมาให้ไล่สาเหตุได้');

  reply = () => ({ ok: false, status: 500, json: async () => ({ list: [] }) });
  const http = await zortReadList({ kind: 'expenses' });
  assert.equal(http.unknown, true);

  reply = () => { throw new Error('timeout'); };
  const net = await zortReadList({ kind: 'expenses' });
  assert.equal(net.unknown, true);
});

test('ส่งแถวดิบ + rowKeys + count ตามที่ ZORT บอก (ไม่เอาจำนวนแถวมาแทน)', async () => {
  reset();
  reply = () => ({ ok: true, status: 200, json: async () => ({ list: [{ id: 7, amount: 120, incomedate: '2026-09-10' }] }) });
  const r = await zortReadList({ kind: 'incomes' });
  assert.deepEqual(r.rowKeys, ['id', 'amount', 'incomedate']);
  assert.equal(r.rows[0].amount, 120);
  assert.equal(r.count, null, 'ZORT ไม่ส่ง count ⇒ null ไม่ใช่ 1');
});

test('transfers: type ไปที่ transferType · ชนิดนอกรายการ = 400 ไม่ยิง · kind อื่นส่ง type = 400', async () => {
  reset();
  reply = () => ({ ok: true, status: 200, json: async () => ({ list: [], count: 42 }) });
  const r = await zortReadList({ kind: 'transfers', type: 'Assembly', from: '2022-01-01', to: '2026-09-14', limit: 1 });
  assert.equal(r.ok, true);
  assert.equal(new URL(calls[0].url).pathname, '/v4/Transfer/GetTransfers');
  assert.equal(params().get('transferType'), 'Assembly');
  assert.equal(params().get('transferdateafter'), '2022-01-01');
  assert.equal(r.count, 42);
  assert.equal(r.applied.type, 'Assembly');

  reset();
  assert.equal((await zortReadList({ kind: 'transfers', type: 'Nope' })).ok, false);
  assert.equal((await zortReadList({ kind: 'incomes', type: 'Adjust' })).ok, false);
  assert.equal(calls.length, 0);
});

test('returnpurchaseorders: เส้นถูก · วันที่ไปชื่อ returnpurchaseorderdate* · ส่ง totalAmount/totalPaymentAmount ของ ZORT · ไม่มี = null', async () => {
  reset();
  reply = () => ({ ok: true, status: 200, json: async () => ({ list: [{ id: 1, number: 'DN-1' }], count: 1, totalAmount: 1500.5, totalPaymentAmount: 0 }) });
  const r = await zortReadList({ kind: 'returnpurchaseorders', from: '2026-09-01', to: '2026-09-14' });
  assert.equal(r.ok, true);
  assert.equal(new URL(calls[0].url).pathname, '/v4/ReturnPurchaseOrder/GetReturnPurchaseOrders');
  assert.equal(params().get('returnpurchaseorderdateafter'), '2026-09-01');
  assert.equal(params().get('returnpurchaseorderdatebefore'), '2026-09-14');
  assert.equal(r.totalAmount, 1500.5);
  assert.equal(r.totalPaymentAmount, 0, '0 จริงต้องเป็น 0 ไม่ใช่ null');

  reset();
  reply = () => ({ ok: true, status: 200, json: async () => ({ list: [], count: 0 }) });
  const r2 = await zortReadList({ kind: 'returnpurchaseorders' });
  assert.equal(r2.totalAmount, null, 'ZORT ไม่ส่งยอดรวม ⇒ null ห้ามเป็น 0');
});
