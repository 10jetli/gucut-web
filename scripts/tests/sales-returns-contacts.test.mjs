// รัน: node --experimental-test-module-mocks --test scripts/tests/sales-returns-contacts.test.mjs
// 15 ก.ย. 2569 — ยอดคืนใน ?list=orders · ตัวกรองผู้ติดต่อ · ชีพจรซิงก์ใบคืน (D1 ปลอม · ZORT ปลอม)
// 🔴 สิ่งที่เฝ้า: ยอดคืนต้องใช้ขอบเขตเดียวกับยอดขาย · อ่านใบคืนไม่ได้ต้องเป็น null ไม่ใช่ 0
//    ตัวกรองผู้ติดต่อต้องไม่เปิดช่องกวาดทั้งฐาน · ชีพจรใบคืนต้องจดสถานะครบ/ไม่ครบถูก
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let sqls = [];
let failReturns = false;
let paramsOf = new Map();
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => {
    const s = String(sql); sqls.push(s); paramsOf.set(s, params);
    if (/FROM return_orders/.test(s) && /^\s*SELECT/.test(s)) {
      if (failReturns) throw new Error('D1 500: no such table: return_orders');
      if (/NOT EXISTS/.test(s)) return [{ c: 2, s: 300 }];
      return [{ c: 3, s: 450.5 }];
    }
    if (/FROM core_meta WHERE k = 'sync_returns'/.test(s)) return [{ v: 'complete', at: '2026-09-14 18:07:00' }];
    if (/SELECT COUNT\(\*\) AS c, ROUND\(COALESCE\(SUM\(amount\),0\),2\) AS s\s+FROM orders/.test(s)) return [{ c: 10, s: 5000 }];
    if (/FROM contacts/.test(s) && /COUNT\(\*\) AS c,/.test(s)) return [{ c: 5, with_phone: 4, with_email: 1, with_tax: 0 }];
    if (/GROUP BY 1 ORDER BY c DESC/.test(s) && /FROM contacts/.test(s)) return [{ type: 'Undefined', c: 5 }];
    return [];
  },
} });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';

const { listOrders } = await import('../../netlify/lib/core-orders.mjs');
const { listContacts } = await import('../../netlify/lib/core-contacts.mjs');
const { syncReturnOrders } = await import('../../netlify/lib/core-purchases.mjs');

