/* รัน: node --experimental-test-module-mocks --test scripts/tests/registry-import-guard.test.mjs
 *
 * ด่าน: `registryImport` **ลบทั้งล็อตแล้วเขียนใหม่** ⇒ ข้อมูลที่ส่งมาไม่ครบ = ลบของจริงทิ้ง
 *
 * 🔴 ที่มา 10 ต.ค. 2569 — ฝั่งจอเขียนตัวแปลงชีท→D1 เสร็จ และกติกาของมัน (ถูกตามคำสั่งท่าน
 *    25 ก.ย.) คือ *"ช่องบุคคลไม่มีคอลัมน์ ⇒ ปล่อยว่าง ห้ามเติมเอง"*
 *    ⇒ แต่พอมาเจอเส้นที่ **ลบทั้งล็อตแล้วเขียนใหม่** ⇒ แถวที่ขายไปแล้วจะถูกเขียนทับด้วยค่าว่าง
 *    ⇒ **ลบหลักฐานการจำหน่ายตามกฎหมาย ทั้งที่ทุกคนทำตามคำสั่งครบทุกข้อ**
 *    📏 วัดวันนี้: ทะเบียน 311 แถว · เหลือ 187 ⇒ **124 แถวถือข้อมูลการจำหน่ายอยู่**
 *
 * 🔑 ข้อที่เทสนี้ต้องแยกแยะให้ได้ (ไม่ใช่ "มีด่าน"):
 *    ① ข้อมูลใหม่ไม่มีช่องบุคคล + ของเดิมมี ⇒ **ไม่ลบ ไม่เขียน** (ต้องไม่มี DELETE หลุดไปเลย)
 *    ② ของเดิม **ไม่มี** ข้อมูลบุคคล ⇒ นำเข้าได้ตามปกติ (ตัวควบคุมบวก — ด่านต้องไม่ขวางของที่ถูก)
 *    ③ ข้อมูลใหม่ **มี** ช่องบุคคลมาด้วย ⇒ นำเข้าได้ แม้ของเดิมจะมี
 *    ④ อ่านของเดิมไม่ได้ ⇒ **ไม่ลบ** (ไม่รู้ ≠ ไม่มี) — ฐานเทียบที่อ่านไม่ได้กันการลบไม่ได้
 *    ⑤ `allowClearSaleData:true` ⇒ ล้างได้ (ต้องเป็นการกดอีกครั้งโดยตั้งใจ)
 */
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let sqls = [];
/** แถวเดิมที่ **ถือข้อมูลการจำหน่ายอยู่** — รูปเดียวกับที่ฐานตอบ: lot · serial · บูลีนรายช่อง
 *  🔒 ไม่มีค่าจริงของชื่อ/เลข ลซ.๒/จังหวัด แม้ในฟิกซ์เจอร์ — ด่านไม่ต้องรู้ค่าเพื่อทำงาน */
let แถวเดิม = [];
let อ่านเดิมพัง = false;

mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => {
    const s = String(sql);
    sqls.push(s);
    if (/FROM registry WHERE lot IN/.test(s)) {
      if (อ่านเดิมพัง) throw new Error('D1 ล่ม');
      return แถวเดิม;
    }
    return [];
  },
} });

const { registryImport } = await import('../../netlify/lib/core-registry.mjs');

const ตั้งต้น = () => { sqls = []; อ่านเดิมพัง = false; แถวเดิม = []; };
const ลบ = () => sqls.filter((s) => /^\s*DELETE FROM registry/.test(s));
const เขียน = () => sqls.filter((s) => /INSERT INTO registry/.test(s));
/** แถวเดิมหนึ่งแถวที่ขายไปแล้ว (ถือครบทั้งห้าช่อง) */
const เดิมขายแล้ว = (lot, serial) => ({ lot, serial,
  มี_sold_at: 1, มี_buyer: 1, มี_lz2: 1, มี_lz2_date: 1, มี_province: 1 });
