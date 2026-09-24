/* เทสด่าน "ตารางที่ต้องตรงกันสองที่"
 * 🔴 ที่มา 19 ก.ย. 2569 · ฝั่งจอถาม **"กติกายังถูกทำตามจริงไหม"** ⇒ ไล่ CLAUDE.md
 *    เจอคำว่า "ต้องตรงกัน" 2 ข้อ · **ทั้งสองข้อไม่มีกลไกบังคับ** มีแต่คอมเมนต์ชี้หากัน
 * 🔑 เทสนี้ต้องพิสูจน์ **สามทิศ**: ไม่ตรง ⇒ แดง · สกัดไม่ออก ⇒ แดง · ตรงกัน ⇒ เขียว
 *    ทิศกลางสำคัญที่สุด — ถ้าสกัดไม่ออกแล้วเขียว ด่านจะเขียวตลอดกาลโดยไม่เทียบอะไรเลย
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const รันด่าน = () => {
  try {
    return { rc: 0, out: execFileSync("node", ["scripts/check-twin-tables.mjs"], { encoding: "utf8" }) };
  } catch (e) {
    return { rc: e.status ?? 1, out: String(e.stdout ?? "") };
  }
};

/** ปลูกในไฟล์จริง แล้วคืนสภาพเสมอ — ปลูกไม่ลง = โยน (ผลเทสที่ปลูกไม่ลงไม่มีค่า) */
function ปลูกแล้วรัน(path, จาก, เป็น) {
  const เดิม = readFileSync(path, "utf8");
  assert.ok(เดิม.includes(จาก), `ปลูกไม่ลง: ไม่เจอ "${จาก}" ใน ${path} ⇒ ผลเทสนี้ไม่มีค่า`);
  try {
    writeFileSync(path, เดิม.replace(จาก, เป็น));
    return รันด่าน();
  } finally {
    writeFileSync(path, เดิม);
  }
}

test("ตอนนี้ตรงกันจริง (ทิศเขียว)", () => {
  const r = รันด่าน();
  assert.equal(r.rc, 0);
  assert.match(r.out, /LADDER/);
  assert.match(r.out, /ตารางค่าส่ง/);
  assert.match(r.out, /ไม่ใช่ "คิดเงินเหมือนกัน"/, "ต้องประกาศขอบเขตของตัวเองทุกรอบ");
});

test("เลขต่างกันบาทเดียว ⇒ แดง", () => {
  const r = ปลูกแล้วรัน("netlify/lib/shipping.mjs", "upTo: 500", "upTo: 501");
  assert.equal(r.rc, 1);
  assert.match(r.out, /ตารางค่าส่ง[\s\S]*ไม่ตรงกัน/);
  assert.match(r.out, /เงินจริง/, "ต้องบอกความเสียหาย ไม่ใช่แค่ว่าไม่ตรง");
});

test("🔑 สกัดไม่ออก ⇒ แดง ไม่ใช่เขียว", () => {
  const r = ปลูกแล้วรัน("scripts/img-to-r2.mjs", "const LADDER =", "const ขั้นบันได =");
  assert.equal(r.rc, 1, "สกัดไม่ออกต้องตก — ไม่งั้นด่านเขียวตลอดกาลโดยไม่เทียบอะไร");
  assert.match(r.out, /สกัดไม่ได้ ⇒ ถือว่าตก/);
});
