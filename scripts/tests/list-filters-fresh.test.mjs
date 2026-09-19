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

test("ตารางตัวกรองต้องไม่ค้าง — สร้างใหม่แล้วต้องได้ของเดิม", () => {
  const ก่อน = JSON.parse(readFileSync("netlify/lib/list-filters.json", "utf8"));
  execFileSync("node", ["scripts/gen-list-filters.mjs"], { stdio: "pipe" });
  const หลัง = JSON.parse(readFileSync("netlify/lib/list-filters.json", "utf8"));
  /* เทียบเฉพาะเนื้อ — `สร้างเมื่อ` ต่างกันทุกครั้งโดยธรรมชาติ */
  assert.deepEqual(หลัง.เส้น, ก่อน.เส้น,
    "ตารางตัวกรองค้าง ⇒ รัน `node scripts/gen-list-filters.mjs` แล้ว commit ไฟล์ตามไปด้วย");
});

test("แถวที่ว่างต้องเป็น null ไม่ใช่ [] — ว่างเปล่ากับ 'ไม่รับอะไรเลย' คนละเรื่อง", () => {
  const d = JSON.parse(readFileSync("netlify/lib/list-filters.json", "utf8"));
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

test("คำอธิบายไฟล์ต้องกันการอ่านผิดทิศ — ห้ามใช้ตัดสินว่า 'ไม่รับ'", () => {
  const d = JSON.parse(readFileSync("netlify/lib/list-filters.json", "utf8"));
  const ช่วย = String(d["🔑 อ่านไฟล์นี้ยังไง"] || "");
  assert.match(ช่วย, /อย่างน้อยเท่านี้/, "ต้องบอกว่าเป็นรายการขั้นต่ำ");
  assert.match(ช่วย, /ห้ามใช้ตัดสินว่า/, "ต้องห้ามใช้ทิศลบอย่างชัดเจน");
});
