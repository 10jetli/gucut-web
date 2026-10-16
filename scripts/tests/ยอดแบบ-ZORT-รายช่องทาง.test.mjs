// `byChannel` — ยอดแบบ ZORT ต่อช่องทาง (ค้างจ่าย · ถูกคืน · salesZortStyle)
//
// ที่มา 16 ต.ค. 2569 · ฝั่งจออ่านจอ ZORT SalesReport tableoption=ช่องทางการขาย (z1 · 1–31 ส.ค.)
// 📏 หลักฐาน: ส่วนต่าง 17,865.50 = ใบค้างจ่าย 6,590.00 + ใบคืน 11,275.50
//    ⇒ ตรงเป๊ะ **รายช่องทั้งสามช่อง** (Shopify 6,590 · Shopee 9,611 · Lazada 1,664.50)
//
// 🔴 สิ่งที่เฝ้า — สี่อย่างที่ถ้าพลาดแล้วตัวเลขยังดูสมเหตุสมผล:
//   ① ห้ามหักออกจาก `amount` เดิม (จอที่เทียบเลขเก่าจะเพี้ยนพร้อมกันทุกจอ)
//   ② ใบคืนอ่านไม่ได้ ⇒ null **ห้ามเป็น 0** และ salesZortStyle ต้องเป็น null ด้วย
//   ③ ไม่ได้ขอ ⇒ **ไม่มีคีย์เลย** (ต่างจาก null) และต้องไม่ยิงคิวรีใบคืน
//   ④ "ยังไม่จ่าย" ต้องอ่านจาก pay_status ไม่ใช่ status (คนละคำถาม)
import { mock, test } from "node:test";
import assert from "node:assert/strict";

const calls = [];
let ใบคืนพัง = false;
mock.module("../../netlify/lib/coredb.mjs", { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => {
    calls.push({ s: String(sql), params });
    if (/FROM return_orders_v2/.test(String(sql))) {
      if (ใบคืนพัง) throw new Error("อ่านตารางใบคืนไม่ได้");
      return [{ channel: "Shopee-gucut", retOrders: 12, retAmount: 9611 }];
    }
    if (/GROUP BY channel/.test(String(sql))) {
      return [
        { channel: "Shopee-gucut", orders: 211, amount: 188537, unpaidAmount: 0, unpaidOrders: 0 },
        { channel: "Shopify", orders: 7, amount: 16192, unpaidAmount: 6590, unpaidOrders: 2 },
      ];
    }
    return [];
  },
} });
mock.module("@netlify/blobs", { namedExports: { getStore: () => ({ get: async () => null, setJSON: async () => {} }) } });
const { listOrderFacets } = await import("../../netlify/lib/core-orders.mjs");

const หา = (rows, ch) => rows.find((r) => r.channel === ch);

test("ไม่ขอ ⇒ ไม่มีคีย์ยอดแบบ ZORT และ **ไม่ยิงคิวรีใบคืน**", async () => {
  calls.length = 0;
  const r = await listOrderFacets({ from: "2026-08-01", to: "2026-08-31" });
  assert.equal(calls.filter((c) => /FROM return_orders_v2/.test(c.s)).length, 0,
    "เส้นนี้เปิดบ่อยสุดในระบบ — ของเสริมต้องไม่กินรอบอ่านของทุกคำขอ");
  const row = หา(r.byChannel, "Shopify");
  assert.equal("returnedAmount" in row, false, "ไม่ได้ขอ ⇒ ต้องไม่มีคีย์ (ต่างจาก null)");
  assert.equal("salesZortStyle" in row, false);
  // แต่ยอดค้างจ่ายต้องมีให้ฟรี เพราะคิดอยู่ในคิวรีเดิม ไม่เพิ่มรอบอ่าน
  assert.equal(row.unpaidAmount, 6590);
});

test("ขอแล้ว ⇒ salesZortStyle = amount − ค้างจ่าย − ถูกคืน และ amount เดิมไม่ถูกแตะ", async () => {
  calls.length = 0;
  const r = await listOrderFacets({ from: "2026-08-01", to: "2026-08-31", zortStyle: "1" });
  const sp = หา(r.byChannel, "Shopee-gucut");
  const sf = หา(r.byChannel, "Shopify");
  assert.equal(sp.amount, 188537, "ห้ามหักออกจาก amount เดิม");
  assert.equal(sp.returnedAmount, 9611);
  assert.equal(sp.salesZortStyle, 188537 - 9611);     // 178,926 = เลขบนจอ ZORT
  assert.equal(sf.returnedAmount, 0, "ช่องที่ไม่มีใบคืน = 0 (วัดแล้วว่าไม่มี)");
  assert.equal(sf.salesZortStyle, 16192 - 6590);      // 9,602 = เลขบนจอ ZORT
});

test("ขอแล้วแต่ตารางใบคืนอ่านไม่ได้ ⇒ null ทั้ง returnedAmount และ salesZortStyle ห้ามเป็น 0", async () => {
  ใบคืนพัง = true;
  try {
    const r = await listOrderFacets({ from: "2026-08-01", to: "2026-08-31", zortStyle: "1" });
    const sf = หา(r.byChannel, "Shopify");
    assert.equal(sf.returnedAmount, null, "0 = คำยืนยันว่าไม่มีใบคืน ซึ่งเราไม่ได้วัด");
    /* 🔑 ส่วนประกอบตัวใดไม่รู้ ⇒ ผลลัพธ์ต้องไม่รู้ด้วย · เลขที่ถูกครึ่งเดียวอันตรายกว่าไม่มีเลข */
    assert.equal(sf.salesZortStyle, null, "ห้ามคิดจาก amount − unpaid เฉย ๆ แล้วส่งออกไป");
    assert.equal(sf.amount, 16192, "ยอดเดิมต้องยังอยู่");
  } finally { ใบคืนพัง = false; }
});

test("ยอดค้างจ่ายต้องอ่านจาก pay_status และใช้ LIKE ขึ้นต้นด้วย", async () => {
  calls.length = 0;
  await listOrderFacets({ from: "2026-08-01", to: "2026-08-31" });
  const q = calls.find((c) => /GROUP BY channel/.test(c.s));
  assert.match(q.s, /LOWER\(COALESCE\(pay_status,''\)\) LIKE 'pending%'/);
  /* 🚫 `%ending%` = จัดประเภทด้วยสตริงย่อย ซึ่งเป็นข้อห้ามของโปรเจกต์นี้
     (สถานะที่ลงท้ายด้วย ending คำอื่นจะถูกนับเป็น "ยังไม่จ่าย" เงียบ ๆ) */
  assert.ok(!/LIKE '%ending%'/.test(q.s), "ห้ามใช้ %ending%");
  assert.ok(!/LOWER\(COALESCE\(status,''\)\) LIKE 'pending%'/.test(q.s),
    "status คือสถานะเอกสาร ไม่ใช่สถานะการจ่ายเงิน — คนละคำถาม");
});

test("ป้ายขอบเขตต้องบอกนิยามครบ และบอกว่า null ไม่ใช่ 0", async () => {
  const r = await listOrderFacets({ from: "2026-08-01", to: "2026-08-31", zortStyle: "1" });
  assert.match(r.byChannelScope, /pay_status/);
  assert.match(r.byChannelScope, /amount − unpaidAmount − returnedAmount/);
  assert.match(r.byChannelScope, /ห้ามอ่านเป็น 0/);
});
