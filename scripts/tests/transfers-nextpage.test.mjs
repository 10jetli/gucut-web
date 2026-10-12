// รัน: node --experimental-test-module-mocks --test scripts/tests/transfers-nextpage.test.mjs
/* 🔴 ด่าน B23: `syncTransfers` — ทางออกที่แปลว่า "ครบแล้ว" ต้องคืน `nextPage: null`
 *    ใบ t_mv4usntc · 12 ต.ค. 2569
 *
 * การ์ดชี้ `core-purchases.mjs:278–284` ⇒ **จุดนั้นแก้ไปแล้ว 4 ต.ค.** (ย้ายไปใช้ `zort-pages.mjs`)
 * แต่ **ตัว `nextPage` ยังพลาดอยู่**: มันถูกตั้ง `page + 1` ตอนท้ายรอบก่อน
 * ⇒ `break` เฉย ๆ = คืนเลขหน้าค้าง ⇒ สัญญาของฟังก์ชันเอง ("ไม่ null = ยังกวาดไม่หมด") เป็นเท็จ
 * ⇒ ⇒ และชีพจรใช้ค่านี้ตัดสิน: `nextPage ? "partial" : "ok"`
 *     ⇒ **รอบที่กวาดครบจริงถูกจด `partial` ตลอดกาล** ⇒ จอเหลืองลวงถาวร
 *     และ `core-sync.mjs` เรียกแบบไม่วนต่อ ⇒ ไม่มีวันได้ `ok`
 *
 * 🔑 บั๊กตัวเดียวกัน `core-contacts.mjs` แก้ไปแล้ว 15 ก.ย. 2569 พร้อมคอมเมนต์อธิบายเหตุครบ
 *    — แต่แก้ที่ฝาแฝดข้างเดียว ([[twins-fixed-on-different-days-are-not-equal]])
 *
 * ⚠️ เทสนี้ขับ **ลูปจริง** (ZORT ปลอม · D1 ปลอม) ไม่ประกอบผลด้วยมือ — กฎ test-must-hit-the-path
 *    ที่สำคัญคือ **ตรวจชีพจรที่ถูกเขียนลงฐาน** ด้วย ไม่ใช่ตรวจแค่ค่าที่คืนให้ผู้เรียก
 *    เพราะของที่จอเห็นคือชีพจร ไม่ใช่ค่าที่คืน
 *
 * 📏 พลังแยกแยะ — **วัดจริง 12 ต.ค. 2569** (ของดี = ผ่าน 7 ตก 0 · ปลูกคืนสภาพบั๊กเดิมทีละทาง
 *    และยืนยันว่าไฟล์ยังโหลดได้ทุกครั้ง):
 *      หน้าว่าง: `break` ไม่ล้าง `nextPage`        ⇒ ตก 1
 *      หน้าสั้น/ใบเก่า: `break` ไม่ล้าง            ⇒ **ตก 3**
 *      ล้าง `nextPage` ทุกทาง (รวมทางชนเพดาน)     ⇒ **ตก 2**  ← ทิศกลับ
 *    🔑 ท่าที่สามสำคัญไม่น้อยกว่าสองท่าแรก: มันพิสูจน์ว่าเทสนี้ **ไม่ได้ยอมรับ `null` ทุกกรณี**
 *       ถ้ายอมรับ การ "แก้" ด้วยการล้างทุกทางจะผ่านฉลุย แล้วกวาดไม่ครบตลอดกาลอย่างเงียบ ๆ
 */
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

/* ⚠️ `markSync` ส่งค่าชีพจรมาใน **ตัวแปรผูก (binds)** ไม่ใช่ในสตริง SQL
   ⇒ ตัวปลอมที่จดแต่ `sql` จะมองไม่เห็นค่าเลย แล้วทุกรอบจะอ่านได้ว่า "(ไม่เจอ)"
      ซึ่งหน้าตาเหมือน "ไม่ได้เขียนชีพจร" ทั้งที่เขียนแล้ว ⇒ จดทั้งคู่ (เจอจริงตอนเขียนเทสนี้) */
let calls = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, binds) => { calls.push({ sql: String(sql), binds: binds ?? null }); return []; },
} });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';

