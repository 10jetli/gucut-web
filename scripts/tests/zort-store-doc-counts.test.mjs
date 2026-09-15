// รัน: node --test scripts/tests/zort-store-doc-counts.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu28iq46 — นับเอกสาร 4 ชนิดของร้าน z1/z2 เพื่อตัดสินว่าต้องดึงของ z2 ไหม
// 🔴 สิ่งที่เฝ้า: z2 ใช้รหัสชุด _2 จริง · ไม่มี count/resCode ผิด/HTTP ล้ม = unknown ไม่ใช่ 0 · ไม่มีรหัส z2 = error · z1 เป็นตัวควบคุม
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { zortStoreDocCounts, storeCreds } from '../../netlify/lib/zort-store-doc-counts.mjs';

const ENV = { ZORT_STORENAME: 'shop1', ZORT_APIKEY: 'k1', ZORT_APISECRET: 's1', ZORT_STORENAME_2: 'shop2', ZORT_APIKEY_2: 'k2', ZORT_APISECRET_2: 's2' };
const fakeZort = (byStore) => async (url, init) => {
  const path = new URL(url).pathname.split('/').slice(-2).join('/');
  const r = byStore[init.headers.storename]?.[path];
  if (r === 'throw') throw new Error('net');
  if (r === 'http500') return { ok: false, status: 500 };
  return { ok: true, status: 200, json: async () => r };
};
const ALL = (n) => ({ 'PurchaseOrder/GetPurchaseOrders': { count: n }, 'Quotation/GetQuotations': { count: n }, 'ReturnOrder/GetReturnOrders': { count: n }, 'Transfer/GetTransfers': { count: n } });

test('z2 ใช้รหัสชุด _2 · นับแยกร้านถูก · ตัวควบคุม z1 ผ่าน', async () => {
  const r = await zortStoreDocCounts({ env: ENV, fetch: fakeZort({ shop1: ALL(7), shop2: ALL(0) }) });
  assert.equal(r.stores.z1.purchases.count, 7);
  assert.equal(r.stores.z2.transfers.count, 0);
  assert.equal(r.controlOk, true); assert.equal(r.z2Known, true);
  assert.deepEqual(storeCreds('z2', ENV), { storename: 'shop2', apikey: 'k2', apisecret: 's2' });
});

test('ไม่มี count · resCode ผิด · HTTP 500 · เครือข่ายล้ม ⇒ unknown ห้ามเป็น 0', async () => {
  const z2 = { 'PurchaseOrder/GetPurchaseOrders': { list: [] }, 'Quotation/GetQuotations': { res: { resCode: '100', resDesc: 'Access Denied.' } }, 'ReturnOrder/GetReturnOrders': 'http500', 'Transfer/GetTransfers': 'throw' };
  const r = await zortStoreDocCounts({ env: ENV, fetch: fakeZort({ shop1: ALL(1), shop2: z2 }) });
  for (const k of ['purchases', 'quotations', 'returnorders', 'transfers']) {
    assert.equal(r.stores.z2[k].unknown, true, k);
    assert.equal(r.stores.z2[k].count, undefined, `${k} ต้องไม่มี count`);
  }
  assert.equal(r.z2Known, false);
  assert.equal(r.controlOk, true);
});

test('ไม่ได้ตั้งรหัส z2 ⇒ error ชัด ไม่ใช่ศูนย์ · ตัวควบคุมล้ม ⇒ controlOk=false', async () => {
  const env = { ...ENV, ZORT_APIKEY_2: '' };
  const r = await zortStoreDocCounts({ env, fetch: fakeZort({ shop1: { 'PurchaseOrder/GetPurchaseOrders': 'http500' } }) });
  assert.match(r.stores.z2.error, /z2/);
  assert.equal(r.controlOk, false);
});

test('เส้นใน core.mjs เป็น GET และไม่คืนแถว', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const i = src.indexOf('url.searchParams.has("zortdoccounts")');
  assert.ok(i > 0);
  const block = src.slice(i, src.indexOf('if (url.searchParams.get("ordercheck"))', i));
  assert.match(block, /req\.method !== "GET"/);
  assert.match(block, /zortStoreDocCounts\(\)/);
});
