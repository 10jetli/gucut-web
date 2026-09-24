/* เทสเส้น `?appliedkeys=1` — เสิร์ฟผลยิงจริงที่เคย "วัดได้แล้วทิ้งระหว่างทาง"
 *
 * 🔴 ที่มา 19 ก.ย. 2569 ค่ำ: `netlify/lib/list-applied-keys.mjs` ถูกเขียนโดย probe
 *    (ผลจากการยิงจริงทุกเส้น) แต่ **ไม่มีใครอ่าน** — ท่อไม่ import · จอไม่รู้ว่ามี
 *    🔑 เจอเพราะไล่คำถาม "ไฟล์ไหนไม่มีอะไรจุดชนวน" ⇒ ตัวเดียวในทั้งฝั่งเซิร์ฟเวอร์
 *    และฝั่งจอรออันนี้อยู่เพื่อทำด่านเทียบคำกล่าวอ้าง 186 จุดของเขา
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("ไฟล์ข้อมูลมีรูปที่เส้นนี้พึ่งได้", async () => {
  const { คีย์ที่เส้นพิจารณา } = await import("../../netlify/lib/list-applied-keys.mjs");
  const ชื่อ = Object.keys(คีย์ที่เส้นพิจารณา);
  assert.ok(ชื่อ.length >= 20, `ควรมีเส้นอย่างน้อย 20 เส้น (มี ${ชื่อ.length})`);
  /* 🔑 null = เส้นนั้นไม่ส่ง applied ⇒ **ยังไม่รู้** ห้ามอ่านว่า "ไม่รับตัวกรอง" */
  const ยังไม่ส่ง = ชื่อ.filter((k) => คีย์ที่เส้นพิจารณา[k]?.พิจารณา === null);
  const ส่งแล้ว = ชื่อ.filter((k) => Array.isArray(คีย์ที่เส้นพิจารณา[k]?.พิจารณา));
  assert.equal(ยังไม่ส่ง.length + ส่งแล้ว.length, ชื่อ.length,
    "ทุกเส้นต้องอยู่ในสองกลุ่มนี้ — ถ้าไม่ครบคือมีรูปที่สามที่เรายังไม่รู้จัก");
  assert.ok(ส่งแล้ว.length > 0, "ต้องมีเส้นที่ส่ง applied แล้วบ้าง");
});

test("เส้นในท่อ: GET เท่านั้น · คิดช่วงวันวัดจากของจริง · ประกาศว่าไม่ใช่ข้อมูลสด", () => {
  const src = readFileSync("netlify/functions/core.mjs", "utf8");
  const i = src.indexOf('url.searchParams.get("appliedkeys")');
  assert.ok(i > 0, "ต้องมีเส้น appliedkeys");
  const บล็อก = src.slice(i, i + 2600);
  assert.match(บล็อก, /GET เท่านั้น/);
  assert.match(บล็อก, /วัดเมื่อเก่าสุด/, "ต้องส่งช่วงวันวัด ไม่ใช่ค่าเดียว");
  assert.match(บล็อก, /\*\*ไม่ใช่ข้อมูลสด\*\*/, "ต้องประกาศว่าไม่สด ไม่งั้นจอจะอ่านว่าเป็นสถานะปัจจุบัน");
  assert.match(บล็อก, /ห้ามอ่านว่า/, "ต้องกันการอ่าน null ว่า 'ไม่รับตัวกรอง'");
});

test("🔑 ไฟล์ข้อมูลนี้ต้องมีคนอ่านจริง (กันกลับไปเป็น 'วัดได้แล้วทิ้ง')", () => {
  const src = readFileSync("netlify/functions/core.mjs", "utf8");
  assert.match(src, /import\("\.\.\/lib\/list-applied-keys\.mjs"\)/,
    "ท่อต้อง import ไฟล์นี้ — ถ้าไม่มีใครอ่าน มันก็กลับไปเป็นผลวัดที่ถูกทิ้งระหว่างทาง");
});
