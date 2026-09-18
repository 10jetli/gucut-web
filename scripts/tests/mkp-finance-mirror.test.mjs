import { test } from "node:test";
import assert from "node:assert/strict";
import { shopeeNet } from "../../netlify/lib/mkp-finance-mirror.mjs";

/* ใบจริงที่วัดไว้ 18 ก.ย. 2569 (สูตรต่างจาก escrow ที่ Shopee บอกแค่ 1 บาท) */
const ใบจริง = {
  itemsTotal: 6500, commission: 325, serviceFee: 208, sellerTransactionFee: 0,
  paymentFee: 0, shippingActual: 90, shippingSubsidyByShopee: 60, shippingPaidByBuyer: 30,
  voucherByShopee: 100, escrowAmount: 6067,
};

test("สูตรที่วัดแล้ว: ให้ผลตรงกับที่คำนวณด้วยมือ", () => {
  // 6500 − 325 − 208 − 0 − 0 − 90 + 60 + 30 = 5967
  assert.equal(shopeeNet(ใบจริง), 5967);
});

/* 🔴 ข้อสำคัญที่สุดของไฟล์นี้ — voucher ของ Shopee ห้ามถูกบวกเข้ายอด
   วัดแล้ว: บวกเข้าไป ⇒ ต่างจาก escrow 47 · 124 · 160 · 55 บาท (ผิดชัดเจน)
   เทสนี้จะแดงทันทีถ้าใครเผลอเอา voucherByShopee เข้าสูตร */
test("voucherByShopee ต้องไม่ถูกบวกเข้ายอดสุทธิ", () => {
  const มี = shopeeNet(ใบจริง);
  const ไม่มี = shopeeNet({ ...ใบจริง, voucherByShopee: null });
  assert.equal(มี, ไม่มี, "ผลต้องไม่เปลี่ยนเลยเมื่อ voucherByShopee หายไป");
});

test("voucherBySeller ก็ต้องไม่อยู่ในสูตรนี้ (เป็นค่าใช้จ่ายคนละก้อน)", () => {
  assert.equal(shopeeNet({ ...ใบจริง, voucherBySeller: 500 }), shopeeNet(ใบจริง));
});

/* กฎ blank-input-invents-output: ช่องจำเป็นขาด ⇒ ต้องตีกลับเป็น null ห้ามแทน 0 แล้วคิดต่อ
   ไม่งั้นจะได้ formula_diff สวย ๆ ที่ไม่ได้พิสูจน์อะไร */
for (const ช่อง of ["itemsTotal", "commission", "serviceFee", "paymentFee", "shippingActual"]) {
  test(`ขาดช่องจำเป็น ${ช่อง} ⇒ คืน null ไม่ใช่เดาด้วย 0`, () => {
    assert.equal(shopeeNet({ ...ใบจริง, [ช่อง]: null }), null);
  });
}

/* ช่องที่ "ไม่มีก็แปลว่าไม่มีรายการนั้น" ใช้ 0 ได้ — แต่ต้องยังคิดออกมาได้ ไม่ใช่กลายเป็น null ทั้งใบ */
test("ช่องที่ไม่บังคับหายไป ⇒ ยังคิดได้ ไม่กลายเป็น null", () => {
  const v = shopeeNet({ ...ใบจริง, sellerTransactionFee: null, shippingSubsidyByShopee: null });
  assert.equal(v, 5907);   // 5967 − 60 (ไม่มีเงินอุดหนุนค่าส่ง)
});

test("0 บาทต้องไม่ถูกอ่านเป็น 'ไม่มีค่า'", () => {
  // commission = 0 (โปรค่าคอม 0) ต้องคิดได้ปกติ ไม่ใช่ตีกลับเป็น null
  assert.equal(shopeeNet({ ...ใบจริง, commission: 0 }), 6292);
});

/* 🧪 ตัวควบคุมของเทสชุดนี้: ถ้าของจริงตรงข้าม ผลต้องเปลี่ยน (กฎ test-must-discriminate) */
test("เปลี่ยนค่าเข้า ⇒ ผลต้องเปลี่ยน (เทสนี้แยกแยะได้จริง)", () => {
  assert.notEqual(shopeeNet({ ...ใบจริง, commission: 999 }), shopeeNet(ใบจริง));
});
