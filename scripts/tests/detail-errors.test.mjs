// รัน: node --experimental-test-module-mocks --test scripts/tests/detail-errors.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu2pekwt — เอกสารรายใบ (ใบโอน · ใบคืน · ใบเสนอราคา) แยกสามสถานะ
// 🔴 สิ่งที่เฝ้า: id ไม่ใช่ตัวเลข = ไม่ยิง ZORT · เน็ตล่ม = unknown · ZORT ตอบไม่ใช่ 200 = บอกสถานะ/resCode · ปกติยังได้ใบ
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('../../netlify/lib/coredb.mjs', { namedExports: { coreReady: () => true, coreQuery: async () => [] } });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';
const { getTransferDetail, getReturnOrderDetail, getQuotationDetail } = await import('../../netlify/lib/core-purchases.mjs');
const FNS = [['ใบโอน', getTransferDetail], ['ใบคืน', getReturnOrderDetail], ['ใบเสนอราคา', getQuotationDetail]];

let mode = 'ok'; let calls = 0;
globalThis.fetch = async () => {
  calls += 1;
  if (mode === 'throw') throw new Error('timeout');
  if (mode === 'reject') return { ok: false, status: 400, json: async () => ({ res: { resCode: '100', resDesc: 'Not found' } }) };
  if (mode === 'reject-nobody') return { ok: false, status: 500, json: async () => { throw new Error('html'); } };
  return { ok: true, status: 200, json: async () => ({ id: 1, number: 'DOC-1', status: 'Success', amount: 5, list: [{ sku: 'A', name: 'x', number: 1 }] }) };
};

test('id ไม่ใช่ตัวเลข ⇒ error badId และไม่ยิง ZORT', async () => {
  for (const [label, fn] of FNS) {
    calls = 0; mode = 'ok';
    const r = await fn('abc');
    assert.equal(r.badId, true, label); assert.match(r.error, /ต้องเป็นตัวเลข/); assert.equal(calls, 0, `${label} ห้ามยิง ZORT`);
  }
});

test('ติดต่อ ZORT ไม่ได้ ⇒ unknown · ข้อความไม่อ้างว่าไม่พบ', async () => {
  for (const [label, fn] of FNS) {
    mode = 'throw';
    const r = await fn('123');
    assert.equal(r.unknown, true, label); assert.match(r.error, /ติดต่อ ZORT ไม่ได้/); assert.doesNotMatch(r.error, /ไม่พบ/);
  }
});

test('ZORT ตอบไม่ใช่ 200 ⇒ บอกสถานะ + resCode ของ ZORT · ไม่มี body ก็ยังบอกสถานะ', async () => {
  for (const [label, fn] of FNS) {
    mode = 'reject';
    const r = await fn('999999999999');
    assert.equal(r.zortStatus, 400, label); assert.equal(r.zortCode, '100'); assert.match(r.error, /HTTP 400 · resCode 100 · Not found/);
    assert.equal(r.unknown, undefined, `${label} ZORT ตอบแล้ว ไม่ใช่ unknown`);
    mode = 'reject-nobody';
    const r2 = await fn('999999999999');
    assert.equal(r2.zortStatus, 500); assert.equal(r2.zortCode, null);
  }
});

test('ปกติยังได้ใบ ไม่มี error', async () => {
  for (const [label, fn] of FNS) {
    mode = 'ok';
    const r = await fn('123');
    assert.equal(r.error, undefined, `${label}: ${r.error}`);
  }
});
