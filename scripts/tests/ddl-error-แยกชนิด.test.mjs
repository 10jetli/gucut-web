/* 🧪 คำสั่งแก้โครงตาราง: **กลืนได้เฉพาะ "คอลัมน์มีอยู่แล้ว"**
 * 🔴 ที่มา 20 ก.ย. 2569 — `coreInit()` เดิมใช้ `.catch(() => null)` กับ DDL ทุกคำสั่ง
 *    ⇒ ยิงซ้ำไม่พัง (เจตนา) **แต่ ALTER ที่ผิดจริงก็เงียบ** ⇒ คอลัมน์ไม่ถูกเพิ่มโดยไม่มีใครรู้
 *    ⇒ แล้ว `SELECT` ที่อ่านคอลัมน์นั้นตอบ 500 ทีหลัง — **อาการโผล่คนละที่คนละเวลากับต้นเหตุ**
 *    (เกิดจริง 15 ก.ย. 2569: `list=orders` 500 "no such column: tag" 3 นาที)
 * 🔑 เทสนี้มีเพราะ **ตอนผมแก้ เทสไม่ขยับเลย (709 → 709)** ⇒ ไม่มีอะไรยืนยันว่าการแยกถูก
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ddlพลาดแบบปกติ } from "../../netlify/lib/coredb.mjs";

test("คอลัมน์มีอยู่แล้ว ⇒ ปกติ (ยิง init ซ้ำต้องไม่ส่งเสียง)", () => {
  assert.equal(ddlพลาดแบบปกติ("duplicate column name: tag"), true);
  assert.equal(ddlพลาดแบบปกติ("D1_ERROR: duplicate column name: image_path"), true);
  assert.equal(ddlพลาดแบบปกติ("Duplicate Column Name: x"), true, "ต้องไม่สนตัวพิมพ์");
});

test("🔴 error อื่นทั้งหมด ⇒ **ไม่ปกติ** ต้องถูกนับและรายงาน", () => {
  for (const e of [
    "no such table: products",              // ตารางยังไม่ถูกสร้าง ⇒ ลำดับผิด
    "near \"ADD\": syntax error",           // คำสั่งพิมพ์ผิด
    "authentication error",                 // สิทธิ์/โทเค็น
    "D1_ERROR: database is locked",         // ฐานไม่ว่าง ⇒ คอลัมน์ไม่ถูกเพิ่มจริง
    "Network connection lost",              // ยิงไม่ถึง
  ]) assert.equal(ddlพลาดแบบปกติ(e), false, `ต้องไม่กลืน: ${e}`);
});

test("ค่าที่ไม่ใช่ข้อความ ⇒ ไม่ปกติ (ไม่รู้ = ต้องส่งเสียง ห้ามกลืน)", () => {
  for (const v of [null, undefined, 0, {}, []]) assert.equal(ddlพลาดแบบปกติ(v), false);
});

test("🕳️ ปลูกรุ่นที่กลืนทุกอย่าง ⇒ เทสข้างบนต้องแยกมันออกได้", () => {
  const กลืนหมด = () => true;      // = พฤติกรรมของ `.catch(() => null)` เดิม
  assert.equal(กลืนหมด("no such table: products"), true);
  assert.notEqual(
    ddlพลาดแบบปกติ("no such table: products"), กลืนหมด("no such table: products"),
    "ถ้าสองรุ่นให้ผลเดียวกัน เทสชุดนี้ไม่ได้วัดอะไรเลย"
  );
});
