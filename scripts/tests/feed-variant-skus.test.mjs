// รัน: node --experimental-test-module-mocks --test scripts/tests/feed-variant-skus.test.mjs
// ฟีดต้องนับ "รหัสของตัวเลือกสินค้า" ด้วย — ท่านประธานสั่ง 19 ก.ย. 2569
//
// 🔴 ทำไมถึงสำคัญ: เว็บเราขายหลายแบบในสินค้าเดียว (00073 เลือก "เฉพาะเครื่อง" / "11.8 นิ้ว")
//    แต่ละแบบมีรหัสของตัวเองและ **ตัดสต็อกด้วยรหัสนั้นจริง**
//    ฟีดเดิมส่งแค่รหัสระดับสินค้า ⇒ ตัวตรวจ "ช่องทางที่ลงขาย" มองไม่เห็น 270 รหัส
//    ⇒ รายงานบอกว่าเว็บเราขาด 251 รหัส ทั้งที่ขาดจริง 31
//    ⇒ เกือบไปสร้างสินค้าซ้ำ 220 รายการบนเว็บ ซึ่งแย่กว่าไม่ทำอะไรเลย
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const ฟีด = {
  site: 'https://gucut.com',
  list: [
    { sku: '00073-OnlyMachine', vsku: ['00073-11.8-NW'] },
    { sku: '01209' },                                   // ไม่มีตัวเลือก
    { sku: '00817', vsku: ['00817-22T', '00817-25T'] },
    { sku: 'NOVSKU' },                                  // ฟีดรุ่นเก่าไม่มีช่องนี้เลย
  ],
};
mock.module('../../netlify/lib/site.mjs', { namedExports: { SITE_URL: 'https://gucut.com' } });
globalThis.fetch = async () => ({ ok: true, json: async () => ฟีด });

const { webSkus } = await import('../../netlify/lib/marketplace-listings.mjs');

test('รหัสของตัวเลือกต้องถูกนับว่า "เว็บเราลงขายอยู่"', async () => {
  const got = await webSkus();
  for (const k of ['00073-11.8-NW', '00817-22T', '00817-25T']) {
    assert.ok(got.has(k), `${k} ต้องถูกนับว่าเว็บเราขายอยู่`);
  }
  assert.ok(got.has('01209'), 'รหัสระดับสินค้าต้องยังถูกนับเหมือนเดิม');
  assert.ok(got.has('NOVSKU'), 'ฟีดรุ่นเก่าที่ไม่มีช่อง vsku ต้องยังทำงานได้ ไม่ใช่พัง');
  assert.equal(got.size, 7, 'ต้องได้ครบ 4 รหัสสินค้า + 3 รหัสตัวเลือก');
});

test('ตัวสร้างฟีดต้องไม่เปลี่ยนช่องเดิม — เพิ่มได้อย่างเดียว', async () => {
  /* 🔑 ไฟล์ feed-base.json มีคนใช้ 5 ที่ (products-feed · catalog-feed · feed-health ·
     status · marketplace-listings) การเปลี่ยนความหมายช่องเดิม = พังเงียบหลายที่พร้อมกัน
     ข้อนี้ตรึงไว้ว่า `vsku` เป็นช่อง **เพิ่ม** เท่านั้น */
  const fs = await import('node:fs');
  const src = fs.readFileSync('scripts/gen-feed-base.mjs', 'utf8');
  assert.match(src, /vsku:/, 'ต้องยังมีช่อง vsku');
  assert.match(src, /sku: p\.sku/, 'ช่อง sku เดิมต้องยังอยู่เหมือนเดิม');
  assert.doesNotMatch(src, /sku: \[/, 'ห้ามเปลี่ยน sku เป็นอาร์เรย์ — จะพังทุกที่ที่ใช้อยู่');
});
