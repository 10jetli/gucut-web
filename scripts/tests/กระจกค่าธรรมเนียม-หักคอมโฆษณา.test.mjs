// รัน: node --experimental-test-module-mocks --test scripts/tests/กระจกค่าธรรมเนียม-หักคอมโฆษณา.test.mjs
// ใบ t_mum2bzeg — สูตรยอดโอน Shopee ต่าง 91 ใบ · สาเหตุคือ `order_ams_commission_fee`
//
// 📏 ยืนยันครบ 91/91 ใบ (เปิด escrow ดิบรายใบ · อ่านค่าได้ 91/91 · 4 ต.ค. 2569):
//    |formula_diff − ams| ≤ 1 บาท ใน **87/91 ใบ** · อธิบายได้ **4,571 จาก 4,801 บาท = 95.2%**
// 🔴 และมันหักล้างสมมติฐาน "VAT 7%" ที่ผมฟิตไว้ก่อนหน้า — Shopee มีช่องภาษี 11 ช่อง
//    และ **เป็นศูนย์ทุกช่องทุกใบทั้ง 91 ใบ** ⇒ 7% ที่ปิดได้ 37/91 เป็นความพ้องกันโดยบังเอิญ
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shopeeNet } from '../../netlify/lib/mkp-finance-mirror.mjs';
import { readFileSync } from 'node:fs';

const ฐาน = {
  itemsTotal: 3200, commission: 599, serviceFee: 274, paymentFee: 0,
  shippingActual: 155, shippingSubsidyByShopee: 155, shippingPaidByBuyer: 0,
  sellerTransactionFee: 103,
};

test('① หัก ams ออกจากยอดสุทธิ — ใบจริง 260901VAF3P2PC', () => {
  /* ของจริง: escrow 1767 · ก่อนหัก ams สูตรให้ 2224 (ต่าง 457) · ams = 456 */
  const ก่อน = shopeeNet({ ...ฐาน });
  const หลัง = shopeeNet({ ...ฐาน, amsCommission: 456 });
  assert.equal(ก่อน, 2224, 'สูตรเดิมต้องยังให้ค่าเดิม (กันการแก้ทับของเก่า)');
  assert.equal(หลัง, 1768, 'หลังหัก ams ต้องห่างจาก escrow 1767 เพียง 1 บาท');
  assert.equal(หลัง - 1767, 1, 'เหลือ 1 บาท = ค่าคงเหลือที่สูตรนี้มีอยู่เดิม ไม่ใช่ของใหม่');
});

test('② 🔑 ไม่มี ams ⇒ ต้องคิดได้ปกติ ห้ามคืน null', () => {
  /* ใบที่ไม่ได้ลงโฆษณาจะไม่มีช่องนี้เลย ⇒ ใส่ใน `need` จะทำให้สูตรคืน null ทั้งที่ควรคิดได้ */
  assert.equal(shopeeNet({ ...ฐาน }), 2224);
  assert.equal(shopeeNet({ ...ฐาน, amsCommission: null }), 2224);
  assert.equal(shopeeNet({ ...ฐาน, amsCommission: 0 }), 2224, 'ams 0 ต้องไม่เปลี่ยนผล');
});

test('③ คู่ตรงข้ามของ ②: ช่องที่จำเป็นขาด ⇒ ยังต้องคืน null', () => {
  for (const k of ['itemsTotal', 'commission', 'serviceFee', 'paymentFee', 'shippingActual'])
    assert.equal(shopeeNet({ ...ฐาน, amsCommission: 456, [k]: null }), null,
      `ขาด ${k} ⇒ ต้อง null · ห้ามแทน 0 แล้วคิดต่อ (ได้ diff สวยที่ไม่ได้พิสูจน์อะไร)`);
});

test('④ 🔑 คอลัมน์ · ที่วางค่า ? · ค่าที่ส่งจาก JS ต้องเท่ากันทั้งสามฝั่ง', () => {
  /* 🔴 ด่านนี้มาจากของจริง: ผมเพิ่มคอลัมน์ `ams_commission` และใส่ค่าใน array ครบ
     **แต่ลืมเพิ่ม `?` ในชุด VALUES** ⇒ ค่าทั้ง 20 ตัวจะเลื่อนไปลงคอลัมน์ผิดทั้งแถว
     และ `node --check` ผ่านฉลุยเพราะเป็น SQL ไม่ใช่ JS ⇒ ไม่มีอะไรจับได้นอกจากการนับ */
  const s = readFileSync('netlify/lib/mkp-finance-mirror.mjs', 'utf8');
  const cols = /INSERT INTO shopee_fees \(([^)]*)\)/s.exec(s)[1]
    .replace(/\n/g, ' ').split(',').map((x) => x.trim()).filter(Boolean);
  const ph = /VALUES \(([^)]*)\)\)?/.exec(s)[1];
  const nq = (ph.match(/\?/g) || []).length;
  const vals = /\[r\.order_sn,(.*?)\]\n\s*\);/s.exec(s)[1];
  const nv = 1 + vals.replace(/\n/g, ' ').split(',').map((x) => x.trim()).filter(Boolean).length;
  assert.equal(nq + 1, cols.length, `? มี ${nq} + datetime = ${nq + 1} · คอลัมน์ ${cols.length}`);
  assert.equal(nv + 1, cols.length, `ค่าจาก JS ${nv} + datetime = ${nv + 1} · คอลัมน์ ${cols.length}`);
  assert.ok(cols.includes('ams_commission'), 'ต้องมีคอลัมน์ ams_commission');
});

test('⑤ 🔬 พลังแยกแยะ: ถ้าถอดการหัก ams ออก ด่าน ① ต้องแดง', () => {
  const ไม่หัก = (f) => f.itemsTotal - f.commission - f.serviceFee - (f.sellerTransactionFee ?? 0)
    - f.paymentFee - f.shippingActual + (f.shippingSubsidyByShopee ?? 0) + (f.shippingPaidByBuyer ?? 0);
  assert.notEqual(ไม่หัก({ ...ฐาน, amsCommission: 456 }), 1768,
    'สูตรที่ไม่หัก ams ต้องให้ค่าต่างจากที่ด่าน ① ต้องการ ⇒ ① แดงจริงเมื่อมีคนถอย');
});
