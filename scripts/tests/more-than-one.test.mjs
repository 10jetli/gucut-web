/* ด่าน: **คลาส "ของที่มีมากกว่าหนึ่ง"** — ที่ที่เราเคยสมมติว่ามีหนึ่งเดียว
 *
 * 🔴 ที่มา 19 ก.ย. เย็น — ฝั่งจอเปลี่ยนไฟล์อ้างอิงจาก 1 ใบเป็น 2 ใบ ⇒ **เปิดบั๊กสองตัวทันที**
 *    (เลือก "ใบล่าสุด" ผิด · ชื่อเมนูซ้ำได้หลายกลุ่ม) ⇒ `build` เขียว · `tsc` เขียว · ไม่มีอะไรฟ้อง
 *    🔑 เราชินป้อน **รูป** ของข้อมูล (ชื่อไทย · ช่องว่าง · ค่าว่าง) แต่ลืม **จำนวน**
 * ⇒ ด่านนี้ตรึงสองจุดที่ฝั่งท่อแก้จากคลาสนี้ ไม่ให้ถอยกลับ
 * ⚠️ ขอบเขต: สองจุดนี้เท่านั้น — **ไม่ใช่การรับประกันว่าไล่ครบทั้งรีโป** (ยังเป็นหนี้)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ราก = fileURLToPath(new URL("../..", import.meta.url));
const อ่าน = (f) => readFileSync(`${ราก}${f}`, "utf8");

test("coredb: ผลจาก D1 มากกว่าหนึ่งชุด ต้องโยน ไม่ใช่หยิบชุดแรกแล้วทิ้งที่เหลือ", () => {
  const s = อ่าน("netlify/lib/coredb.mjs");
  assert.match(s, /ชุดผล\.length > 1/, "ต้องมีด่านจับกรณีหลายชุด");
  assert.match(s, /throw new Error\(\s*\n?\s*`D1 คืนผล/, "ต้องโยน error ไม่ใช่ log แล้วเดินต่อ");
  assert.doesNotMatch(s, /return data\.result\?\.\[0\]\?\.results/, "ห้ามกลับไปหยิบชุดแรกตรง ๆ");
});

test("contacts: ชื่อซ้ำกันได้ ⇒ ต้องดึง 2 แถวเพื่อรู้ว่าซ้ำ และติดธงออกไป", () => {
  const s = อ่าน("netlify/lib/core-contacts.mjs");
  assert.match(s, /OR name = \$\{esc\(key\)\} LIMIT 2/, "ต้อง LIMIT 2 (ดึงมาเพื่อรู้ว่าซ้ำ ไม่ใช่เพื่อใช้)");
  assert.match(s, /"ชื่อซ้ำกันหลายราย": ชื่อซ้ำกันหลายราย/, "ต้องส่งธงออกไปให้จอเตือน");
  assert.doesNotMatch(s, /OR name = \$\{esc\(key\)\} LIMIT 1/, "LIMIT 1 = เลือกใครก็ไม่รู้แบบเงียบ ๆ");
});
