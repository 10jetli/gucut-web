/* ด่าน: ตัวกรองของ list=sales ต้อง **ประกอบ SQL จริง** ไม่ใช่รับค่ามาแล้วทิ้ง
 *
 * 🔴 ที่มา 19 ก.ย. 2569 — จอ POS ส่ง channel/status/q มาตลอด ท่อเมินเงียบ ๆ
 *    และจอก็ไม่ได้กรองในเบราว์เซอร์ ⇒ **คนเลือก "Shopee" แล้วเห็นทุกช่องทาง โดยเชื่อว่ากรองแล้ว**
 * 🔑 ด่านนี้จับ SQL ที่ถูกส่งเข้า D1 จริง ๆ (mock `coreQuery`) ⇒ ถ้าใครถอดเงื่อนไขออก ด่านแดงทันที
 *    ไม่ใช่เช็คว่า `applied` มีคีย์นั้น — `applied` เป็นคำประกาศ ซึ่งโกหกได้ถ้าไม่ได้ผูกกับ SQL
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const คำขอ = [];
mock.module("../../netlify/lib/coredb.mjs", {
  namedExports: {
    coreReady: () => true,
    coreQuery: async (sql, params = []) => {
      คำขอ.push({ sql, params });
      if (/COUNT\(\*\) AS c/.test(sql)) return [{ c: 0, s: 0 }];
      return [];
    },
  },
});
const { listSales } = await import("../../netlify/lib/pos.mjs");

const หาคำขอแถว = () => คำขอ.find((c) => /FROM orders WHERE/.test(c.sql) && /ORDER BY number DESC/.test(c.sql));

test("ส่ง channel/status/q ⇒ ต้องโผล่ในเงื่อนไข SQL ของคำขอแถว", async () => {
  คำขอ.length = 0;
  const r = await listSales({ day: "2026-09-19", channel: "Shopee", status: "Done", q: "สมชาย ใจดี" });
  const c = หาคำขอแถว();
  assert.ok(c, "ต้องมีคำขอดึงแถว");
  assert.match(c.sql, /channel,''\) = 'Shopee'/, "channel ต้องเทียบตรงตัว ไม่ใช่ LIKE");
  assert.match(c.sql, /status,''\) = 'Done'/);
  assert.match(c.sql, /instr\(lower\(number\)/, "q ต้องใช้ instr() — D1 จำกัดรูปแบบ LIKE 50 ไบต์");
  assert.doesNotMatch(c.sql, /LIKE\s*'%/, "ห้ามมี LIKE '%…%' ที่ห่อคำค้น");
  assert.deepEqual(c.params, ["สมชาย ใจดี", "สมชาย ใจดี"], "คำค้นต้องไปทาง params ไม่ฝังในสตริง");
  assert.equal(r.applied.channel, "Shopee");
  assert.equal(r.applied.q, "สมชาย ใจดี");
});

test("ไม่ส่งตัวกรอง ⇒ ต้องไม่มีเงื่อนไขเกินมา และ applied เป็น null (ไม่ใช่สตริงว่าง)", async () => {
  คำขอ.length = 0;
  const r = await listSales({ day: "2026-09-19" });
  const c = หาคำขอแถว();
  assert.doesNotMatch(c.sql, /channel,''\) =/);
  assert.doesNotMatch(c.sql, /instr\(/);
  assert.equal(r.applied.channel, null, "ไม่ส่งมา = null ⇒ ปลายทางแยก 'ไม่ได้กรอง' จาก 'กรองด้วยค่าว่าง' ได้");
  assert.equal(r.applied.q, null);
});

test("ยอดสรุปต้องคิดจากทั้งวัน ไม่ตามตัวกรอง — และต้องประกาศไว้", async () => {
  คำขอ.length = 0;
  const r = await listSales({ day: "2026-09-19", channel: "Shopee" });
  const สรุป = คำขอ.filter((c) => /COUNT\(\*\) AS c|GROUP BY/.test(c.sql));
  assert.ok(สรุป.length >= 2, "ต้องมีคำขอสรุปยอด");
  for (const c of สรุป) {
    assert.doesNotMatch(c.sql, /channel,''\) = 'Shopee'/,
      "ยอดปิดสิ้นวันต้องไม่ขยับเวลาใครกดกรองดู");
  }
  assert.ok(r.rowsScope, "ต้องบอกออกไปว่าเลขไหนตามตัวกรอง เลขไหนไม่ตาม");
});