/** แถวใหม่: ของยังไม่ขาย (ช่องจำหน่ายว่างโดยถูกต้อง) */
const ใหม่ยังไม่ขาย = (lot, serial) => ({ lot, serial, kind: 'bar', seq: 1, spec: 'NEWWAVE 22' });
/** แถวใหม่: ของที่ขายแล้ว ส่งข้อมูลจำหน่ายมาครบ */
const ใหม่ขายแล้ว = (lot, serial) => ({ ...ใหม่ยังไม่ขาย(lot, serial),
  sold_at: '2026-10-07', buyer: 'ปิดไว้', lz2: 'ตร.99/2569', lz2_date: '2026-10-07', province: 'ปิดไว้' });

test('🔴 รูที่ฝั่งจอจับได้: ส่งข้อมูลจำหน่ายมาครบแค่บางแถว ⇒ ต้องตีกลับ (เกณฑ์รายช่องจับไม่ได้)', async () => {
  ตั้งต้น();
  /* ของเดิม 3 แถวขายแล้ว · ของใหม่ส่งข้อมูลมาครบแค่แถวเดียว
     ⇒ เกณฑ์เก่า (`rows.some(sold_at)`) จะ **ผ่าน** แล้วล้างอีกสองแถว */
  แถวเดิม = [เดิมขายแล้ว(2, 'A1'), เดิมขายแล้ว(2, 'A2'), เดิมขายแล้ว(2, 'A3')];
  const r = await registryImport([ใหม่ขายแล้ว(2, 'A1'), ใหม่ยังไม่ขาย(2, 'A2'), ใหม่ยังไม่ขาย(2, 'A3')]);
  assert.equal(r.ok, false);
  assert.equal(r.จะลบข้อมูลจำหน่าย, true);
  assert.equal(r.แถวที่จะเสียหาย, 2, 'ต้องนับรายแถว — A2 กับ A3');
  assert.deepEqual(r.ตัวอย่าง.map((x) => x.serial), ['A2', 'A3']);
  assert.deepEqual(r.ตัวอย่าง[0].ช่องที่จะหาย,
    ['sold_at', 'buyer', 'lz2', 'lz2_date', 'province']);
  assert.equal(ลบ().length, 0, 'ห้ามลบอะไรเลย');
  assert.equal(เขียน().length, 0);
});

test('🔴 แถวเดิมที่หายไปทั้งแถวจาก CSV ⇒ ต้องตีกลับ และนับแยกให้เห็น', async () => {
  ตั้งต้น();
  แถวเดิม = [เดิมขายแล้ว(2, 'A1'), เดิมขายแล้ว(2, 'A2')];
  const r = await registryImport([ใหม่ขายแล้ว(2, 'A1')]);   /* A2 ไม่ได้ส่งมาเลย */
  assert.equal(r.ok, false);
  assert.equal(r.แถวที่จะเสียหาย, 1);
  assert.equal(r.แถวที่หายไปทั้งแถว, 1, 'แยกให้เห็นว่าเป็น "หายทั้งแถว" ไม่ใช่ "ขาดบางช่อง"');
  assert.equal(ลบ().length, 0);
});

test('✅ ตัวควบคุมบวก ① — ของยังไม่ขายว่างอยู่โดยถูกต้อง ⇒ ต้องไม่ถูกขวาง', async () => {
  ตั้งต้น();
  แถวเดิม = [];                       /* ไม่มีแถวเดิมไหนถือข้อมูลจำหน่าย */
  const r = await registryImport([ใหม่ยังไม่ขาย(2, 'A1'), ใหม่ยังไม่ขาย(2, 'A2')]);
  assert.equal(r.ok, true, 'ด่านต้องไม่เรียกร้องว่าทุกแถวต้องมีข้อมูลจำหน่าย');
  assert.equal(r.rows, 2);
  assert.equal(ลบ().length, 1);
});

test('✅ ตัวควบคุมบวก ② — ส่งข้อมูลจำหน่ายมาครบทุกแถวที่ของเดิมมี ⇒ ผ่าน', async () => {
  ตั้งต้น();
  แถวเดิม = [เดิมขายแล้ว(2, 'A1'), เดิมขายแล้ว(2, 'A2')];
  const r = await registryImport([ใหม่ขายแล้ว(2, 'A1'), ใหม่ขายแล้ว(2, 'A2'), ใหม่ยังไม่ขาย(2, 'A3')]);
  assert.equal(r.ok, true);
  assert.equal(r.rows, 3);
  assert.equal(เขียน().length, 1);
});

