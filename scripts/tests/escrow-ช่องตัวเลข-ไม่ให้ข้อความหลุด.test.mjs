// รัน: node --experimental-test-module-mocks --test scripts/tests/escrow-ช่องตัวเลข-ไม่ให้ข้อความหลุด.test.mjs
// ใบ t_mum2bzeg — ต้องเปิดดู escrow ดิบเพื่อหาว่าส่วนต่าง 2,220 บาทที่เหลือมาจากช่องไหน
//
// 🔒 **ด่านนี้มีไว้กันของหลุด ไม่ใช่กันโค้ดพัง** — escrow ของ Shopee มี `buyer_user_name`
//    ที่อยู่ และเบอร์ · รีโปนี้เป็น public ⇒ ของที่หลุดคือหลุดถาวร
// 🔑 เลือกกรองด้วย **ชนิดข้อมูล** ไม่ใช่รายชื่อช่องห้าม — รายชื่อห้ามจะตกหล่นวันที่ Shopee เพิ่มช่องใหม่
//    ⇒ เทสจึงปลูก "ช่องข้อความชื่อใหม่ที่ไม่มีใน denylist ใด ๆ" เพื่อพิสูจน์ว่ากติกาครอบของที่ยังไม่มี
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escrowช่องตัวเลข } from '../../netlify/lib/mkp-finance.mjs';

const ปลอม = (inc) => async () => ({ response: { order_income: inc } });

test('① คืนค่าเฉพาะช่องตัวเลข — ช่องข้อความคืนแค่ชื่อ', async () => {
  const r = await escrowช่องตัวเลข('260901VAF3P2PC', {
    shopee: ปลอม({ escrow_amount: 1767, commission_fee: 599, buyer_user_name: 'สมชาย ใจดี' }),
  });
  assert.equal(r['ช่องตัวเลข'].escrow_amount, 1767);
  assert.equal(r['ช่องตัวเลข'].commission_fee, 599);
  assert.ok(!('buyer_user_name' in r['ช่องตัวเลข']), '🔴 ชื่อผู้ซื้ออยู่ในกองที่คืนค่า');
  assert.deepEqual(r['ช่องที่เป็นข้อความ (คืนแค่ชื่อ)'], ['buyer_user_name']);
});

test('② 🔒 ชื่อผู้ซื้อต้องไม่ปรากฏใน JSON ทั้งก้อน — ตรวจที่สตริงสุดท้าย', async () => {
  const r = await escrowช่องตัวเลข('260901VAF3P2PC', {
    shopee: ปลอม({
      escrow_amount: 1767,
      buyer_user_name: 'สมชาย ใจดี',
      buyer_address: '81 หมู่ 11 ต.ค่ายบกหวาน',
      buyer_phone: '0812345678',
      recipient_email: 'a@b.com',
    }),
  });
  const ก้อน = JSON.stringify(r);
  for (const ห้าม of ['สมชาย', 'ใจดี', '81 หมู่ 11', '0812345678', 'a@b.com'])
    assert.ok(!ก้อน.includes(ห้าม), `🔴 "${ห้าม}" หลุดออกมาในคำตอบ`);
});

test('③ 🔬 ช่องข้อความ **ชื่อใหม่ที่ยังไม่มีใครรู้จัก** ต้องถูกกันด้วย', async () => {
  /* นี่คือเหตุที่เลือกกรองด้วยชนิดข้อมูล — รายชื่อช่องห้ามจะไม่มีชื่อนี้อยู่
     ⇒ ถ้าวันหนึ่งใครเปลี่ยนไปใช้ denylist ด่านข้อนี้จะแดง */
  const r = await escrowช่องตัวเลข('260901VAF3P2PC', {
    shopee: ปลอม({ escrow_amount: 1, ช่องที่Shopeeเพิ่งเพิ่มปีหน้า: 'ข้อมูลอ่อนไหวอะไรก็ไม่รู้' }),
  });
  assert.ok(!JSON.stringify(r).includes('อ่อนไหว'), '🔴 ช่องข้อความชื่อใหม่หลุด ⇒ กติกาไม่ครอบของที่ยังไม่มี');
  assert.ok(r['ช่องที่เป็นข้อความ (คืนแค่ชื่อ)'].includes('ช่องที่Shopeeเพิ่งเพิ่มปีหน้า'));
});

test('④ คู่ตรงข้ามของข้อ ③: ช่องตัวเลขชื่อใหม่ **ต้องคืนค่า** (ไม่ใช่กันหมดทุกอย่าง)', async () => {
  const r = await escrowช่องตัวเลข('260901VAF3P2PC', {
    shopee: ปลอม({ escrow_amount: 1, ภาษีมูลค่าเพิ่มที่เพิ่งโผล่: 68.32 }),
  });
  assert.equal(r['ช่องตัวเลข']['ภาษีมูลค่าเพิ่มที่เพิ่งโผล่'], 68.32,
    '🔴 ด่านกว้างเกิน — กันช่องตัวเลขที่เป็นคำตอบของงานนี้ไปด้วย');
  assert.ok(r['ชื่อช่องที่เข้าข่ายภาษี'].includes('ภาษีมูลค่าเพิ่มที่เพิ่งโผล่'));
});

test('⑤ ไม่เจอก้อน order_income ต้องบอกว่าโครงเปลี่ยน ไม่ใช่ตอบว่าไม่มีช่องภาษี', async () => {
  const r = await escrowช่องตัวเลข('260901VAF3P2PC', { shopee: async () => ({ response: {} }) });
  assert.equal(r.found, false);
  assert.match(r.note, /order_income/, 'ต้องแยก "โครงเปลี่ยน" ออกจาก "ไม่มีช่องที่หา"');
});

test('⑥ order_sn ที่รูปผิด ต้องตีกลับก่อนยิงออกไปข้างนอก', async () => {
  let ยิงไปแล้ว = false;
  const r = await escrowช่องตัวเลข('a b;drop', { shopee: async () => { ยิงไปแล้ว = true; return {}; } });
  assert.equal(r.ok, false);
  assert.equal(ยิงไปแล้ว, false, '🔴 ยิงออกไปก่อนตรวจรูป = จ่ายค่าเรียกฟรีและพาค่าแปลก ๆ ออกนอกบ้าน');
});

test('⑦ คำตอบต้องบอกวิธีอ่านผล — "ไม่เจอ ≠ ไม่มี"', async () => {
  const r = await escrowช่องตัวเลข('260901VAF3P2PC', { shopee: ปลอม({ escrow_amount: 1 }) });
  assert.match(r['⚠️ อ่านผลยังไง'], /ไม่ได้แปลว่าไม่มี/,
    'ด่านนี้ตอบได้แค่ "ชื่อช่องที่มี" ⇒ ต้องเขียนขอบเขตไปกับคำตอบ ไม่ใช่ปล่อยให้คนสรุปเกิน');
});
