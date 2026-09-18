// รัน: node --experimental-test-module-mocks --test scripts/tests/return-orders-status.test.mjs
// 19 ก.ย. 2569 · ฝั่งจอถามว่าควรทำแท็บในจอใบคืนไหม — ยิงตรวจก่อนตอบพบว่า status= ไม่มีผลเลย
// 🔴 สิ่งที่เฝ้า:
//    · ส่ง status ⇒ **ต้องไปทางกระจก** (ไปทางสดแล้ว ZORT ไม่รู้จัก ⇒ คืนทั้ง 693 แบบดูเหมือนสำเร็จ = ปุ่มหลอก)
//    · กรองด้วย **เท่ากับ ไม่สนตัวพิมพ์** ห้าม LIKE (Success จะจับ Unsuccess ด้วย)
//    · status สะท้อนกลับใน applied ⇒ จอเขียนขอบเขตกำกับเลขได้
import { test } from "node:test";
import assert from "node:assert/strict";

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
