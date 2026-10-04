// รัน: node --experimental-test-module-mocks --test scripts/tests/กระจกค่าธรรมเนียม-อ่านรายใบ.test.mjs
// ใบ t_mum2bzeg — ช่องสถานะเตือนว่า "สูตรคิดยอดโอนไม่ตรง N ใบ" มาหลายวัน
// 🔴 แต่ **ไม่มีทางดูได้ว่าใบไหน**: สรุปให้แต่ยอดรวม · ตัวซิงก์เก็บตัวอย่าง 5 ใบ/รอบ
//    และไล่จาก "40 ใบใหม่สุด" ซ้ำทุกรอบ ⇒ ใบที่ต่างซึ่งอยู่ลึกกว่านั้นไม่มีวันถูกหยิบมาโชว์
//    🔑 คำเตือนที่บอกว่า "มีปัญหา" แต่ไม่บอก "ที่ไหน" = งานค้างโดยไม่มีใครเริ่มได้
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

const คำสั่งที่ยิง = [];
/** D1 ปลอม — ตอบตามรูปคำสั่ง · เก็บคำสั่งไว้ตรวจว่ากรอง/เรียงจริง */
mock.module('../../netlify/lib/coredb.mjs', {
  namedExports: {
    coreReady: () => true,
    แถวจากผล: (r) => (Array.isArray(r) ? r : (r?.results ?? [])),
    coreQuery: async (sql, params) => {
      คำสั่งที่ยิง.push({ sql, params });
      if (/CREATE/i.test(sql)) return [];
      if (/COUNT\(\*\)/.test(sql)) return [{ n: 91 }];
      return [
        { order_sn: 'A1', day: '2026-09-01', formula_diff: -457, fields_count: 70, items_total: 1000 },
        { order_sn: 'A2', day: '2026-09-02', formula_diff: 12, fields_count: 70, items_total: 500 },
      ];
    },
  },
});

const { shopeeFeeRows, เกณฑ์ต่างบาท } = await import('../../netlify/lib/mkp-finance-mirror.mjs');

test('① off=1 ต้องกรองด้วยเกณฑ์จริง และเรียงจากต่างมากสุด', async () => {
  คำสั่งที่ยิง.length = 0;
  await shopeeFeeRows({ off: true, days: 120 });
  const อ่านแถว = คำสั่งที่ยิง.find((c) => /SELECT order_sn/.test(c.sql));
  assert.ok(อ่านแถว, 'ต้องมีคำสั่งอ่านแถว');
  assert.match(อ่านแถว.sql, new RegExp(`ABS\\(formula_diff\\) > ${เกณฑ์ต่างบาท}`),
    '🔑 ตัวกรองต้องอยู่ในคำสั่งจริง — ส่ง off=1 แล้วท่อเมินเงียบ ๆ คือปุ่มหลอก');
  assert.match(อ่านแถว.sql, /ORDER BY ABS\(COALESCE\(formula_diff, 0\)\) DESC/,
    'ตัวตรวจสั่งไว้เองว่า "ไล่จากใบที่ formula_diff ใหญ่สุด" ⇒ ต้องเรียงให้');
});

test('② 🔬 ตัวควบคุมลบ: ไม่ส่ง off ⇒ ต้องไม่มีตัวกรองในคำสั่ง', async () => {
  คำสั่งที่ยิง.length = 0;
  await shopeeFeeRows({ days: 120 });
  const อ่านแถว = คำสั่งที่ยิง.find((c) => /SELECT order_sn/.test(c.sql));
  assert.doesNotMatch(อ่านแถว.sql, /ABS\(formula_diff\) >/,
    'ถ้ามีตัวกรองทั้งที่ไม่ได้สั่ง = คนอ่านจะเห็นแค่ใบที่ต่าง แล้วคิดว่านั่นคือทุกใบ');
  /* ⇒ สองข้อคู่กันพิสูจน์ว่า `off` **มีผลจริง** ไม่ใช่พารามิเตอร์ที่ถูกเมิน */
});

test('③ ต้องคืนความครอบคลุม — เห็นไม่ครบต้องประกาศตัว', async () => {
  const r = await shopeeFeeRows({ off: true, limit: 2 });
  assert.equal(r['เข้าเงื่อนไขทั้งหมด'], 91);
  assert.equal(r['คืนมากี่แถว'], 2);
  assert.ok(r['⚠️ ยังไม่ครบ'],
    '🔑 คืน 2 จาก 91 แล้วไม่บอก = คนอ่านสรุปจากตัวอย่างว่าเป็นทั้งหมด (กฎ partial-coverage-reported-as-full)');
  assert.match(r['⚠️ ยังไม่ครบ'], /offset=2/, 'ต้องบอกวิธีขอต่อ ไม่ใช่บอกแค่ว่าไม่ครบ');
});

test('④ เห็นครบแล้วต้องไม่มีคำเตือนค้าง (ตัวควบคุมอีกทิศ)', async () => {
  const r = await shopeeFeeRows({ off: true, limit: 200, offset: 89 });
  assert.equal(r['⚠️ ยังไม่ครบ'], undefined,
    'คำเตือนที่ขึ้นตลอดกาลจะถูกเลิกอ่าน — 89+2=91 = ครบ');
});

test('⑤ ช่วงวันต้องคิดเป็นวันไทย (+7) ไม่ใช่ UTC', async () => {
  คำสั่งที่ยิง.length = 0;
  await shopeeFeeRows({ days: 30 });
  const c = คำสั่งที่ยิง.find((x) => /SELECT order_sn/.test(x.sql));
  assert.match(c.sql, /date\('now', '\+7 hours', \?\)/,
    'เซิร์ฟเวอร์รัน UTC ร้านอยู่ไทย — ไม่บวก 7 = หน้าต่างเหลื่อม 7 ชม. (เคยกัดที่ core-stock)');
  assert.deepEqual(c.params[0], '-30 days');
});

test('⑥ เพดาน limit ต้องมี — กันคนขอ 5000 แล้วฟังก์ชันตายกลางทาง', async () => {
  คำสั่งที่ยิง.length = 0;
  await shopeeFeeRows({ limit: 5000 });
  const c = คำสั่งที่ยิง.find((x) => /SELECT order_sn/.test(x.sql));
  assert.equal(c.params[1], 200, 'ต้องถูกบีบลงเพดาน');
});

test('⑦ 🔒 เกณฑ์ต้องมีแหล่งเดียว — status.mjs ห้ามพิมพ์เลขซ้ำ', () => {

  for (const f of ['netlify/functions/status.mjs', 'netlify/lib/mkp-finance-mirror.mjs']) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /ABS\(formula_diff\) > 2\b/,
      `🔴 ${f} พิมพ์เกณฑ์ซ้ำ ⇒ แก้ที่เดียวแล้วอีกที่นับคนละแบบเงียบ ๆ (กฎ one-threshold-one-source)`);
  }
});
