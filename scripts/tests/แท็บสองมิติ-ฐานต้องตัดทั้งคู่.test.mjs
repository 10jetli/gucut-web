// รัน: node --experimental-test-module-mocks --test scripts/tests/แท็บสองมิติ-ฐานต้องตัดทั้งคู่.test.mjs
// 14 ต.ค. 2569 · gucut (ท่อ) — สัญญาแถบแท็บสองมิติที่ฝั่งจอขอ (สถานะรายการ × สถานะชำระเงิน)
// 🔴 สิ่งที่เฝ้า:
//   ① ฐานของแถบแท็บต้องตัด **ทั้ง** status และ paystatus — ของจริงที่ฝั่งจอจับได้ 14 ต.ค.:
//      ส่ง paystatus=Pending เฉย ๆ ⇒ byStatus เหลือ 2 แถว ⇒ แท็บ "ยกเลิก"(499) "รอส่ง"(1) อ่านว่า (0)
//   ② byStatus กับ byPayStatus ต้องมาจาก **คำสั่งเดียว** ⇒ เลขสองชุดไม่มีวันเพี้ยนออกจากกัน
//   ③ tabBase.excludes ต้องมาด้วยทุกครั้ง (ข้อ 2 ห้ามมาคนเดียว — แก้ฐานแต่ไม่บอก = จอซ่อนเลขฟรี ๆ)
//   ④ payStatusesAll: null = อ่านไม่ได้ ห้ามเป็น []
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let seen = [];
const GRID = [
  { status: 'Success', pay_status: 'Paid',    orders: 7000, amount: 100 },
  { status: 'Success', pay_status: 'Pending', orders:   15, amount:  10 },
  { status: 'Pending', pay_status: 'Pending', orders:  153, amount:  20 },
  { status: 'Pending', pay_status: 'Paid',    orders:   23, amount:   5 },
  { status: 'Voided',  pay_status: 'Voided',  orders:  499, amount:  30 },
  { status: 'Waiting', pay_status: 'Pending', orders:    1, amount:   1 },
];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params) => {
    const s = String(sql).replace(/\s+/g, ' ');
    seen.push({ s, params });
    /* 🔴 ตัวตอบต้องยึด **หัว SELECT** ไม่ใช่แค่ GROUP BY — คำสั่งฐาน `w` ก็เป็น GROUP BY 1,2 เหมือนกัน
       ⇒ เงื่อนไขกว้าง ๆ ที่มาก่อนจะกลืนคำสั่งอีกตัว แล้วเทสวัดของผิดก้อนแบบไม่มีอะไรฟ้อง
       (เหยียบคลาสนี้ซ้ำครั้งที่สองในวันเดียว — ครั้งแรกคือตัวค้นคำสั่งแถบแท็บเมื่อเช้า) */
    if (/^SELECT status, COALESCE\(pay_status,''\) AS pay_status/.test(s) && /GROUP BY 1,2$/.test(s)) return GRID;
    if (/SELECT COALESCE\(pay_status,''\) AS pay_status, status, COUNT\(\*\) AS orders/.test(s) && /GROUP BY 1,2$/.test(s))
      return [
        { pay_status: 'Paid', status: 'Success', orders: 10, amount: 1000 },
        { pay_status: 'Pending', status: 'Pending', orders: 3, amount: 300 },
        { pay_status: 'Paid', status: 'Pending', orders: 2, amount: 70 },
      ];
    if (/SELECT DISTINCT pay_status/.test(s)) return [{ pay_status: 'Paid' }, { pay_status: 'Pending' }, { pay_status: 'Voided' }];
    if (/SELECT DISTINCT status/.test(s)) return [{ status: 'Pending' }, { status: 'Success' }, { status: 'Voided' }, { status: 'Waiting' }];
    if (/COUNT\(\*\) AS c/.test(s)) return [{ c: 7748, s: 1 }];
    return [];
  },
} });

