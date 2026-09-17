// รัน: node --experimental-test-module-mocks --test scripts/tests/customer-money-cards.test.mjs
// 18 ก.ย. 2569 · gucut2 · งานยืนเทียบเมนู — การ์ดเงินของจอลูกค้ารายคน (/Contact/ContactDetail ของ ZORT)
//
// 🔬 **กติกาที่เฝ้าอยู่นี้วัดมาจากจอ ZORT จริง ไม่ได้เดา** (18 ก.ย. 2569 · อ่านอย่างเดียว)
//   · ใบ "รอโอน" แต่ "ชำระครบ" 18,000 ⇒ ZORT **นับ** ⇒ กติกาคือการชำระเงิน ไม่ใช่สถานะเอกสาร
//   · ใบ "รอโอน/รอชำระ" 10,980 กับ 55,200 ⇒ ZORT ขึ้น "-" ทั้งคู่ ⇒ **ยอดค้างชำระไม่ใช่ผลรวมใบที่ยังไม่ชำระ**
//
// 🔴 สองข้อที่ถ้าหลุดแล้วจอจะ "ดูถูกแต่ผิด":
//   ① การ์ดต้องคิดจาก SQL ทั้งกอง ห้ามคิดจาก recent ที่ถูกตัดเหลือ 20 แถว
//      (ลูกค้าที่ซื้อเกิน 20 ใบจะได้เลขน้อยกว่าจริงโดยไม่มีอะไรฟ้อง)
//   ② outstanding ต้องเป็น null (= ยังไม่รู้) ห้ามเป็น 0 และห้ามแอบคิดจากใบที่ยังไม่ชำระ
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let asked = [];
const rows = (sql) => {
  asked.push(sql);
  if (/FROM contacts/.test(sql)) return [{ id: 'c1', name: 'ลูกค้าทดสอบ', code: 'C1' }];
  // ⚠️ ต้องเช็คคำสั่ง "ยอดรวมรายสินค้า" ก่อน เพราะมันก็มี COUNT(*) n เหมือนกัน (ตัวปลอมเคยจับผิดอันมาแล้ว)
  if (/FROM \(\s*SELECT i\.sku/.test(sql)) return [{ n: 37, s: 24570 }];
  if (/COUNT\(\*\) n/.test(sql)) return [{ n: 54, total: 100000, first_day: '2023-01-01', last_day: '2026-09-14' }];
  if (/month_paid/.test(sql)) return [{ all_paid: 30000, month_paid: 18000, year_paid: 24570, ym: '2026-09', y: '2026' }];
  // ยอดรวมรายสินค้าทั้งชุด — จงใจให้มากกว่าผลรวมของแถวที่ส่งมา เพื่อจับกรณีจอเอาแถวที่ถูกตัดไปนับเอง
  if (/FROM order_items i JOIN orders o/.test(sql))
    return [{ sku: 'X1', name: 'ของ X', qty: 2, amount: 900 }, { sku: 'X2', name: 'ของ Y', qty: 1, amount: 100 }];
  // ตารางล่าสุด — จงใจส่งมาแค่ 2 แถว ยอดรวมน้อยกว่าการ์ดมาก ถ้าใครไปคิดการ์ดจากตรงนี้จะเห็นทันที
  return [{ number: 'A', amount: 1, pay_status: 'Paid' }, { number: 'B', amount: 2, pay_status: 'Pending' }];
};
mock.module('../../netlify/lib/coredb.mjs', {
  namedExports: { coreReady: () => true, coreQuery: async (sql) => rows(sql) },
});
const { getCustomerDetail } = await import('../../netlify/lib/core-contacts.mjs');

test('การ์ดเงินมาจากคำสั่งของตัวเอง ไม่ใช่จากตารางล่าสุดที่ถูกตัด 20 แถว', async () => {
  asked = [];
  const d = await getCustomerDetail('C1');
  assert.equal(d.money.thisMonth, 18000);
  assert.equal(d.money.thisYear, 24570);
  // ตารางล่าสุดรวมกันได้ 3 บาท ⇒ ถ้าการ์ดเท่ากับ 3 หรือ 1 แปลว่าไปคิดจากตารางแล้ว
  assert.notEqual(d.money.thisYear, 3);
  assert.ok(d.orders.recent.length < d.orders.count, 'ตัวทดสอบเองพัง — ต้องจำลองกรณีตารางถูกตัด');
});

test('คำสั่งที่คิดการ์ดต้องกรอง "ชำระครบ" และตัดเส้นเดือน/ปีตามเวลาไทย', async () => {
  asked = [];
  await getCustomerDetail('C1');
  const sql = asked.find((s) => /month_paid/.test(s));
  assert.ok(sql, 'ไม่มีคำสั่งคิดการ์ดเลย');
  assert.match(sql, /pay_status\s*=\s*'Paid'/, 'ต้องนับเฉพาะใบที่ชำระครบ (วัดจาก ZORT แล้ว)');
  assert.match(sql, /\+7 hours/, 'เดือน/ปีต้องตัดตามปฏิทินไทย ไม่ใช่ UTC');
  assert.doesNotMatch(sql, /status NOT LIKE '%cancel%'\s*$/, 'ตัวทดสอบเองพัง — ตรวจผิดช่อง');
  assert.match(sql, /cancel/i, 'ต้องตัดใบยกเลิกเหมือนช่องอื่นในก้อนเดียวกัน');
});

test('ยอดขายรายสินค้าถูกตัด 20 อันดับ ⇒ ต้องส่งยอดของทั้งชุดมาคู่กันเสมอ', async () => {
  const d = await getCustomerDetail('C1');
  const p = d.products;
  assert.ok(Array.isArray(p.rows) && p.rows.length === 2);
  // ทั้งชุด 37 รายการ 24,570 บาท — แถวที่ส่งมารวมกันได้แค่ 1,000 ⇒ จอต้องมีเลขทั้งชุดไว้เขียนว่า "มี N แสดง M"
  assert.equal(p.count, 37);
  assert.equal(p.amount, 24570);
  assert.notEqual(p.amount, p.rows.reduce((a, r) => a + r.amount, 0), 'ยอดทั้งชุดต้องไม่ใช่ผลบวกของแถวที่ถูกตัด');
  assert.match(String(p.scope), /ชำระครบ/, 'ต้องบอกว่าใช้ชุดเดียวกับการ์ดเงิน');
  // 🔴 ยอดรวมรายสินค้า (ก่อนเกลี่ยส่วนลดท้ายบิล) กับยอดรวมหัวใบ ต่างกันได้จริง — ต้องส่งมาทั้งคู่พร้อมคำอธิบาย
  assert.equal(p.ordersAmount, 30000, 'ต้องส่งยอดรวมหัวใบมาให้จอเทียบด้วย');
  assert.notEqual(p.ordersAmount, p.amount, 'ตัวทดสอบเองพัง — ต้องจำลองกรณีสองเลขไม่ตรงกัน');
  assert.match(String(p.diffNote), /ส่วนลดท้ายบิล/, 'สองเลขต่างกันแล้วต้องมีคำอธิบายติดมาเสมอ');
});

test('ยอดค้างชำระส่ง null พร้อมเหตุผล — ห้ามเป็น 0 และห้ามคิดจากใบที่ยังไม่ชำระ', async () => {
  const d = await getCustomerDetail('C1');
  assert.equal(d.money.outstanding, null, '0 แปลว่า "ไม่มีหนี้" ซึ่งเรายังไม่รู้ ⇒ ต้องเป็น null');
  assert.match(String(d.money.outstandingWhy), /\S/, 'ส่ง null แล้วต้องบอกเหตุผลด้วยเสมอ');
});
