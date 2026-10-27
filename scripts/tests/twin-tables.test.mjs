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
import "./_ล็อกปลูก.mjs";   // 🔒 ปลูกลงไฟล์จริงต้องทำทีละราย

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
  /* 📌 เลิกคาด `LADDER` ที่นี่ 12 ต.ค. 2569 — คู่นั้นถูกยุบเป็นแหล่งเดียว
   *    (`src/lib/image-ladder.mjs`) และย้ายไปด่าน `check-image-ladder.mjs`
   *    ⇒ เทสของคลาสนั้นอยู่ที่ `scripts/tests/image-ladder.test.mjs` แล้ว
   *    🔑 **ไม่ได้ลบการพิสูจน์ ย้ายที่** — ลบเฉย ๆ คือวิธีที่คลาสนี้กลับมาเงียบ ๆ */
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
  /* ย้ายเป้ามาที่ตารางค่าส่ง (คู่ที่ยังเหลือในด่านนี้) — ทิศนี้สำคัญที่สุดและต้องมีต่อ
   * ⚠️ ของเดิมปลูกที่ `scripts/img-to-r2.mjs` ซึ่งตอนนี้ `import` แทนการประกาศ
   *    ⇒ ตัวช่วยปลูกโยนทันทีว่า "ปลูกไม่ลง ⇒ ผลเทสนี้ไม่มีค่า" (ซึ่งถูกต้อง ไม่ใช่บั๊ก) */
  /* 🔴 ปลูกต้องทำให้ **สกัดไม่ออกจริง** — ลองครั้งแรกด้วย
   *    `SHIPPING_TIERS` → `SHIPPING_TIERS_เปลี่ยนชื่อ` แล้ว **ด่านยังเขียว**
   *    เพราะ regex เป็น `SHIPPING_TIERS[^=]*=` ⇒ ชื่อที่ยาวกว่ายัง**แมตช์เป็นคำนำหน้า**
   *    (คลาสที่ทีมจดไว้: การเทียบแบบ substring ปล่อยชื่อที่ยาวกว่าผ่านฟรี)
   *    ⇒ ต้องปลูกที่ **รูปของค่า** ไม่ใช่ที่ชื่อ: ห่อด้วย `Object.freeze(` ให้ `= [` หายไป */
  const r = ปลูกแล้วรัน("src/lib/shipping.ts",
    "export const SHIPPING_TIERS: readonly ShippingTier[] = [",
    "export const SHIPPING_TIERS: readonly ShippingTier[] = Object.freeze([");
  assert.equal(r.rc, 1, "สกัดไม่ออกต้องตก — ไม่งั้นด่านเขียวตลอดกาลโดยไม่เทียบอะไร");
  assert.match(r.out, /สกัดไม่ได้ ⇒ ถือว่าตก/);
});