const { listOrders, listOrderFacets } = await import('../../netlify/lib/core-orders.mjs');
/* 🔴 ตัวค้นต้องแม่นพอ และต้องยืนยันว่าเจอ **ตัวเดียว**
   รอบแรกผมใช้ /GROUP BY 1,2/ + /pay_status/ แล้วมันไปเจอคำสั่งของ `statusCountsRaw`
   (integration_status × channel GROUP BY 1,2 ซึ่ง WHERE มี pay_status ด้วยอย่างถูกต้อง)
   ⇒ เทสแดงโดยชี้ไปผิดคำสั่ง = **แดงลวง** ซึ่งพาคนไปแก้ของที่ยังดี
   ⇒ ยึดที่หัว SELECT ของคำสั่งนั้นเอง แล้ว assert ว่ามีคำสั่งเดียวที่เข้าเกณฑ์ */
const TAB_RE = /SELECT status, COALESCE\(pay_status,''\) AS pay_status/;
const tabSqls = () => seen.filter((x) => TAB_RE.test(x.s));
const tabSql = () => {
  const all = tabSqls();
  assert.equal(all.length, 1, `คำสั่งแถบแท็บต้องมีคำสั่งเดียว (เจอ ${all.length}) — ยิงซ้ำ = เปลืองรอบ D1 และเลขอาจคร่อมรอบซิงก์`);
  return all[0];
};

for (const [ชื่อ, เรียก] of [['list=orders', listOrders], ['list=orderfacets', listOrderFacets]]) {
  test(`${ชื่อ}: กรอง paystatus อยู่ แล้วแท็บทั้งสองมิติต้องยังครบ`, async () => {
    seen = [];
    const r = await เรียก({ from: '2025-10-01', to: '2026-10-14', payStatus: 'Pending', store: 'z1' });

    // ① ฐานแท็บต้องไม่มีเงื่อนไขของสองมิตินั้นเลย
    const t = tabSql();
    assert.doesNotMatch(t.s, /pay_status = \?/, 'ฐานแถบแท็บยังกรอง paystatus ⇒ แท็บมิติอื่นจะอ่านว่า (0)');
    assert.doesNotMatch(t.s, /\bstatus = \?/, 'ฐานแถบแท็บยังกรอง status');

    // ② สองมิติครบ และยอดรวมของทั้งสองมิติต้องเท่ากัน (มาจากตารางเดียว)
    const sum = (a) => a.reduce((x, y) => x + y.orders, 0);
    assert.equal(sum(r.byStatus), sum(r.byPayStatus), 'สองมิติรวมไม่เท่ากัน = ไม่ได้มาจากคำสั่งเดียว');
    assert.equal(sum(r.byStatus), 7691);
    assert.deepEqual([...r.byStatus].map((x) => x.status).sort(), ['Pending', 'Success', 'Voided', 'Waiting']);
    assert.deepEqual([...r.byPayStatus].map((x) => x.payStatus).sort(), ['Paid', 'Pending', 'Voided']);
    // รูปของแถวต้องเป็นที่ฝั่งจอขอเป๊ะ
    assert.deepEqual(Object.keys(r.byPayStatus[0]).sort(), ['amount', 'orders', 'payStatus']);
    // Pending ฝั่งชำระเงิน = 15+153+1 = 169 (ไม่ใช่ 153 ของช่องสถานะ) — สองมิติตอบคนละคำถามจริง
    assert.equal(r.byPayStatus.find((x) => x.payStatus === 'Pending').orders, 169);
    assert.equal(r.byStatus.find((x) => x.status === 'Pending').orders, 176);

    // ③ ธงฐานต้องมาด้วย และเป็นรายชื่อ ไม่ใช่ boolean
    assert.deepEqual(r.tabBase, { excludes: ['status', 'paystatus'] });
  });
}