test('ยอดคืนใช้ WHERE + params ชุดเดียวกับยอดขาย · ตัดใบคืนยกเลิก · ส่งชีพจรใบคืน', async () => {
  sqls = []; paramsOf = new Map(); failReturns = false;
  const r = await listOrders({ from: '2026-09-01', to: '2026-09-14', channel: 'Shopee', source: 'z1' });
  assert.equal(r.returnedCount, 3);
  assert.equal(r.returnedAmount, 450.5);
  assert.deepEqual(r.unmatchedReturns, { count: 2, amount: 300 });
  assert.equal(r.returnsSyncedAtUtc, '2026-09-14 18:07:00');
  assert.equal(r.returnsSyncComplete, true);
  const sale = sqls.find((s) => /SELECT COUNT\(\*\) AS c, ROUND\(COALESCE\(SUM\(amount\),0\),2\) AS s\s+FROM orders WHERE/.test(s));
  const ret = sqls.find((s) => /FROM return_orders/.test(s) && /EXISTS \(SELECT 1 FROM orders WHERE orders\.number = return_orders_v2\.reference AND orders\.source = return_orders_v2\.source AND/.test(s));
  assert.ok(sale && ret, 'ต้องมีทั้งยอดขายและยอดคืน');
  const saleWhere = /FROM orders WHERE (.*)$/s.exec(sale)[1].trim();
  assert.ok(ret.includes(saleWhere), 'เงื่อนไขใบขายในยอดคืนต้องเป็นชุดเดียวกับยอดขาย');
  assert.deepEqual(paramsOf.get(ret), paramsOf.get(sale), 'พารามิเตอร์ต้องชุดเดียวกัน');
  assert.match(ret, /NOT LIKE '%void%'/);
  assert.match(ret, /FROM return_orders_v2\b/, 'ต้องอ่านตารางกุญแจ id — ตารางเดิมกุญแจ number ทับกันหาย 152 ใบ');
});

test('อ่านตารางใบคืนไม่ได้ ⇒ returnedAmount/returnedCount/unmatchedReturns = null ไม่ใช่ 0 · ยอดขายยังได้', async () => {
  failReturns = true;
  const r = await listOrders({ from: '2026-09-01', to: '2026-09-14' });
  assert.equal(r.returnedAmount, null);
  assert.equal(r.returnedCount, null);
  assert.equal(r.unmatchedReturns, null);
  assert.equal(r.totalAmount, 5000);
  failReturns = false;
});

test('ตัวกรองผู้ติดต่อลง SQL · ไม่นับเป็นคำค้น — offset ลึกไม่มี q ยังถูกกัน', async () => {
  sqls = [];
  const r = await listContacts({ withPhone: '1', withEmail: '1', limit: 50 });
  /* 🔀 20 ต.ค. 2569 — `applied` มีช่องเรียงเพิ่ม (ท่อเริ่มรับ sort=/dir=)
     ⚠️ เทสนี้เทียบแบบ deepEqual โดยตั้งใจ ⇒ ท่อเพิ่มช่องใน `applied` เมื่อไหร่ **ต้องมาแก้ที่นี่**
        ซึ่งถูกแล้ว: `applied` เป็นสัญญาที่ฝั่งจออ่าน การเพิ่มช่องเงียบ ๆ ไม่ควรผ่านด่าน */
  assert.deepEqual(r.applied, { q: null, withPhone: true, withEmail: true,
                                sort: 'name', dir: 'asc', sortDefaulted: true });
  /* ⚠️ ตรวจที่ส่วน WHERE ของคำสั่งดึงแถวเท่านั้น — ข้อความ COALESCE(phone,'') <> '' มีอยู่แล้วใน SUM(CASE…) ของตัวนับ
      ตรวจทั้งคำสั่งแบบรุ่นแรก = เขียวเสมอแม้ถอดตัวกรองทิ้ง (กลายพันธุ์ M3 จับได้ 15 ก.ย. 2569) */
  const rowSql = sqls.find((s) => /SELECT id, type, name, code, phone, email/.test(s));
  assert.ok(rowSql, 'ต้องมีคำสั่งดึงแถว');
  const where = /WHERE 1=1(.*?)ORDER BY/s.exec(rowSql)[1];
  assert.match(where, /AND COALESCE\(phone,''\) <> ''/, 'ตัวกรองมีเบอร์ต้องอยู่ใน WHERE');
  assert.match(where, /AND COALESCE\(email,''\) <> ''/, 'ตัวกรองมีอีเมลต้องอยู่ใน WHERE');
  assert.deepEqual(r.byType, [{ type: 'Undefined', count: 5 }]);
  const deep = await listContacts({ withPhone: '1', offset: 5000 });
  assert.equal(deep.needQuery, true, 'ตัวกรองต้องไม่ปลดด่านกันไล่ดึงทั้งฐาน');
  assert.deepEqual(deep.rows, []);
});

test('ชีพจรใบคืน: ครบ = complete · หน้าล้ม = incomplete · หน้าแรกล้ม = ไม่จด', async () => {
  const saved = globalThis.fetch;
  const run = async (mode) => {
    sqls = []; paramsOf = new Map();
    globalThis.fetch = async (url) => {
      const pg = Number(/page=(\d+)/.exec(String(url))[1]);
      if (mode === 'first-fail') return { ok: false, json: async () => null };
      if (pg === 2 && mode === 'page-fail') return { ok: false, json: async () => null };
      const list = pg === 1 ? Array.from({ length: 200 }, (_, i) => ({ id: `ID${i}`, number: `CN${i}` })) : [{ id: 'ID-last', number: 'CN-last' }];
      return { ok: true, json: async () => ({ count: 201, list }) };
    };
    const r = await syncReturnOrders({ pages: 12 });
    // คีย์ชีพจรเป็นพารามิเตอร์แล้ว (15 ก.ย. 2569 · แยกร้าน) ⇒ หาจาก params[0] และตรึงว่า z1 ยังใช้คีย์เดิม
    const beat = sqls.find((s) => /INSERT INTO core_meta/.test(s) && paramsOf.get(s)?.[0] === 'sync_returns');
    return { r, beatV: beat ? paramsOf.get(beat)[1] : null };
  };
  try {
    const ok = await run('ok');
    assert.equal(ok.r.complete, true); assert.equal(ok.beatV, 'complete');
    const pf = await run('page-fail');
    assert.equal(pf.r.complete, false); assert.equal(pf.beatV, 'incomplete');
    const ff = await run('first-fail');
    assert.ok(ff.r.error); assert.equal(ff.beatV, null, 'ดึงหน้าแรกไม่ได้ต้องไม่จดชีพจร');
  } finally {
    globalThis.fetch = saved;
  }
});

test('เลขที่ใบคืนซ้ำแต่ id ต่าง ⇒ เก็บครบทุกใบ · เขียนทีละหลายแถว (ไม่ใช่คำสั่งละแถว) · complete จริง', async () => {
  const saved = globalThis.fetch;
  sqls = []; paramsOf = new Map();
  // 120 ใบ · เลขที่ใบซ้ำกันเป็นคู่ (60 เลข) แต่ id ไม่ซ้ำ — แบบเดียวกับของจริง 689 id / 537 เลข
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    count: 120,
    list: Array.from({ length: 120 }, (_, i) => ({ id: `ID${i}`, number: `CN${Math.floor(i / 2)}`, reference: `R${i}`, amount: 10 })),
  }) });
  try {
    const r = await syncReturnOrders({ pages: 12 });
    assert.equal(r.fetched, 120, 'ต้องเก็บครบ 120 ใบ ห้ามตัดใบที่เลขซ้ำ');
    assert.equal(r.written, 120);
    assert.equal(r.complete, true);
    const inserts = sqls.filter((s) => /INSERT INTO return_orders_v2/.test(s));
    assert.equal(inserts.length, 3, '120 แถว ⇒ 3 คำสั่ง (ละ 50) ไม่ใช่ 120 คำสั่ง');
    assert.match(inserts[0], /ON CONFLICT\(id\)/);
  } finally {
    globalThis.fetch = saved;
  }
});

