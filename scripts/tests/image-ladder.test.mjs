/* เทสด่าน "ขั้นบันไดขนาดรูปต้องมีแหล่งเดียว"
 *
 * 🔴 ที่มา 12 ต.ค. 2569 · ฝั่งจอกวาดสองรีโปแล้วพบว่าค่า `[128,256,384,640]` มี **5 ที่**
 *    ไม่ใช่ 2 ที่อย่างที่ `check-twin-tables` เฝ้าไว้ ⇒ ยุบเป็นแหล่งเดียวแล้วเปลี่ยนคำถาม
 *    เป็น "ยังมีใบที่สองอยู่ไหม"
 *
 * 🔑 ต้องพิสูจน์ **สามทิศ** (เหมือนด่านพี่น้องของมัน):
 *    ① ตอนนี้แหล่งเดียวจริง ⇒ เขียว  ② มีสำเนากลับมา ⇒ แดง
 *    ③ **ของที่ชื่อซ้ำแต่คนละเรื่อง ⇒ ต้องไม่แดง** (แดงลวงแพงกว่าเขียวลวง เพราะคนลงมือแก้ตาม)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import "./_ล็อกปลูก.mjs";   // 🔒 ปลูกลงไฟล์จริงต้องทำทีละราย

const รัน = (args = []) => {
  try {
    return { rc: 0, out: execFileSync("node", ["scripts/check-image-ladder.mjs", ...args], { encoding: "utf8" }) };
  } catch (e) {
    return { rc: e.status ?? 1, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
};

/** ปลูกในไฟล์จริง แล้วคืนสภาพเสมอ — ปลูกไม่ลง = โยน (ผลเทสที่ปลูกไม่ลงไม่มีค่า) */
function ปลูกแล้วรัน(path, จาก, เป็น) {
  const เดิม = readFileSync(path, "utf8");
  assert.ok(เดิม.includes(จาก), `ปลูกไม่ลง: ไม่เจอ "${จาก}" ใน ${path} ⇒ ผลเทสนี้ไม่มีค่า`);
  try {
    writeFileSync(path, เดิม.replace(จาก, เป็น));
    return รัน();
  } finally {
    writeFileSync(path, เดิม);
  }
}

test("① ตอนนี้แหล่งเดียวจริง ⇒ เขียว และต้องประกาศขอบเขตของตัวเอง", () => {
  const r = รัน();
  assert.equal(r.rc, 0);
  assert.match(r.out, /แหล่งเดียว/);
  assert.match(r.out, /ฝั่งจอคนละรีโป/, "ผลเขียวต้องบอกเองว่าไม่ได้ครอบฝั่งจอ");
});

test("② สำเนากลับมาในไฟล์จริง ⇒ แดง พร้อมบอกความเสียหาย", () => {
  const r = ปลูกแล้วรัน("scripts/img-to-r2.mjs",
    'import { LADDER } from "../src/lib/image-ladder.mjs";',
    "const LADDER = [128, 256, 384, 640];");
  assert.equal(r.rc, 1);
  assert.match(r.out, /img-to-r2\.mjs:\d+ ประกาศขั้นบันไดเอง/);
  assert.match(r.out, /รูปหายทั้งเว็บ/, "ต้องบอกความเสียหาย ไม่ใช่แค่ว่าซ้ำ");
});

test("③ 🔑 สำเนาที่ค่าเพี้ยน (ไม่ใช่แค่ซ้ำ) ⇒ ต้องแดงด้วย", () => {
  const r = ปลูกแล้วรัน("scripts/zort-images-to-r2.mjs",
    'import { LADDER } from "../src/lib/image-ladder.mjs";',
    "const LADDER = [128, 256, 384, 512];");
  assert.equal(r.rc, 1, "สำเนาที่ค่าต่างคือกรณีที่อันตรายที่สุด ต้องไม่หลุด");
  assert.match(r.out, /zort-images-to-r2/);
});

test("④ ใบไม้ต้องสะอาด — ถ้ามันเริ่ม import อะไร ⇒ แดง", () => {
  /* เหตุผล: ไฟล์นี้ถูกนำเข้าโดย `src/lib/image-loader.js` ซึ่งเป็น `loaderFile` ของ Next
     ⇒ อยู่ในบันเดิลเบราว์เซอร์ลูกค้าทุกคน · ใบไม้ที่ import ของอื่นลากโค้ดเซิร์ฟเวอร์เข้าไปได้ */
  const r = ปลูกแล้วรัน("src/lib/image-ladder.mjs",
    "export const LADDER = [128, 256, 384, 640];",
    'import { x } from "node:fs";\nexport const LADDER = [128, 256, 384, 640];');
  assert.equal(r.rc, 1);
  assert.match(r.out, /ใบไม้ต้องไม่มี dependency|เริ่ม import/);
});

test("⑤ 🔑 ของที่ชื่อซ้ำแต่คนละเรื่อง ต้องไม่ถูกจับ (กันแดงลวง)", () => {
  /* `src/lib/social.ts` มี `const STEPS = [0, 0.5, 0.9]` = ระดับความลึกการดูคลิป
     `scripts/video-to-r2.mjs` มี `LADDER` เป็นออบเจกต์ = ความสูงคลิป
     ทั้งสองยังอยู่ในที่เดิมตอนรันเทสนี้ ⇒ ด่านต้องยังเขียว */
  const social = readFileSync("src/lib/social.ts", "utf8");
  assert.match(social, /const STEPS = \[0, 0\.5, 0\.9\]/,
    "เป้าเงื่อนไขหาย — เทสนี้ไม่มีอำนาจแยกแยะแล้ว ให้หาเป้าใหม่ ไม่ใช่ลบเทส");
  assert.match(readFileSync("scripts/video-to-r2.mjs", "utf8"), /const LADDER = \[/,
    "เป้าเงื่อนไขหาย — เทสนี้ไม่มีอำนาจแยกแยะแล้ว");
  assert.equal(รัน().rc, 0, "ของที่ชื่อซ้ำแต่คนละเรื่องต้องไม่ทำให้ด่านแดง");
});

test("⑥ ตัวควบคุมสองทางของด่านเองต้องผ่าน (ด่านที่ตัวควบคุมตาย = เขียวตลอดกาล)", () => {
  const r = รัน(["--selftest"]);
  assert.equal(r.rc, 0);
  assert.match(r.out, /แยกแยะได้จริง/);
});
