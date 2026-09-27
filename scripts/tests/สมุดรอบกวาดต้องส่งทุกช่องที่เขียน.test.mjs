/* 🔴 ด่าน: **ช่องที่ตัวเขียนจดลง `push_sweep_log` ต้องถูกส่งออกให้จอครบทุกช่อง**
 *
 * ที่มา 27 ก.ย. 2569: ฝั่งจอถามว่า `planned 44` แต่ `pushed 0 + rejected 0 + skipped 43 = 43`
 * ⇒ หายไป 1 · เหตุ: `fired` ถูกเขียนทุกรอบ **แต่ไม่อยู่ใน SELECT ที่ส่งให้จอ**
 * ⇒ จอไม่มีทางปิดบัญชีได้เลย และคนจะไปสงสัยข้อมูลหรือตรรกะ ทั้งที่เลขแค่ไม่ได้ถูกส่ง
 *
 * 🔑 คลาส: **คำนวณ/จดไว้แล้วแต่ไม่ได้ส่งออก** — ไฟล์นี้เคยเจอมาแล้วกับตัวเลขทิศลง
 *    ด่านนี้จึงกันทั้งคลาส ไม่ใช่กันเคสนี้: เพิ่มคอลัมน์ใหม่แล้วลืมส่ง = แดงทันที
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ต้นฉบับ = await readFile(new URL("../../netlify/lib/stock-push-sweep.mjs", import.meta.url), "utf8");

/** ช่องที่ตัวเขียนจดลงสมุด — อ่านจาก INSERT ของจริง ไม่ใช่รายชื่อที่พิมพ์มือ
 *  (พิมพ์มือ = ด่านจะค้างวันที่ใครเพิ่มคอลัมน์ แล้วเขียวทั้งที่ของใหม่ไม่ถูกส่ง) */
const ที่เขียน = (() => {
  const m = ต้นฉบับ.match(/INSERT INTO push_sweep_log \(([^)]+)\)/);
  assert.ok(m, "หา INSERT INTO push_sweep_log ไม่เจอ — ด่านนี้ต้องแดง ไม่ใช่ผ่านเงียบ");
  return m[1].split(",").map((x) => x.trim()).filter(Boolean);
})();

/** ช่องที่ถูกส่งให้จอ — อ่านจาก SELECT ที่สร้าง lastSweep */
const ที่ส่ง = (() => {
  const m = ต้นฉบับ.match(/SELECT (l\.at[^`]*?)\n\s*FROM push_sweep_log l/s);
  assert.ok(m, "หา SELECT ที่สร้าง lastSweep ไม่เจอ");
  return m[1].split(",").map((x) => x.trim().replace(/^l\./, "")).filter(Boolean);
})();

test("✅ ตัวปลูกอ่านเจอทั้งสองฝั่งจริง (ถ้าอ่านไม่เจอ ด่านจะเขียวลวง)", () => {
  assert.ok(ที่เขียน.length >= 8, `ช่องที่เขียนต้อง ≥ 8 · ได้ ${ที่เขียน.length}: ${ที่เขียน}`);
  assert.ok(ที่ส่ง.length >= 8, `ช่องที่ส่งต้อง ≥ 8 · ได้ ${ที่ส่ง.length}: ${ที่ส่ง}`);
});

test("🔴 ทุกช่องที่จดลงสมุด ต้องถูกส่งให้จอ — ห้ามจดแล้วเงียบ", () => {
  const ขาด = ที่เขียน.filter((c) => !ที่ส่ง.includes(c));
  assert.deepEqual(ขาด, [],
    `ช่องที่ถูกจดแต่ไม่ถูกส่ง: ${ขาด.join(", ")} ⇒ จอปิดบัญชีไม่ลง ` +
    "(เพิ่มใน SELECT ที่สร้าง lastSweep)");
});

test("🔑 `fired` ต้องอยู่ทั้งสองฝั่ง — มันคือช่องที่ทำให้ planned/pushed/rejected ปิดกันได้", () => {
  assert.ok(ที่เขียน.includes("fired"), "ตัวเขียนต้องจด fired");
  assert.ok(ที่ส่ง.includes("fired"), "ตัวอ่านต้องส่ง fired ให้จอ");
});
