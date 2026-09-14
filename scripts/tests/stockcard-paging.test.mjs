// รัน: node --experimental-test-module-mocks --test scripts/tests/stockcard-paging.test.mjs
// บัตรสต็อก ?list=stockcard — ช่วงวัน + แบ่งหน้าข้าม 3 แหล่ง (D1 ปลอม) · ใบ t_mu1i74cu (ส่งออกบัตรสต็อก)
// 🔴 สิ่งที่เฝ้า: หน้าต่อหน้าต้องไม่หาย/ไม่ซ้ำเมื่อรวมหลายแหล่ง · ช่วงวันต้องลงทุกแหล่ง · เกินความลึกต้องบอก
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// ข้อมูลปลอม: ขาย 5 ใบ (วันที่ 10,8,6,4,2) · ซื้อ 3 ใบ (9,5,1) · ปรับ 0
const SALES = [10, 8, 6, 4, 2].map((d) => ({ date: `2026-09-${String(d).padStart(2, '0')}`, kind: 'ขาย', ref: `S${d}`, qty: -1 }));
const BUYS = [9, 5, 1].map((d) => ({ date: `2026-09-${String(d).padStart(2, '0')}`, kind: 'ซื้อ', ref: `B${d}`, qty: 1 }));
let sqls = [];
const lim = (s) => Number((/LIMIT (\d+)/.exec(s) || [])[1] ?? 1e9);
const between = (rows, s) => {
  const f = /o?\.?(?:order_date|po_date)\s*>=\s*'([\d-]+)'/.exec(s)?.[1];
  const t = /o?\.?(?:order_date|po_date)\s*<=\s*'([\d-]+)'/.exec(s)?.[1];
  return rows.filter((r) => (!f || r.date >= f) && (!t || r.date <= t));
};
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => {
    const s = String(sql); sqls.push(s);
    if (/FROM stock_moves/.test(s)) return /COUNT/.test(s) ? [{ c: 0 }] : [];
    // ⚠️ เช็ค purchase_order_items ก่อน — ชื่อตารางมีคำว่า order_items อยู่ข้างใน (ตัวปลอมรุ่นแรกพลาดตรงนี้)
    if (/purchase_order_items/.test(s)) { const r = between(BUYS, s); return /COUNT/.test(s) ? [{ c: r.length }] : r.slice(0, lim(s)); }
    if (/order_items/.test(s)) { const r = between(SALES, s); return /COUNT/.test(s) ? [{ c: r.length }] : r.slice(0, lim(s)); }
    return [];
  },
} });
const { stockCard, STOCKCARD_MAX_DEPTH } = await import('../../netlify/lib/core-stock.mjs');
const refs = (r) => r.rows.map((x) => x.ref);

test('แบ่งหน้าข้ามแหล่ง: 3 หน้าหน้าละ 3 = ลำดับวันที่ถูกทั้งชุด ไม่หาย ไม่ซ้ำ · hasMore ถูก', async () => {
  const p1 = await stockCard({ sku: 'X', limit: 3, offset: 0 });
  const p2 = await stockCard({ sku: 'X', limit: 3, offset: 3 });
  const p3 = await stockCard({ sku: 'X', limit: 3, offset: 6 });
  assert.deepEqual([...refs(p1), ...refs(p2), ...refs(p3)], ['S10', 'B9', 'S8', 'S6', 'B5', 'S4', 'S2', 'B1']);
  assert.equal(p1.total, 8);
  assert.equal(p1.hasMore, true);
  assert.equal(p2.hasMore, true);
  assert.equal(p3.hasMore, false);
  assert.deepEqual(p2.applied, { sku: 'X', kind: 'all', limit: 3, offset: 3, from: null, to: null });
});

test('ช่วงวันลงทั้งขายและซื้อ (รวมตัวนับ) · วันที่ผิดรูป/กลับด้าน = error ไม่ยิงฐาน', async () => {
  sqls = [];
  const r = await stockCard({ sku: 'X', limit: 50, from: '2026-09-04', to: '2026-09-09' });
  assert.deepEqual(refs(r), ['B9', 'S8', 'S6', 'B5', 'S4']);
  assert.equal(r.total, 5);
  assert.ok(sqls.filter((s) => /COUNT/.test(s) && /purchase_order_items/.test(s)).every((s) => /po_date >= '2026-09-04'/.test(s)), 'ตัวนับใบซื้อต้องกรองวันด้วย ไม่งั้น total เพี้ยน');
  sqls = [];
  assert.ok((await stockCard({ sku: 'X', from: '04/09/2026' })).error);
  assert.ok((await stockCard({ sku: 'X', from: '2026-09-09', to: '2026-09-01' })).error);
  assert.equal(sqls.length, 0);
});

test('เกินความลึกสูงสุด ⇒ depthCapped + hasMore false (ไม่คืนหน้าว่างเหมือนหมด)', async () => {
  const r = await stockCard({ sku: 'X', limit: 500, offset: STOCKCARD_MAX_DEPTH });
  assert.equal(r.depthCapped, true);
  assert.equal(r.offsetRequested, STOCKCARD_MAX_DEPTH);
  assert.equal(r.hasMore, false);
});
