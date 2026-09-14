// รัน: node --experimental-test-module-mocks --test scripts/tests/core-sync-line-discount.test.mjs
// ตัวซิงก์ออเดอร์ ZORT → D1: ส่วนลดรายบรรทัด (ZORT ปลอม · D1 ปลอม ไม่ยิงเน็ตจริง)
// 🔴 เอกสาร ZORT V4 (OrderProduct): discount = "Discount Per Unit" — อ่านยืนยัน 14 ก.ย. 2569
// 🔴 บั๊กที่เทสนี้เฝ้า (เจอ 14 ก.ย. 2569):
//    ① order_items.discount ไม่เคยถูกเขียน (บรรทัด 28/28 เป็น null บน production ทั้งที่ใบวันนี้)
//    ② ทางถอยตอน totalprice หาย คิด per × qty − disc (ถือเป็นส่วนลดทั้งบรรทัด) ⇒ qty > 1 ยอดสูงเกิน
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const sqls = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => { sqls.push(String(sql)); return []; }, // [] = ยังไม่มีใบนี้ในกระจก ⇒ ถือว่าเปลี่ยน
} });
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({ get: async () => null, setJSON: async () => {} }) } });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';
delete process.env.ZORT_STORENAME_2;

let fetches = 0;
globalThis.fetch = async (url) => {
  fetches++;
  assert.match(String(url), /open-api\.zortout\.com\/v4\/Order\/GetOrders/);
  return { ok: true, status: 200, json: async () => ({ list: [{
    number: 'SO-TEST-1', status: 'Success', amount: 390, saleschannel: 'ทดสอบ', customername: 'ลูกค้า',
    orderdateString: '14/09/2026', discountamount: 0, shippingamount: 0,
    list: [
      // totalprice หาย · qty 3 · ราคา 100 · ส่วนลดต่อชิ้น "10" (ZORT ส่งเป็นข้อความได้)
      { sku: 'A', name: 'ของ A', number: 3, pricepernumber: 100, discount: '10' },
      // มี totalprice ⇒ ต้องใช้ค่านั้น ไม่คำนวณเอง
      { sku: 'B', name: 'ของ B', number: 1, pricepernumber: 150, totalprice: 120, discount: 30 },
    ],
  }] }) };
};

const { syncOrders } = await import('../../netlify/lib/core-sync.mjs');

test('เขียนส่วนลดต่อชิ้นลง order_items.discount · ทางถอยคิด (ราคา − ส่วนลด) × จำนวน', async () => {
  const r = await syncOrders(1, { from: '2026-09-14', to: '2026-09-14' });
  assert.ok(fetches >= 1);
  assert.equal(r.stores.z1.written, 1);
  assert.equal(r.stores.z1.items, 2);

  const ins = sqls.find((s) => /INSERT INTO order_items/.test(s));
  assert.ok(ins, 'ต้องมีคำสั่งเขียนบรรทัด');
  assert.match(ins, /\(order_id,line,sku,name,qty,amount,discount\)/, 'คอลัมน์ discount ต้องอยู่ในคำสั่งเขียน');
  assert.match(ins, /discount=excluded\.discount/, 'ตอนชนต้องอัปเดต discount ด้วย ไม่งั้นใบเดิมค้างค่าเก่า');
  // บรรทัด A: (100 − 10) × 3 = 270 (ไม่ใช่ 290) · discount 10 ต่อชิ้น
  assert.match(ins, /'SO-TEST-1'?,0,'A','ของ A',3,270,10\)|'z1\/SO-TEST-1',0,'A','ของ A',3,270,10\)/);
  // บรรทัด B: มี totalprice 120 ⇒ ใช้ 120 · discount 30
  assert.match(ins, /'z1\/SO-TEST-1',1,'B','ของ B',1,120,30\)/);
});
