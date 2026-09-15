// รัน: node --test scripts/tests/mkp-finance-probe.test.mjs
// 16 ก.ย. 2569 · ใบ t_mu2wjrcf — ตรวจสิทธิ์ API การเงิน 3 มาร์เก็ตเพลส
// 🔴 สิ่งที่เฝ้า: ① ค่าเงิน/เลขธุรกรรมห้ามหลุด (คืนแค่ชื่อช่อง) ② เจ้าหนึ่งล้มไม่ลากอีกเจ้า ③ ยังไม่เชื่อมร้าน = skip ไม่ใช่ error ④ token ในข้อความ error ถูกซ่อน
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { probeMarketplaceFinance, shapeOf } from '../../netlify/lib/mkp-finance-probe.mjs';

const SECRET_AMOUNT = 987654.32;
const SECRET_TXN = 'TXN-SECRET-123';

test('คืนแค่ชื่อช่อง ไม่มีค่า', async () => {
  const r = await probeMarketplaceFinance({
    shopee: async () => ({ response: { transaction_list: [{ amount: SECRET_AMOUNT, transaction_id: SECRET_TXN }], more: false } }),
    lazada: async () => ({ code: '0', data: [{ amount: String(SECRET_AMOUNT), transaction_number: SECRET_TXN }] }),
    tiktok: async () => ({ code: 0, data: { statements: [{ revenue_amount: String(SECRET_AMOUNT), id: SECRET_TXN }] } }),
  });
  const s = JSON.stringify(r);
  assert.ok(!s.includes(String(SECRET_AMOUNT)) && !s.includes(SECRET_TXN), 'ค่าจริงหลุด');
  assert.ok(s.includes('transaction_list') && s.includes('transaction_number') && s.includes('revenue_amount'), 'ต้องมีชื่อช่อง');
  assert.deepEqual(r.results.map((x) => [x.platform, x.ok]), [['shopee', true], ['lazada', true], ['tiktok', true]]);
});

test('เจ้าหนึ่งล้ม อีกเจ้ายังได้ผล · ยังไม่เชื่อม = skip · ซ่อน token', async () => {
  const r = await probeMarketplaceFinance({
    shopee: async () => { throw new Error('error_permission: no access access_token=abc123secret'); },
    lazada: async () => { throw new Error('ยังไม่ได้เชื่อมร้าน — ให้เจ้าของร้านกดอนุญาต'); },
    tiktok: async () => ({ code: 0, data: { statements: [] } }),
  });
  const [sh, lz, tt] = r.results;
  assert.equal(sh.ok, false); assert.match(sh.error, /error_permission/); assert.doesNotMatch(sh.error, /abc123secret/);
  assert.ok(lz.skip && !('ok' in lz));
  assert.equal(tt.ok, true);
});

test('shapeOf ลึกพอเห็นชื่อช่องการเงินที่ซ้อน 3 ชั้น + array (TikTok)', () => {
  const s = JSON.stringify(shapeOf({ code: 0, data: { statements: [{ revenue_amount: '1', settlement_amount: '2' }] } }));
  assert.ok(s.includes('revenue_amount') && s.includes('settlement_amount'));
});

test('shapeOf ไม่คืนค่าพื้นฐาน', () => {
  assert.deepEqual(shapeOf(5), { type: 'number' });
  assert.deepEqual(shapeOf('x'), { type: 'string' });
});