test('เลขเงินตามสถานะชำระเงินต้องมาจากชุดที่กรองอยู่ (w) ไม่ใช่ฐานแถบแท็บ', async () => {
  seen = [];
  const r = await listOrders({ from: '2025-10-01', to: '2026-10-14', status: 'Success', store: 'z1' });
  // คำสั่งของเลขเงินต้องกรอง status (เพราะเป็นชุดที่จอแสดง) — ต่างจากคำสั่งแถบแท็บที่ต้องไม่กรอง
  const เงิน = seen.filter((x) => /SELECT COALESCE\(pay_status,''\) AS pay_status, status, COUNT\(\*\) AS orders/.test(x.s) && /GROUP BY 1,2$/.test(x.s));
  assert.equal(เงิน.length, 1, 'คำสั่งเลขเงินต้องมีคำสั่งเดียว');
  assert.match(เงิน[0].s, /(?<![\w])status = \?/, 'เลขเงินต้องอยู่ในขอบเขตเดียวกับแถว ⇒ ต้องกรองสถานะด้วย');
  assert.doesNotMatch(tabSql().s, /(?<![\w])status = \?/, 'แถบแท็บต้องยังไม่กรองสถานะ');
  // ค่าที่ได้ต้องมาจากก้อน ไม่ใช่จาก byPayStatus (ซึ่งกว้างกว่า)
  assert.equal(r.totalUnpaidAmountByPay, 300);
  assert.equal(r.totalPaidAmountByPay, 1070, 'Paid ต้องรวมทุก status ในฐาน w');
  assert.deepEqual(r.byPayStatusFiltered.map((x) => x.payStatus).sort(), ['Paid', 'Pending']);
  // byPayStatus (ฐานแท็บ) ต้องไม่เท่ากับก้อนที่กรองแล้ว — ถ้าเท่ากัน = ใช้ฐานเดียวกันผิด
  assert.notEqual(r.byPayStatus.find((x) => x.payStatus === 'Pending').orders, r.byPayStatusFiltered.find((x) => x.payStatus === 'Pending').orders);
});

test('สองช่องเงินเก่า (totalPaid/UnpaidAmount) ต้องขยับตามตัวกรอง — ขอบเขต w ไม่ใช่ฐานแท็บ', async () => {
  seen = [];
  const r = await listOrders({ from: '2025-10-01', to: '2026-10-14', store: 'z1' });
  // ก้อนฐาน w ของ mock: Success/Paid 1000 · Pending/Pending 300 · Pending/Paid 70
  // totalPaidAmount = สถานะที่ไม่ใช่ pending/void/cancel = 1000
  assert.equal(r.totalPaidAmount, 1000, 'คิดจากคอลัมน์ status ในฐาน w');
  // totalUnpaidAmount = status pending = 300 + 70 = 370 (ไม่ใช่ของฐานแท็บซึ่งกว้างกว่า)
  assert.equal(r.totalUnpaidAmount, 370);
  // ⚠️ ค่าของฐานแท็บ (GRID) ให้เลขอื่น ⇒ ถ้าเท่ากับค่านั้น = ใช้ฐานผิด
  const ฐานแท็บ = GRID.filter((x) => /pending/i.test(x.status)).reduce((a, x) => a + x.amount, 0);
  assert.notEqual(r.totalUnpaidAmount, ฐานแท็บ, 'ช่องเงินเก่าต้องไม่คิดจากฐานแถบแท็บ (เลขของทั้งชุดคู่กับแถวที่กรองแล้ว)');
  assert.equal(r.byPayStatusFiltered.find((x) => x.payStatus === 'Paid').amount, 1070);
});

