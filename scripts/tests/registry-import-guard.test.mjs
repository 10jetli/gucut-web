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
let แถวเดิมที่มีข้อมูลจำหน่าย = [];   /* รูปที่ฐานตอบกลับจาก SELECT ... GROUP BY lot */
let อ่านเดิมพัง = false;

mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => {
    const s = String(sql);
    sqls.push(s);
    if (/FROM registry WHERE lot IN/.test(s)) {
      if (อ่านเดิมพัง) throw new Error('D1 ล่ม');
      return แถวเดิมที่มีข้อมูลจำหน่าย;
    }
    return [];
  },
} });

const { registryImport } = await import('../../netlify/lib/core-registry.mjs');

const ตั้งต้น = () => { sqls = []; อ่านเดิมพัง = false; แถวเดิมที่มีข้อมูลจำหน่าย = []; };
const ลบ = () => sqls.filter((s) => /^\s*DELETE FROM registry/.test(s));
const เขียน = () => sqls.filter((s) => /INSERT INTO registry/.test(s));
/* แถวที่ไม่มีช่องบุคคลเลย — รูปเดียวกับที่ตัวแปลงชีทของฝั่งจอจะส่งมา */
const แถวไม่มีบุคคล = [{ lot: 2, kind: 'bar', serial: '45-7-66-00001', seq: 1, spec: 'NEWWAVE 22', model: '22' }];
const แถวมีบุคคลครบ = [{ ...แถวไม่มีบุคคล[0], sold_at: '2026-10-07', buyer: 'ปิดไว้',
  lz2: 'ตร.99/2569', lz2_date: '2026-10-07', province: 'ปิดไว้' }];
/* ส่งมาบางช่อง (ขาด lz2_date · province) — ด่านต้องตรวจ **เฉพาะช่องที่ขาด** ไม่ใช่เหมาทั้งห้า */
const แถวมีบุคคลบางช่อง = [{ ...แถวไม่มีบุคคล[0], sold_at: '2026-10-07', buyer: 'ปิดไว้', lz2: 'ตร.99/2569' }];

test('① ของใหม่ไม่มีช่องบุคคล + ของเดิมมี ⇒ ตีกลับ ไม่ลบ ไม่เขียน', async () => {
  ตั้งต้น();
  แถวเดิมที่มีข้อมูลจำหน่าย = [{ lot: 2, n: 17 }];
  const r = await registryImport(แถวไม่มีบุคคล);
  assert.equal(r.ok, false);
  assert.equal(r.จะลบข้อมูลจำหน่าย, true);
  assert.deepEqual(r.รายล็อต, [{ lot: 2, แถวที่มีข้อมูลจำหน่าย: 17 }]);
  assert.match(r.error, /ลบหลักฐานการจำหน่าย/);
  assert.match(r.error, /allowClearSaleData/, 'ต้องบอกทางออกที่ตั้งใจ ไม่ใช่แค่ปฏิเสธ');
  /* 🔑 ข้อที่สำคัญที่สุด: ห้ามมี DELETE หลุดไปแม้คำสั่งเดียว — ลบแล้วกู้ไม่ได้ */
  assert.equal(ลบ().length, 0, 'ห้ามลบอะไรเลย');
  assert.equal(เขียน().length, 0, 'ห้ามเขียนอะไรเลย');
});

test('② ตัวควบคุมบวก — ของเดิมไม่มีข้อมูลบุคคล ⇒ นำเข้าได้ปกติ', async () => {
  ตั้งต้น();
  แถวเดิมที่มีข้อมูลจำหน่าย = [];          /* ไม่มีแถวไหนถือข้อมูลการจำหน่าย */
  const r = await registryImport(แถวไม่มีบุคคล);
  assert.equal(r.ok, true);
  assert.equal(r.rows, 1);
  assert.equal(ลบ().length, 1, 'ล็อตเดียว ⇒ ลบหนึ่งคำสั่ง');
  assert.equal(เขียน().length, 1);
});

test('③ ของใหม่มีช่องบุคคลครบ ⇒ นำเข้าได้ แม้ของเดิมจะมีข้อมูลอยู่ · และไม่ต้องไปถามฐานเลย', async () => {
  ตั้งต้น();
  แถวเดิมที่มีข้อมูลจำหน่าย = [{ lot: 2, n: 17 }];
  const r = await registryImport(แถวมีบุคคลครบ);
  assert.equal(r.ok, true);
  assert.equal(เขียน().length, 1);
  /* ⚠️ ข้อมูลครบ ⇒ ไม่มีช่องที่ขาด ⇒ ด่านต้องไม่เสียคำขอไปถามฐานฟรี ๆ ทุกรอบ */
  assert.equal(sqls.filter((s) => /FROM registry WHERE lot IN/.test(s)).length, 0);
});

