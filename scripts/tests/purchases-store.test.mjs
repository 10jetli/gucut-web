// รัน: node --experimental-test-module-mocks --test scripts/tests/purchases-store.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu2pfve9 — ใบซื้อแยกร้าน (ตาราง _v2 กุญแจ id) + ใบเสนอราคาแยกร้าน
// 🔴 สิ่งที่เฝ้า: เลขที่ใบซ้ำในร้านเดียวต้องเก็บครบทั้งสองใบ · ไม่มี id ไม่เขียน · id ของอีกร้านไม่เขียนทับ ·
//    ยังไม่ซิงก์ = error ไม่ใช่ 0 ใบ · ใบรายใบเลขซ้ำห้ามเลือกให้ · บัตรสต็อกยังเป็น z1 · ใบเสนอราคา z2 ใช้รหัส _2
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { readFileSync } from 'node:fs';

let sqls = [];
let clashIds = [];
let metaRow = [{ v: 'complete', at: '2026-09-15 14:00:00' }];
let headRows = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => {
    const s = String(sql); sqls.push({ s, params });
    if (/SELECT v, at FROM core_meta WHERE k = \?/.test(s)) return metaRow;
    if (/SELECT id FROM purchase_orders_v2 WHERE id IN/.test(s)) return clashIds.map((id) => ({ id }));
    if (/SELECT \* FROM purchase_orders_v2 WHERE/.test(s)) return headRows;
    if (/COUNT\(\*\) AS c, ROUND/.test(s)) return [{ c: 2, total: 100 }];
    return [];
  },
} });
process.env.ZORT_STORENAME = 'shop1'; process.env.ZORT_APIKEY = 'k1'; process.env.ZORT_APISECRET = 's1';
process.env.ZORT_STORENAME_2 = 'shop2'; process.env.ZORT_APIKEY_2 = 'k2'; process.env.ZORT_APISECRET_2 = 's2';
const { syncPurchases, listPurchases, getPurchaseDetail, listQuotations } = await import('../../netlify/lib/core-purchases.mjs');

let stores = [];
globalThis.fetch = async (url, init) => {
  stores.push(init?.headers?.storename);
  if (/GetQuotations/.test(String(url))) return { ok: true, json: async () => ({ count: 4, list: [] }) };
  return { ok: true, json: async () => ({ list: [
    { id: 'P1', number: 'PO-1', customername: 'A', purchaseorderdate: '2026-09-01', amount: 10, list: [{ sku: 'S1', name: 'x', number: 2, pricepernumber: 5 }] },
    { id: 'P2', number: 'PO-1', customername: 'B', purchaseorderdate: '2026-09-02', amount: 20, list: [] },
    { id: '', number: 'PO-3', customername: 'C', purchaseorderdate: '2026-09-03', amount: 30, list: [] },
  ] }) };
};
const ins = () => sqls.find((x) => /INSERT INTO purchase_orders_v2/.test(x.s))?.s ?? '';

