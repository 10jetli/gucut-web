// รัน: node --experimental-test-module-mocks --test scripts/tests/lazada-readback-unknown-sku.test.mjs
// 19 ก.ย. 2569 · เจอจากชุดตรวจหลัง deploy: ยิง ?stockpushverify=1 (ค่า "1" = รหัสที่ไม่มีจริง)
//   ⇒ ได้ landed: ["1"] ⇒ **รหัสที่ระบบไม่เคยรู้จัก ถูกตอบว่า "ดันสต็อกตรงกันแล้ว"**
// 🔴 สิ่งที่เฝ้า:
//    · รหัสที่คลังไม่มี ⇒ unknown reason=not_in_warehouse **ห้ามเป็น landed**
//    · รหัสที่คลังมีและไม่อยู่กองใด ⇒ landed ได้ตามเดิม (ไม่ทำให้ของที่ถูกกลายเป็นไม่ถูก)
//    · อ่านฐานไม่ได้ ⇒ **ไม่ตัดสินเรื่องนี้** (ไม่ใช่ถือว่าไม่มีรหัส) — สามสถานะ
import { test, mock } from "node:test";
import assert from "node:assert/strict";

let ฐานล่ม = false;
let มีในคลัง = ["00747"];
mock.module("../../netlify/lib/coredb.mjs", { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, args = []) => {
    if (ฐานล่ม) throw new Error("D1 ล่ม");
    if (/FROM products WHERE sku IN/.test(sql)) return args.filter((a) => มีในคลัง.includes(a)).map((sku) => ({ sku }));
    return [];
  },
}});
const { lazadaReadBack } = await import("../../netlify/lib/stock-push-live.mjs");

/* ✅ ฟังก์ชันนี้ **เปิดช่องให้ฉีดแผนได้** (`deps.dryRun`) ⇒ ไม่ต้อง mock โมดูล
   แผนสดที่ "ครบ" และไม่มีรหัสไหนอยู่ในกองใด ⇒ เดิมจะได้ landed ทุกตัว รวมรหัสที่ไม่มีจริง */
const แผนครบ = async () => ({ lazada: {
  push: [], wouldPush: 0,
  skipNegative: 0, skipUnknown: 0, skipConflict: 0,
  skipNegativeFull: [], skipUnknownFull: [], skipConflictFull: [],
}});

test("รหัสที่คลังไม่มี ⇒ not_in_warehouse ไม่ใช่ landed", async () => {
  const r = await lazadaReadBack(["1", "00747"], { dryRun: แผนครบ });
  assert.ok(!r.landed.includes("1"), "รหัส 1 ต้องไม่อยู่ใน landed");
  const u = r.unknown.find((x) => x.sku === "1");
  assert.equal(u?.reason, "not_in_warehouse");
  assert.ok(r.landed.includes("00747"), "รหัสที่คลังมีและไม่อยู่กองใด ยังต้อง landed ได้ตามเดิม");
});

test("อ่านฐานไม่ได้ ⇒ ไม่ตัดสินเรื่องนี้ (ไม่ใช่ถือว่าไม่มีรหัส)", async () => {
  ฐานล่ม = true;
  const r = await lazadaReadBack(["1"], { dryRun: แผนครบ });
  ฐานล่ม = false;
  assert.ok(!(r.landed || []).includes("1"), "ฐานล่มแล้วห้ามตอบ landed — ตรวจไม่ได้ ≠ ผ่าน");
  const u = (r.unknown || []).find((x) => x.sku === "1");
  assert.equal(u?.reason, "warehouse_check_failed", "ต้องบอกว่าตรวจไม่ได้ ไม่ใช่กล่าวหาว่ารหัสไม่มีในคลัง");
});

/* 🔴 เพิ่ม 19 ก.ย. 2569 — ฝั่งจอยิงด้วยรหัสจากรอบที่ **ดันสำเร็จจริง 20/20**
   แล้วได้ `not_in_warehouse` ทั้ง 5 ตัว ⇒ ดูเหมือนเจอเรื่องใหญ่
   ของจริง: คลังเก็บ **รหัสแม่ `00894`** (โซ่ขายเป็นความยาว) แพลตฟอร์มขายเป็นท่อน `00894-22.5T`
   ⇒ การดันสต็อกถูกอยู่แล้ว **ที่ผิดคือตัวตรวจ** ซึ่งจะตอบ inconclusive ตลอดกาลกับสินค้ากลุ่มนี้
   ⇒ เหลืองทุกวันจนคนชิน แล้วเลิกอ่าน = เสียงรบกวน (คลาสเดียวกับแถบแดง 22.5 ชม./วัน)
   🔑 สิ่งที่เทสต์นี้เฝ้า: **แยก "รหัสท่อนของสินค้าแบบตัด" (ปกติ) ออกจาก "รหัสมั่ว" (ต้องสงสัย)**
      และ **ยังต้องไม่ตอบ landed** เพราะการตัดท้ายขีดคือการเดา (กติกาใน sku-match.mjs) */
test("รหัสท่อนของสินค้าแบบตัด ⇒ segment_of_cut_product + บอกรหัสแม่ · ยังไม่ landed", async () => {
  มีในคลัง = ["00894"];
  const r = await lazadaReadBack(["00894-22.5T"], { dryRun: แผนครบ });
  มีในคลัง = ["00747"];
  assert.ok(!r.landed.includes("00894-22.5T"), "เดาจากรหัสแม่แล้วห้ามตอบ landed — เดา ≠ พิสูจน์");
  const u = r.unknown.find((x) => x.sku === "00894-22.5T");
  assert.equal(u?.reason, "segment_of_cut_product", "ต้องแยกจาก not_in_warehouse ซึ่งเป็นคนละขั้ว");
  assert.equal(u?.baseSku, "00894", "ต้องบอกรหัสแม่ที่จับคู่ได้ ไม่ให้ปลายทางไปเดาเอง");
  assert.match(String(u?.why), /ปกติ|ไม่ใช่ความผิดพลาด/, "ต้องบอกชัดว่าเรื่องนี้ปกติ ไม่งั้นจอขึ้นเตือน");
});

test("รหัสมั่วที่ไม่มีแม้แต่รหัสแม่ ⇒ ยังเป็น not_in_warehouse เหมือนเดิม", async () => {
  /* ⚠️ ทิศนี้สำคัญเท่ากัน — ถ้าตัวแปลงกว้างเกิน รหัสพิมพ์ผิดจะถูกจัดเป็น "ปกติ"
     แล้วด่านที่เพิ่งอุดไปเมื่อเช้าก็หายไปเงียบ ๆ */
  const r = await lazadaReadBack(["99999-77T"], { dryRun: แผนครบ });
  const u = r.unknown.find((x) => x.sku === "99999-77T");
  assert.equal(u?.reason, "not_in_warehouse", "ไม่มีรหัสแม่ ⇒ ต้องยังเป็นของที่ควรสงสัย");
});