test('③ ข ส่งมาบางช่อง ⇒ ด่านต้องตรวจ **เฉพาะช่องที่ขาด** ไม่ใช่เหมาทั้งห้า', async () => {
  /* 🔑 ตัวควบคุมที่กันด่านจาก "ร้องใส่ของปกติ": ของเดิมมีเฉพาะ sold_at ซึ่งของใหม่ก็ส่งมา
     ⇒ ไม่มีอะไรจะหาย ⇒ ต้องปล่อยผ่าน · ถ้าด่านเทียบทั้งห้าช่อง ข้อนี้จะแดง */
  ตั้งต้น();
  แถวเดิมที่มีข้อมูลจำหน่าย = [];        /* ไม่มีแถวใดถือ lz2_date/province */
  const ผ่าน = await registryImport(แถวมีบุคคลบางช่อง);
  assert.equal(ผ่าน.ok, true, 'ช่องที่ขาดไม่มีของเดิมถืออยู่ ⇒ ต้องนำเข้าได้');
  const ถาม = sqls.filter((s) => /FROM registry WHERE lot IN/.test(s));
  assert.equal(ถาม.length, 1, 'ยังต้องไปถามฐาน เพราะมีช่องที่ขาด');
  assert.match(ถาม[0], /lz2_date/);
  assert.match(ถาม[0], /province/);
  assert.doesNotMatch(ถาม[0], /sold_at/, 'ช่องที่ส่งมาแล้วต้องไม่ถูกเอาไปเทียบ');

  /* และถ้าของเดิม **มี** ของในช่องที่ขาด ⇒ ต้องตีกลับ */
  ตั้งต้น();
  แถวเดิมที่มีข้อมูลจำหน่าย = [{ lot: 2, n: 3 }];
  const ตีกลับ = await registryImport(แถวมีบุคคลบางช่อง);
  assert.equal(ตีกลับ.ok, false);
  assert.deepEqual(ตีกลับ.ช่องที่ไม่ได้ส่งมา, ['lz2_date', 'province']);
  assert.equal(ลบ().length, 0);
});

test('④ อ่านของเดิมไม่ได้ ⇒ ไม่ลบ (ไม่รู้ ≠ ไม่มี)', async () => {
  ตั้งต้น();
  อ่านเดิมพัง = true;
  const r = await registryImport(แถวไม่มีบุคคล);
  assert.equal(r.ok, false);
  assert.equal(r.unknown, true, 'ต้องบอกว่า "ยังไม่รู้" ไม่ใช่ "ไม่ผ่าน"');
  assert.equal(ลบ().length, 0);
  /* และถ้าฐานตอบรูปที่อ่านไม่ออก (ไม่ใช่อาร์เรย์) ก็ต้องไม่ลบเหมือนกัน */
  ตั้งต้น();
  แถวเดิมที่มีข้อมูลจำหน่าย = null;
  const r2 = await registryImport(แถวไม่มีบุคคล);
  assert.equal(r2.ok, false);
  assert.equal(r2.unknown, true);
  assert.equal(ลบ().length, 0);
});

test('⑤ allowClearSaleData:true ⇒ ล้างได้ (การกดอีกครั้งโดยตั้งใจ)', async () => {
  ตั้งต้น();
  แถวเดิมที่มีข้อมูลจำหน่าย = [{ lot: 2, n: 17 }];
  const r = await registryImport(แถวไม่มีบุคคล, { allowClearSaleData: true });
  assert.equal(r.ok, true);
  assert.equal(ลบ().length, 1);
  assert.equal(เขียน().length, 1);
});

test('เส้น ?registryimport= ต้องรับ allowClearSaleData จาก body เท่านั้น', async () => {
  const src = (await import('node:fs')).readFileSync('netlify/functions/core.mjs', 'utf8');
  /* 🔑 ตรวจ **บรรทัดที่เรียกฟังก์ชัน** ไม่ใช่ทั้งท่อน — ท่อนนั้นมีคอมเมนต์ที่เขียนคำว่า
     `allowClearSaleData:true` ไว้เพื่ออธิบายทางออก ⇒ ตะแกรงที่อ่านดิบจะจับคำอธิบายของตัวเอง
     แล้วแดงลวง (เจอกับตัวเองรอบแรกของเทสนี้) */
  const เรียก = src.split('\n').filter((l) => /registryImport\(/.test(l) && !/^\s*(\/\*|\*|\/\/)/.test(l));
  assert.equal(เรียก.length, 1, `ต้องมีจุดเรียก registryImport จุดเดียวในเส้น ได้ ${เรียก.length}`);
  assert.match(เรียก[0], /allowClearSaleData:\s*body\.allowClearSaleData === true/,
    'ต้องมาจาก body และเทียบ === true (ห้ามรับสตริง "false" เป็นจริง)');
});