test('ซิงก์ z2 — รหัส _2 · เลขซ้ำในร้านเก็บครบสองใบ · ไม่มี id ไม่เขียน · บรรทัดผูก po_id · ชีพจรร้าน', async () => {
  sqls = []; clashIds = []; stores = [];
  const r = await syncPurchases({ store: 'z2' });
  assert.deepEqual([...new Set(stores)], ['shop2']);
  assert.match(ins(), /'P1','z2','PO-1'/); assert.match(ins(), /'P2','z2','PO-1'/);
  assert.doesNotMatch(ins(), /'PO-3'/);
  assert.match(ins(), /WHERE purchase_orders_v2\.source = excluded\.source/);
  assert.ok(sqls.some((x) => /FROM purchase_orders_v2 WHERE source = 'z2'/.test(x.s)));
  const li = sqls.find((x) => /INSERT INTO purchase_order_items_v2/.test(x.s));
  assert.match(li.s, /\('P1',1,'z2','PO-1','S1'/);
  const meta = sqls.find((x) => /INSERT INTO core_meta/.test(x.s));
  assert.equal(meta.params[0], 'sync_purchases_z2'); assert.equal(meta.params[1], 'incomplete');
  assert.equal(r.missingId, 1); assert.equal(r.written, 2); assert.equal(r.complete, false);
});

test('id ของอีกร้านไม่เขียนทับ และไม่แตะบรรทัดของใบนั้น', async () => {
  sqls = []; clashIds = ['P1'];
  const r = await syncPurchases({ store: 'z2' });
  assert.doesNotMatch(ins(), /'P1'/);
  assert.equal(sqls.filter((x) => /purchase_order_items_v2/.test(x.s) && /'P1'/.test(x.s)).length, 0);
  assert.equal(r.collisions, 1);
});

test('ยังไม่ซิงก์ร้านนี้ ⇒ error ไม่ใช่ 0 ใบ · ซิงก์แล้ว ⇒ ทุกคำสั่งกรองร้าน', async () => {
  metaRow = [];
  const a = await listPurchases({ store: 'z2' });
  assert.match(a.error, /ยังไม่ได้ซิงก์/); assert.equal(a.total, undefined);
  metaRow = [{ v: 'complete', at: 'x' }]; sqls = [];
  const b = await listPurchases({});
  assert.equal(b.store, 'z1');
  const reads = sqls.filter((x) => /FROM purchase_orders_v2 WHERE 1=1/.test(x.s));
  assert.equal(reads.length, 3);
  assert.ok(reads.every((x) => /AND source = 'z1'/.test(x.s)));
});

test('ใบรายใบ — เลขที่ใบซ้ำในร้าน ⇒ error พร้อม id ห้ามเลือกให้ · ใบเดียว ⇒ บรรทัดตาม po_id', async () => {
  metaRow = [{ v: 'complete', at: 'x' }];
  headRows = [{ id: 'P1', number: 'PO-1' }, { id: 'P2', number: 'PO-1' }];
  const d = await getPurchaseDetail('PO-1', 'z2');
  assert.equal(d.duplicate, true); assert.deepEqual(d.ids, ['P1', 'P2']); assert.equal(d.lines, undefined);
  headRows = [{ id: 'P9', number: 'PO-9', amount: 5 }]; sqls = [];
  const e = await getPurchaseDetail('PO-9', 'z2');
  assert.equal(e.id, 'P9'); assert.equal(e.store, 'z2');
  assert.ok(sqls.some((x) => /FROM purchase_order_items_v2\s+WHERE po_id = 'P9'/.test(x.s)));
  assert.ok(sqls.some((x) => /purchase_orders_v2 WHERE source = 'z2' AND number = 'PO-9'/.test(x.s)));
});

test('ใบเสนอราคา z2 ใช้รหัส _2 · บัตรสต็อกซื้อเข้าอ่าน _v2 เฉพาะ z1 · core.mjs ส่งร้านให้ใบรายใบ', async () => {
  stores = [];
  const q = await listQuotations(2, 1, 'z2');
  assert.deepEqual(stores, ['shop2']); assert.equal(q.store, 'z2');
  const k = readFileSync(new URL('../../netlify/lib/core-stock.mjs', import.meta.url), 'utf8');
  assert.equal((k.match(/FROM purchase_order_items_v2 i LEFT JOIN purchase_orders_v2 po ON po\.id = i\.po_id/g) || []).length, 2);
  assert.equal((k.match(/WHERE i\.source = 'z1' AND i\.sku =/g) || []).length, 2);
  // ใบซื้อที่ยกเลิกไม่ใช่ของเข้า — ทั้งคำสั่งดึงแถวและตัวนับต้องกรอง (พบ PO-202609001 Voided ขึ้นเป็นซื้อเข้า)
  assert.equal((k.match(/AND \$\{BUY_NOT_CANCELLED\}\$\{range\("po\.po_date"\)\}/g) || []).length, 2);
  assert.match(k, /const BUY_NOT_CANCELLED = CANCEL_SQL\.replace\(\/status\/g, "COALESCE\(po\.status,''\)"\);/);
  assert.doesNotMatch(k, /FROM purchase_order_items i\b/);
  const c = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const at = c.indexOf('if (url.searchParams.get("purchase")) {');
  assert.match(c.slice(at, at + 600), /getPurchaseDetail\(url\.searchParams\.get\("purchase"\), st\.source\)/);
  const w = readFileSync(new URL('../../netlify/lib/zort-write.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(w, /FROM purchase_orders WHERE|FROM purchase_order_items WHERE/);
});
