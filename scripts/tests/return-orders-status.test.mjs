// รัน: node --experimental-test-module-mocks --test scripts/tests/return-orders-status.test.mjs
// 19 ก.ย. 2569 · ฝั่งจอถามว่าควรทำแท็บในจอใบคืนไหม — ยิงตรวจก่อนตอบพบว่า status= ไม่มีผลเลย
// 🔴 สิ่งที่เฝ้า:
//    · ส่ง status ⇒ **ต้องไปทางกระจก** (ไปทางสดแล้ว ZORT ไม่รู้จัก ⇒ คืนทั้ง 693 แบบดูเหมือนสำเร็จ = ปุ่มหลอก)
//    · กรองด้วย **เท่ากับ ไม่สนตัวพิมพ์** ห้าม LIKE (Success จะจับ Unsuccess ด้วย)
//    · status สะท้อนกลับใน applied ⇒ จอเขียนขอบเขตกำกับเลขได้
import { test } from "node:test";
import assert from "node:assert/strict";

/* 🔴 ทางที่ถาม ZORT สดต้องมีรหัส + fetch ⇒ ไม่ตั้ง = หยุดที่ด่านรหัสก่อนถึงโค้ดที่ทดสอบ
   ("ล้มเพราะไม่ได้แตะ path" หน้าตาเหมือน "ฟังก์ชันพัง" — เจอสองรอบในคืนเดียว) */
process.env.ZORT_STORENAME = "ทดสอบ";
process.env.ZORT_APIKEY = "ทดสอบ";
process.env.ZORT_APISECRET = "ทดสอบ";
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ count: 5, list: [] }) });

/* mock ชั้นฐานข้อมูล: จดคำสั่งที่ถูกยิงจริง แล้วตอบแถวปลอม */
const ยิงแล้ว = [];
const fake = {
  coreReady: () => true,
  coreQuery: async (sql, args = []) => {
    ยิงแล้ว.push([String(sql).replace(/\s+/g, " ").trim(), args]);
    if (/COUNT\(\*\) AS c FROM return_orders_v2/.test(sql)) return [{ c: 7 }];
    if (/GROUP BY 1/.test(sql)) return [{ status: "Success", c: 5 }, { status: "Voided", c: 2 }];
    if (/core_meta/.test(sql)) return [{ v: "complete", at: "2026-09-19 01:00:00" }];
    if (/SELECT id, number, reference/.test(sql)) return [{ id: 1, number: "RT-1", status: "Voided" }];
    return [];
  },
};
const { mock } = await import("node:test");
mock.module("../../netlify/lib/coredb.mjs", { namedExports: fake });
const { listReturnOrders } = await import("../../netlify/lib/core-purchases.mjs");

test("ส่ง status ⇒ ไปทางกระจก และ WHERE มีเงื่อนไขสถานะแบบเท่ากับ", async () => {
  ยิงแล้ว.length = 0;
  const r = await listReturnOrders(50, 1, "", "z1", { status: "Voided" });
  assert.equal(r.source, "mirror", "ต้องไปทางกระจก ไม่ใช่ถาม ZORT สด");
  assert.equal(r.applied.status, "Voided");
  const sqls = ยิงแล้ว.map(([s]) => s).join("\n");
  assert.ok(/lower\(COALESCE\(status,''\)\) = lower\(\?\)/.test(sqls), "ต้องเทียบเท่ากับ ไม่ใช่ LIKE");
  assert.ok(!/status LIKE/.test(sqls), "ห้ามใช้ LIKE กับสถานะ");
  assert.ok(ยิงแล้ว.some(([, a]) => a.includes("Voided")), "ค่าต้องส่งเป็นพารามิเตอร์ ไม่ต่อเข้า SQL");
});

test("ไม่ส่งอะไรเลย ⇒ ไม่ไปทางกระจก (ยังถาม ZORT สดตามเดิม)", async () => {
  const r = await listReturnOrders(50, 1, "", "z1", {});
  assert.notEqual(r.source, "mirror");
});

test("ทางกระจกประกาศ supportedFilters รวม status", async () => {
  const r = await listReturnOrders(50, 1, "", "z1", { status: "Success" });
  assert.ok(r.supportedFilters.includes("status"));
});

test("ทางกระจกส่ง mirrorTotals ด้วย (รูปคำตอบเดียวกับทางสด)", async () => {
  const r = await listReturnOrders(50, 1, "", "z1", { status: "Success" });
  assert.ok(r.mirrorTotals, "ทางกระจกต้องมี mirrorTotals ไม่ใช่มีแต่ทางสด");
  assert.ok(Array.isArray(r.mirrorTotals.byStatus));
});

/* ── เกณฑ์รับของที่ฝั่งจอตั้งไว้ 19 ก.ย. 2569 ─────────────────────────────
   เขาจะเทียบ `q=CN` กับ `q=` เปล่า ๆ: **เลขเท่ากันเป๊ะทั้งที่ total ต่างกัน = byStatus ไม่ได้ถูกกรอง**
   ⇒ เทสต์สองข้อนี้ยืนยันว่ามีสองตัวเลขแยกกัน และตัวที่กรองใช้เงื่อนไขชุดเดียวกับที่ดึงแถว */
test("ทางกระจก: byStatus = ทั้งร้าน · byStatusFiltered = ชุดที่กรอง (เงื่อนไขเดียวกับที่ดึงแถว)", async () => {
  ยิงแล้ว.length = 0;
  const r = await listReturnOrders(50, 1, "CN", "z1", {});
  assert.ok(Array.isArray(r.mirrorTotals.byStatus), "byStatus ต้องมี (ทำรายชื่อแท็บ)");
  assert.ok(Array.isArray(r.mirrorTotals.byStatusFiltered), "byStatusFiltered ต้องมีเมื่อกรอง");
  /* คำสั่งของ byStatusFiltered ต้องมีเงื่อนไขคำค้น · ของ byStatus ต้องไม่มี */
  const gb = ยิงแล้ว.filter(([s]) => /GROUP BY 1/.test(s));
  assert.equal(gb.length, 2, "ต้องมีสองคำสั่ง: ทั้งร้าน + ชุดที่กรอง");
  const มีคำค้น = gb.filter(([, a]) => a.includes("CN")).length;
  assert.equal(มีคำค้น, 1, "ตัวที่กรองต้องส่งคำค้นไปด้วย · ตัวทั้งร้านต้องไม่ส่ง");
});

test("ทางที่ถาม ZORT สด: byStatusFiltered = null พร้อมเหตุผล (ไม่ใช่ 'กรองแล้วไม่มีของ')", async () => {
  const r = await listReturnOrders(50, 1, "", "z1", {});
  assert.equal(r.mirrorTotals.byStatusFiltered, null);
  assert.ok(/ไม่ได้กรอง/.test(r.mirrorTotals.byStatusFilteredNote));
});
