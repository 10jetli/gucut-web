/* 🔴 ด่าน: **กระดานต้องยกงานให้คนอื่นได้ โดยไม่ทำลายอายุงานและ id**
 *
 * 🔴 ที่มา 28 ก.ย. 2569: ท่านประธานสั่ง "ยก 4 ใบของ codex ให้คุณส้ม"
 *    แล้วพบว่า **กระดานไม่มีคำสั่งเปลี่ยนเจ้าของเลย** (มีแต่ เพิ่ม/ปิด/ทิ้ง/ถอน/ติดธง/ตั้งเวลา)
 *    ⇒ ทางเดียวที่ทำได้คือ **ทิ้งใบเก่าแล้วสร้างใหม่** ซึ่งทำลายสองอย่างเงียบ ๆ:
 *       · **อายุงาน** — ใบที่ค้าง 14 วันกลายเป็นใบใหม่เอี่ยม ⇒ ความเร่งด่วนหายไป
 *       · **id** ที่ถูกอ้างในจดหมาย/สมุดส่งงานไปแล้ว ⇒ ตามประวัติไม่ได้
 * 🔑 คลาส: **ของที่ทำไม่ได้ จะถูกทำด้วยวิธีที่ทำลายข้อมูลแทน**
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const src = await readFile(new URL("../../netlify/functions/office.mjs", import.meta.url), "utf8");

test("✅ กระดานต้องรู้จักคำสั่ง `taskOwner` (ไม่ใช่มีแต่คอมเมนต์)", () => {
  assert.match(src, /body\?\.taskOwner/, "ต้องรับคำสั่งนี้ในด่านแรกที่คัดว่าเป็นคำสั่งงาน");
  assert.match(src, /if \(body\.taskOwner\)/, "ต้องมีตัวจัดการจริง");
});

test("🔑 id ต้องดึงจาก `taskOwner` ได้ด้วย — ไม่งั้นได้ id ว่างแล้วหา 404 ทุกครั้ง", () => {
  const m = src.match(/const id = text\(([^;]*?), 40\);/s);
  assert.ok(m, "หาบรรทัดที่สร้าง id ไม่เจอ");
  assert.match(m[1], /body\.taskOwner/, "รายชื่อคำสั่งที่ดึง id ต้องรวม taskOwner");
});

test("🔴 ต้องตรวจชื่อเจ้าของด้วยชุดเดียวกับ taskAdd — ชื่อที่ไม่รู้จักต้อง 400 ห้ามเงียบ", () => {
  const บล็อก = src.slice(src.indexOf("if (body.taskOwner)"), src.indexOf("if (body.taskDone)"));
  assert.match(บล็อก, /OWNERS\.has\(o\)/, "ต้องเทียบกับชุด OWNERS");
  assert.match(บล็อก, /400/, "ชื่อผิดต้องตอบ 400");
});

test("🔑 ต้อง **ไม่แตะ `at`** (อายุงาน) และต้องจดว่าเคยเป็นของใคร", () => {
  const บล็อก = src.slice(src.indexOf("if (body.taskOwner)"), src.indexOf("if (body.taskDone)"));
  assert.ok(!/t\.at\s*=/.test(บล็อก), "ห้ามเขียนทับ t.at — อายุงานต้องคงอยู่");
  assert.match(บล็อก, /ownerWas/, "ต้องจดเจ้าของเดิม ⇒ ตอบได้ว่าใบนี้เคยเป็นของใคร");
  assert.match(บล็อก, /ownerMovedAt/, "ต้องจดเวลาที่ยก");
});

test("⚠️ งานที่ปิดแล้ว ยกให้คนอื่นไม่ได้ · และงานที่ไม่มีต้อง 404", () => {
  const บล็อก = src.slice(src.indexOf("if (body.taskOwner)"), src.indexOf("if (body.taskDone)"));
  assert.match(บล็อก, /404/, "ไม่พบงาน ⇒ 404");
  assert.match(บล็อก, /t\.done/, "ต้องกันงานที่ปิดแล้ว");
});

test("🔑 ยกให้คนเดิม ⇒ ต้องบอกว่าไม่เปลี่ยน ไม่ใช่แกล้งขึ้นว่าสำเร็จเฉย ๆ", () => {
  const บล็อก = src.slice(src.indexOf("if (body.taskOwner)"), src.indexOf("if (body.taskDone)"));
  assert.match(บล็อก, /ไม่เปลี่ยน/, "กรณีเจ้าของเดิม = คนใหม่ ต้องประกาศตัว");
});