const วันนี้ = () => new Date().toISOString().slice(0, 10);
const ใบ = (n, { date = วันนี้() } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `T${date}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    number: `TF-${i}`, transferdate: date, status: 'done',
    fromwarehousecode: 'NEW', towarehousecode: 'KLD',
  }));

/** หน้าปลอม: `หน้า` = อาร์เรย์ของรายการต่อหน้า (index 0 = หน้า 1) */
let หน้า = [];
globalThis.fetch = async (url) => {
  const m = String(url).match(/page=(\d+)/);
  const i = Number(m?.[1] ?? 1) - 1;
  return { ok: true, status: 200, json: async () => ({ list: หน้า[i] ?? [] }) };
};

const { syncTransfers } = await import('../../netlify/lib/core-purchases.mjs');
/** ค่าชีพจรที่ **ถูกเขียนลงฐานจริง** — `null` = ไม่ได้เขียนเลย (คนละเรื่องกับเขียนว่า ok) */
const ชีพจร = () => {
  const c = calls.filter((x) => /INSERT INTO core_meta/.test(x.sql)
    && String(x.binds?.[0] ?? '').startsWith('sync_transfers'));
  return c.length ? String(c[c.length - 1].binds?.[1] ?? '') : null;
};
const รัน = async (opt) => { calls = []; return syncTransfers(3650, opt); };

test('🔑 หน้าสั้นกว่าเพดาน = ครบแล้ว ⇒ nextPage ต้องเป็น null', async () => {
  หน้า = [ใบ(200), ใบ(7)];
  const r = await รัน({ maxPages: 6 });
  assert.equal(r.nextPage, null,
    'หน้า 2 สั้น = ครบ — คืนเลขหน้าค้าง ⇒ ผู้เรียกเข้าใจว่ายังไม่ครบ และชีพจรถูกจด partial');
  assert.equal(r.fetched, 207, 'ต้องได้ของจากทั้งสองหน้า (พิสูจน์ว่าลูปเดินจริง ไม่ได้ break ก่อน)');
});

test('🔑 หน้าว่างเปล่า = ครบแล้ว ⇒ nextPage ต้องเป็น null', async () => {
  หน้า = [ใบ(200), []];
  const r = await รัน({ maxPages: 6 });
  assert.equal(r.nextPage, null, 'หน้า 2 ว่าง = ครบ');
  assert.equal(r.fetched, 200);
});

test('🔑 เจอใบเก่ากว่าช่วงที่ขอ = ครบแล้ว ⇒ nextPage ต้องเป็น null', async () => {
  หน้า = [ใบ(200), ใบ(200, { date: '2001-01-01' })];
  calls = [];
  const r = await syncTransfers(30, { maxPages: 6 });   // ขอย้อน 30 วัน
  assert.equal(r.nextPage, null, 'เจอใบเก่า = เลยช่วงที่ขอ = ครบ');
});

test('🔑 พลังแยกแยะ: **ชนเพดาน maxPages ⇒ nextPage ต้องไม่ null**', async () => {
  หน้า = [ใบ(200), ใบ(200), ใบ(200)];
  const r = await รัน({ maxPages: 2 });
  assert.equal(r.nextPage, 3,
    'ยังมีต่อแต่หมดงบรอบนี้ ⇒ ต้องบอกหน้าถัดไป — ถ้าล้างเป็น null ตรงนี้ด้วย จะกวาดไม่ครบตลอดกาล');
  assert.equal(ชีพจร(), 'partial', 'รอบที่ยังไม่หมดต้องจดชีพจรเป็น partial');
});

test('🔴 ชีพจรของรอบที่ครบจริง ต้องเป็น "ok" ไม่ใช่ "partial" (นี่คืออาการที่จอเห็น)', async () => {
  หน้า = [ใบ(200), ใบ(3)];
  const r = await รัน({ maxPages: 6 });
  assert.equal(r.nextPage, null);
  assert.equal(ชีพจร(), 'ok',
    'จอดูชีพจร ไม่ได้ดูค่าที่คืน ⇒ partial ในรอบที่ครบ = เหลืองลวงถาวร');
});

test('ไม่มีใบเลยทั้งรอบ ⇒ nextPage null + ชีพจร ok (ไปดู ZORT สำเร็จ แต่ไม่มีของใหม่)', async () => {
  หน้า = [[]];
  const r = await รัน({ maxPages: 6 });
  assert.equal(r.nextPage, null);
  assert.equal(r.fetched, 0);
  assert.equal(ชีพจร(), 'ok', 'ไม่เขียนชีพจร = จอเห็นเวลาเก่าค้างแล้วเตือนว่าซิงก์ตาย (แดงลวง)');
});

test('startPage ต่อจากรอบก่อนได้ และเลขหน้าถัดไปนับจาก startPage ไม่ใช่จาก 1', async () => {
  หน้า = [ใบ(200), ใบ(200), ใบ(200), ใบ(200), ใบ(9)];
  const r = await รัน({ startPage: 3, maxPages: 2 });
  assert.equal(r.startPage, 3);
  assert.equal(r.nextPage, 5, 'อ่านหน้า 3-4 เต็มทั้งคู่ ⇒ หน้าถัดไปคือ 5');
});
