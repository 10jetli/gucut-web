/* 🔴 ด่าน: **ตัวอ่านแถวของ coreQuery ต้องดังเมื่อรูปผิด ไม่ใช่คืนของว่าง**
 *
 * ที่มา 27 ก.ย. 2569: `mkp-finance-mirror.mjs` อ่าน `.results` จาก `coreQuery`
 * ซึ่งคืน **อาร์เรย์ตรง ๆ** ⇒ `undefined` ⇒ `rows` ว่างเสมอ ⇒ งานตามเวลา
 * วิ่งครบ 11 รอบ/วัน ตอบ 200 ทุกรอบ **โดยไม่เคยเขียนอะไรเลย 9 วัน**
 *
 * 🔑 ตัวควบคุมสำคัญกว่าตัวปลูก: ถ้าแก้เป็น "รับสองรูป" เคสปลูกจะผ่าน
 *    แต่เราจะได้ตัวอ่านที่กลืนรูปผิดตลอดกาล ⇒ ด่านนี้บังคับว่า **รูปห่อต้องโยน**
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { แถวจากผล } from "../../netlify/lib/coredb.mjs";

test("✅ อาร์เรย์แถว (รูปที่ coreQuery คืนจริง) ⇒ ได้ของเดิมกลับมา", () => {
  const rows = [{ n: 48 }];
  assert.equal(แถวจากผล(rows), rows);
});

test("✅ ของว่างจริงคือ [] ⇒ ต้องผ่าน ไม่ใช่โยน", () => {
  assert.deepEqual(แถวจากผล([]), []);
});

test("🔴 รูปห่อ { results: [...] } ⇒ **ต้องโยน** และบอกว่าให้ลบ .results", () => {
  assert.throws(() => แถวจากผล({ results: [{ n: 48 }] }, "ทดสอบ"),
    (e) => /results/.test(e.message) && /ทดสอบ/.test(e.message));
});

test("🔴 undefined / null / object เปล่า ⇒ ต้องโยน (ห้ามกลายเป็น [] เงียบ ๆ)", () => {
  for (const ผล of [undefined, null, {}, 0, "x"]) {
    assert.throws(() => แถวจากผล(ผล), /คาดว่าจะได้อาร์เรย์/,
      `ค่า ${JSON.stringify(ผล)} ต้องโยน`);
  }
});

test("🚫 ไฟล์กระจกค่าธรรมเนียมต้องไม่เหลือ `.results` จาก coreQuery อีก", async () => {
  const { readFile } = await import("node:fs/promises");
  const ต้นฉบับ = await readFile(new URL("../../netlify/lib/mkp-finance-mirror.mjs", import.meta.url), "utf8");
  const เจอ = ต้นฉบับ.split("\n")
    .map((บรรทัด, i) => [i + 1, บรรทัด])
    .filter(([, บ]) => /\?\.results|\.results\?\.\[/.test(บ) && !/^\s*\*/.test(บ));
  assert.equal(เจอ.length, 0, `ยังเหลือ .results ที่บรรทัด ${เจอ.map(([n]) => n).join(", ")}`);
});
