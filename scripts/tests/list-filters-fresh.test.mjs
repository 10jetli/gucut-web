/* ด่าน: ตาราง `list-filters.json` ต้องตรงกับซอร์ส **ณ ตอนนี้** ไม่ใช่ตอนที่ใครสร้างไว้
 *
 * 🔴 ที่มา 19 ก.ย. 2569 · ฝั่งจอจะสร้างด่านเทียบคำกล่าวอ้าง 186 จุดจากตารางนี้
 *    ⇒ ถ้าตารางค้าง ด่านของเขาจะเทียบกับความจริงเก่า
 *      ⇒ **ฟ้องเส้นที่ถูกอยู่แล้ว** หรือ **ปล่อยผ่านเส้นที่เปลี่ยนไปแล้ว** ⇒ ทั้งสองทางทำให้เขาไปทำผิดที่
 * 🔑 ด่านนี้ไม่ใช่การถามซ้ำ: ข้างหนึ่งคือ **ไฟล์ที่ commit ไว้** อีกข้างคือ **ค่าที่คิดสดจากซอร์ส**
 *    ⇒ ซอร์สเปลี่ยนแล้วไม่ได้สร้างใหม่ = แดง
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ตารางตัวกรอง } from "../../netlify/lib/list-filters.mjs";

/* 🔴 **ต้องเป็นโมดูล `.mjs` ไม่ใช่ `.json`** — ของเดิมเป็น `.json` อ่านด้วย `createRequire`
   ⇒ ตัวรวมไฟล์ของ Netlify ไม่เอาไปด้วย ⇒ บน production ได้ `null` ทั้ง 24 เส้นแบบเงียบ ๆ
   ⇒ ด่านข้อสุดท้ายในไฟล์นี้กันการเปลี่ยนกลับ */

test("ตารางตัวกรองต้องไม่ค้าง — สร้างใหม่แล้วต้องได้ของเดิม", () => {
  const ก่อน = JSON.parse(JSON.stringify(ตารางตัวกรอง));
  execFileSync("node", ["scripts/gen-list-filters.mjs"], { stdio: "pipe" });
  /* อ่านไฟล์ที่เพิ่งสร้างแบบดิบ (import ถูกแคชไว้แล้วในโปรเซสนี้) */
  const src = readFileSync("netlify/lib/list-filters.mjs", "utf8");
  const หลัง = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
  /* เทียบเฉพาะเนื้อ — `สร้างเมื่อ` ต่างกันทุกครั้งโดยธรรมชาติ */
  assert.deepEqual(หลัง.เส้น, ก่อน.เส้น,
    "ตารางตัวกรองค้าง ⇒ รัน `node scripts/gen-list-filters.mjs` แล้ว commit ไฟล์ตามไปด้วย");
});

test("แถวที่ว่างต้องเป็น null ไม่ใช่ [] — ว่างเปล่ากับ 'ไม่รับอะไรเลย' คนละเรื่อง", () => {
  const d = ตารางตัวกรอง;
  for (const [ชื่อ, v] of Object.entries(d.เส้น)) {
    assert.ok(v.ตัวกรองที่รับ === null || Array.isArray(v.ตัวกรองที่รับ), `${ชื่อ}: ชนิดผิด`);
    if (Array.isArray(v.ตัวกรองที่รับ)) {
      assert.ok(v.ตัวกรองที่รับ.length > 0, `${ชื่อ}: อาเรย์ว่าง ⇒ ต้องเป็น null พร้อมเหตุผล`);
    } else {
      assert.match(String(v.การสกัด), /ยังไม่รู้|ไม่เจอ|เพี้ยน/, `${ชื่อ}: null ต้องมีเหตุผลกำกับ`);
    }
    assert.ok(String(v.การสกัด || "").length > 10, `${ชื่อ}: ต้องบอกว่าสกัดมาอย่างไร`);
  }
});

test("ไฟล์ต้องเป็นโมดูล .mjs — ห้ามกลับไปเป็น .json (production อ่านไม่ได้)", () => {
  const src = readFileSync("netlify/lib/list-filters.mjs", "utf8");
  assert.match(src, /export const ตารางตัวกรอง/, "ต้อง export เป็นโมดูล ⇒ ตัวรวมไฟล์ของ Netlify จึงเอาไปด้วย");
  /* 🔑 ถ้ามีคนสร้าง .json กลับมา ให้ตกทันที — เพราะรูปนั้น **พังเงียบบน production เท่านั้น**
     (ในเครื่องอ่านได้ปกติ ⇒ เทสในเครื่องจะเขียวแล้วเราจะไม่รู้จนฝั่งจอยิงเจอ) */
  let มีjson = false;
  try { readFileSync("netlify/lib/list-filters.json", "utf8"); มีjson = true; } catch { /* ดีแล้ว */ }
  assert.equal(มีjson, false,
    "เจอ list-filters.json — รูปนั้นอ่านไม่ได้บน production (createRequire ไม่ถูกรวมเข้าฟังก์ชัน) ⇒ ใช้ .mjs เท่านั้น");
});

test("คำอธิบายไฟล์ต้องกันการอ่านผิดทิศ — ห้ามใช้ตัดสินว่า 'ไม่รับ'", () => {
  const d = ตารางตัวกรอง;
  const ช่วย = String(d["🔑 อ่านไฟล์นี้ยังไง"] || "");
  assert.match(ช่วย, /อย่างน้อยเท่านี้/, "ต้องบอกว่าเป็นรายการขั้นต่ำ");
  assert.match(ช่วย, /ห้ามใช้ตัดสินว่า/, "ต้องห้ามใช้ทิศลบอย่างชัดเจน");
});