test('🔀 sort= ต้องลงไปถึง SQL จริง และสะท้อนกลับใน applied — ไม่ใช่ปุ่มหลอก', async () => {
  /* 🔑 เหตุที่ต้องมีเทสนี้: คุณส้มวัดมา 19 ต.ค. 2569 ว่าท่อ **เมิน sort= เงียบ ๆ**
     ยิง sort=-sku · sort=sku&dir=desc · order=desc ได้แถวแรกเดิมทุกท่า และ applied ไม่สะท้อน
     ⇒ จอแยกไม่ออกว่า "ท่อเรียงแล้ว" กับ "ท่อเมิน" ⇒ ตารางเป็นคนละชุดกับ ZORT ตั้งแต่แถวแรก */
  sqls = [];
  const r = await listContacts({ sort: 'id', dir: 'desc', limit: 10 });
  assert.equal(r.applied.sort, 'id');
  assert.equal(r.applied.dir, 'desc');
  assert.equal(r.applied.sortDefaulted, false);
  const rowSql = sqls.find((s) => /SELECT id, type, name, code, phone, email/.test(s));
  assert.ok(rowSql, 'ต้องมีคำสั่งดึงแถว');
  assert.match(rowSql, /ORDER BY id DESC/, 'sort ต้องไปอยู่ใน ORDER BY ของคำสั่งจริง');
  /* ⚠️ ต้องต่อท้ายด้วยคอลัมน์ตั้งต้น ⇒ ลำดับนิ่ง · ไม่งั้นแถวค่าเท่ากันสลับที่ทุกคำขอ
     แล้วการไล่หน้าจะข้าม/ซ้ำแถวแบบหาสาเหตุไม่เจอ */
  assert.match(rowSql, /ORDER BY id DESC, name, id/, 'ต้องต่อท้ายด้วยคอลัมน์ตั้งต้นเพื่อให้ลำดับนิ่ง');
});

test('🔑 ชื่อช่องเรียงที่ไม่รู้จักต้องตีกลับ พร้อมบอกว่าเรียงได้อะไร — ห้ามเมินเงียบ ๆ', async () => {
  const r = await listContacts({ sort: 'ไม่มีช่องนี้', limit: 10 });
  assert.ok(r.error, 'ต้องคืน error ให้เส้นแปลงเป็น 400');
  assert.match(r.error, /ไม่รู้จักช่องเรียง/);
  assert.match(r.error, /id/, 'ต้องบอกรายชื่อช่องที่เรียงได้');
  const r2 = await listContacts({ sort: 'id', dir: 'ลง', limit: 10 });
  assert.ok(r2.error, 'dir ที่ไม่ใช่ asc/desc ต้องตีกลับ ไม่ใช่ปรับให้เป็น asc เงียบ ๆ');
  assert.match(r2.error, /asc/);
});

test('รูปย่อ sort=-id (ขีดหน้า = ลง) ต้องรับได้ — จอลองใช้รูปนี้มาแล้ว', async () => {
  const r = await listContacts({ sort: '-id', limit: 10 });
  assert.equal(r.applied.sort, 'id');
  assert.equal(r.applied.dir, 'desc');
});