test('🔑 คีย์ต้องเป็น (lot, serial) ห้ามใช้ serial เดี่ยว — ฝั่งจอวัดว่าซ้ำข้ามล็อต 69 ตัว', async () => {
  ตั้งต้น();
  /* serial เดียวกันอยู่สองล็อต · ของใหม่ส่งข้อมูลครบมาเฉพาะล็อต 2
     ⇒ ถ้าจับคู่ด้วย serial เดี่ยว ล็อต 4 จะดูเหมือนมีข้อมูลครบแล้ว ⇒ หลุด */
  แถวเดิม = [เดิมขายแล้ว(2, 'ซ้ำ'), เดิมขายแล้ว(4, 'ซ้ำ')];
  const r = await registryImport([ใหม่ขายแล้ว(2, 'ซ้ำ'), ใหม่ยังไม่ขาย(4, 'ซ้ำ')]);
  assert.equal(r.ok, false);
  assert.equal(r.แถวที่จะเสียหาย, 1);
  assert.equal(r.ตัวอย่าง[0].lot, 4, 'ต้องชี้ล็อต 4 ไม่ใช่ล็อต 2');
  assert.equal(ลบ().length, 0);
});

test('🔴 อ่านของเดิมไม่ได้ ⇒ ไม่ลบ (ไม่รู้ ≠ ไม่มี) ทั้งกรณี throw และกรณีตอบรูปที่อ่านไม่ออก', async () => {
  ตั้งต้น();
  อ่านเดิมพัง = true;
  const r = await registryImport([ใหม่ขายแล้ว(2, 'A1')]);
  assert.equal(r.ok, false);
  assert.equal(r.unknown, true);
  assert.equal(ลบ().length, 0);
  ตั้งต้น();
  แถวเดิม = null;
  const r2 = await registryImport([ใหม่ขายแล้ว(2, 'A1')]);
  assert.equal(r2.ok, false);
  assert.equal(r2.unknown, true);
  assert.equal(ลบ().length, 0);
});

test('🔒 คำสั่งที่ยิงไปฐานต้องอ่านมาเป็นบูลีน ไม่ดึงค่าจริงของข้อมูลบุคคล', async () => {
  ตั้งต้น();
  แถวเดิม = [];
  await registryImport([ใหม่ยังไม่ขาย(2, 'A1')]);
  const อ่าน = sqls.find((s) => /FROM registry WHERE lot IN/.test(s));
  assert.ok(อ่าน, 'ต้องมีการอ่านของเดิมก่อนเสมอ');
  assert.match(อ่าน, /AS มี_buyer/, 'ต้องแปลงเป็นบูลีน');
  assert.doesNotMatch(อ่าน, /SELECT[^]*?\bbuyer\b\s*(,|FROM)/, 'ห้าม SELECT ค่าจริงของ buyer');
});

test('⑤ allowClearSaleData:true ⇒ ล้างได้ และต้องไม่ไปอ่านของเดิมเลย (ตั้งใจล้าง)', async () => {
  ตั้งต้น();
  แถวเดิม = [เดิมขายแล้ว(2, 'A1')];
  const r = await registryImport([ใหม่ยังไม่ขาย(2, 'A1')], { allowClearSaleData: true });
  assert.equal(r.ok, true);
  assert.equal(ลบ().length, 1);
  assert.equal(sqls.filter((s) => /FROM registry WHERE lot IN/.test(s)).length, 0);
});

test('เส้น ?registryimport= ต้องรับ allowClearSaleData จาก body เท่านั้น', async () => {
  const src = (await import('node:fs')).readFileSync('netlify/functions/core.mjs', 'utf8');
  const เรียก = src.split('\n').filter((l) => /registryImport\(/.test(l) && !/^\s*(\/\*|\*|\/\/)/.test(l));
  assert.equal(เรียก.length, 1, `ต้องมีจุดเรียก registryImport จุดเดียวในเส้น ได้ ${เรียก.length}`);
  assert.match(เรียก[0], /allowClearSaleData:\s*body\.allowClearSaleData === true/,
    'ต้องมาจาก body และเทียบ === true (ห้ามรับสตริง "false" เป็นจริง)');
});
