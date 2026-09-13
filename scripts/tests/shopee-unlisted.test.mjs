// รัน: node --experimental-test-module-mocks --test scripts/tests/shopee-unlisted.test.mjs
// ทดสอบตัวรวมผล "สินค้า UNLIST บน Shopee คลังมีของไหม" ด้วยตัวจริง (summarizeUnlisted) ไม่ประกอบคำตอบเอง
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('../../netlify/lib/coredb.mjs', { namedExports: { coreReady: () => true, coreQuery: async () => [] } });
mock.module('../../netlify/lib/shopee.mjs', { namedExports: { validToken: async () => ({}), shopCall: async () => ({}) } });
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({}) } });
const { summarizeUnlisted } = await import('../../netlify/lib/shopee-stock.mjs');

const snap = new Map([
  ['in-stock', { qty: 5 }],
  ['zero', { qty: 0 }],
  ['negative', { qty: -3 }],
  ['roll', { qty: 100 }],
  ['empty-roll', { qty: 20 }],
]);
const recipe = new Map([
  ['chain-25T', [{ sku: 'roll', qty: 25 }]],
  ['chain-empty', [{ sku: 'empty-roll', qty: 25 }]],
  ['kit-unknown-part', [{ sku: 'roll', qty: 1 }, { sku: 'ghost', qty: 1 }]],
]);
const rows = [
  { itemId: 1, sku: 'in-stock', name: 'A', qty: 0 },          // มีของตรงตัว
  { itemId: 2, sku: 'zero', name: 'B', qty: 0 },              // ตัวเลือกหนึ่งหมด
  { itemId: 2, sku: 'ghost-variant', name: 'B', qty: 0 },     // อีกตัวคลังไม่รู้จัก
  { itemId: 3, sku: '', name: 'C', qty: 0 },                  // ไม่กรอกรหัส
  { itemId: 4, sku: 'chain-25T', name: 'D', qty: 0 },         // ของชุด ประกอบได้ 4
  { itemId: 5, sku: 'negative', name: 'E', qty: 0 },          // คลังติดลบ = ไม่มีของ
  { itemId: 6, sku: 'kit-unknown-part', name: 'F', qty: 0 },  // สูตรมีชิ้นส่วนไม่รู้จัก
  { itemId: 7, sku: 'chain-empty', name: 'G', qty: 0 },       // ม้วนไม่พอตัด 1 เส้น
];

test('นับเป็นสินค้า ไม่ใช่รหัส และแยก ไม่รู้ ออกจาก ไม่มี', () => {
  const r = summarizeUnlisted(rows, snap, recipe);
  assert.equal(r.items, 7);
  assert.equal(r.skus, 8);
  assert.deepEqual([r.itemsWithStock, r.itemsNoStock, r.itemsUnknown], [2, 3, 2]);
  assert.deepEqual([r.skusWithStock, r.skusNoStock, r.skusUnknown], [2, 3, 3]);
  assert.deepEqual(r.withStock.map((i) => i.itemId).sort(), [1, 4]);
  assert.equal(r.withStock.find((i) => i.itemId === 4).variantsWithStock[0].have, 4);
  assert.equal(r.withStock.find((i) => i.itemId === 4).variantsWithStock[0].via, 'สูตรชุด');
  assert.deepEqual(r.unknown.map((i) => i.itemId).sort(), [3, 6]);
});

test('ตัวควบคุม: ถ้าเหมา ไม่รู้ เป็นศูนย์ ผลต้องเปลี่ยน (เทสแยกแยะได้จริง)', () => {
  const noUnknown = new Map([...snap, ['ghost', { qty: 0 }], ['ghost-variant', { qty: 0 }]]);
  const r = summarizeUnlisted(rows.filter((x) => x.sku), noUnknown, recipe);
  assert.equal(r.itemsUnknown, 0);
  assert.notDeepEqual([r.itemsWithStock, r.itemsNoStock, r.itemsUnknown], [2, 3, 2]);
});