test('payStatusesAll: อ่านไม่ได้ต้องเป็น null ไม่ใช่ []', async () => {
  seen = [];
  const r = await listOrders({ from: '2025-10-01', to: '2026-10-14', store: 'z1' });
  assert.deepEqual(r.payStatusesAll, ['Paid', 'Pending', 'Voided']);
  assert.equal(r.payStatusesAllError, null);

  mock.restoreAll();
  mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
    coreReady: () => true,
    coreQuery: async (sql) => {
      const s = String(sql).replace(/\s+/g, ' ');
      if (/SELECT DISTINCT pay_status/.test(s)) throw new Error('D1 ล่ม');
      if (/GROUP BY 1,2/.test(s)) return GRID;
      if (/COUNT\(\*\) AS c/.test(s)) return [{ c: 1, s: 1 }];
      return [];
    },
  } });
  const mod = await import(`../../netlify/lib/core-orders.mjs?x=${Date.now()}`);
  const r2 = await mod.listOrders({ from: '2025-10-01', to: '2026-10-14', store: 'z1' });
  assert.equal(r2.payStatusesAll, null, 'อ่านไม่ได้ต้องเป็น null — [] ยุบสามสถานะเหลือสอง');
  assert.match(String(r2.payStatusesAllError), /อ่าน/);
});

test('อ่านก้อนเลขเงินไม่ได้ ⇒ null ห้ามเป็น 0', async () => {
  mock.restoreAll();
  mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
    coreReady: () => true,
    coreQuery: async (sql) => {
      const s = String(sql).replace(/\s+/g, ' ');
      if (/SELECT COALESCE\(pay_status,''\) AS pay_status, status, COUNT\(\*\) AS orders/.test(s) && /GROUP BY 1,2$/.test(s)) throw new Error('D1 ล่ม');
      if (/^SELECT status, COALESCE\(pay_status,''\) AS pay_status/.test(s) && /GROUP BY 1,2$/.test(s)) return GRID;
      if (/COUNT\(\*\) AS c/.test(s)) return [{ c: 1, s: 1 }];
      return [];
    },
  } });
  const mod = await import(`../../netlify/lib/core-orders.mjs?y=${Date.now()}`);
  const r = await mod.listOrders({ from: '2025-10-01', to: '2026-10-14', store: 'z1' });
  assert.equal(r.byPayStatusFiltered, null);
  assert.equal(r.totalUnpaidAmountByPay, null, '0 ปลอมอ่านว่า "ไม่มีเงินค้าง" ซึ่งเป็นทิศที่แพง');
  assert.equal(r.totalPaidAmountByPay, null);
});

test('อ่านก้อนฐาน w ไม่ได้ ⇒ สองช่องเงินเก่าต้องเป็น 0 ไม่ใช่เลขของฐานแท็บ', async () => {
  mock.restoreAll();
  mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
    coreReady: () => true,
    coreQuery: async (sql) => {
      const s = String(sql).replace(/\s+/g, ' ');
      if (/SELECT COALESCE\(pay_status,''\) AS pay_status, status, COUNT\(\*\) AS orders/.test(s) && /GROUP BY 1,2$/.test(s)) throw new Error('D1 ล่ม');
      if (/^SELECT status, COALESCE\(pay_status,''\) AS pay_status/.test(s) && /GROUP BY 1,2$/.test(s)) return GRID;
      if (/COUNT\(\*\) AS c/.test(s)) return [{ c: 1, s: 1 }];
      return [];
    },
  } });
  const mod = await import(`../../netlify/lib/core-orders.mjs?z=${Date.now()}`);
  const r = await mod.listOrders({ from: '2025-10-01', to: '2026-10-14', store: 'z1' });
  // 🔑 สองช่องเก่าเป็นตัวเลขเสมอ (สัญญาเดิมของมัน) ⇒ อ่านก้อนไม่ได้ ต้องได้ 0
  //    ซึ่งต่างจาก *ByPay ที่เป็น null — ของเก่าเปลี่ยนชนิดตอนนี้จะทำจอที่อ่านอยู่พัง
  assert.equal(r.totalPaidAmount, 0);
  assert.equal(r.totalUnpaidAmount, 0);
  assert.equal(r.totalUnpaidAmountByPay, null, 'ช่องใหม่ยังเป็น null ตามสัญญาของมัน');
});
