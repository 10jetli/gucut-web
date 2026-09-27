/* 🔴 ด่าน: **`notSentKind` ต้องเป็นชุดปิด และรายชื่อต้องครบจริง**
 *
 * ที่มา 27 ก.ย. 2569 — ฝั่งจอถาม: "เป็นชุดปิดไหม ถ้าใช่ขอรายชื่อทั้งหมด"
 * เหตุ: วันที่เราเพิ่มชนิดที่ 7 **จอจะขึ้นค่าดิบให้คนอ่านเงียบ ๆ**
 * ⇒ ด่านนี้กวาดค่าที่ **โค้ดผลิตจริง** แล้วเทียบกับรายชื่อที่เรา export
 *   ⚠️ ไม่ได้เทียบรายชื่อกับรายชื่อ — นั่นคือถามคำถามเดียวกันสองครั้ง [[tautology-checks-are-always-green]]
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { ชนิดที่ไม่ได้ส่งทั้งหมด } from "../../netlify/lib/not-sent-kinds.mjs";

const ราก = new URL("../../netlify/lib/", import.meta.url);

/** ชนิดที่ "โค้ดผลิตจริง" — จาก `notSentKind: "x"` และจาก `ชนิด: "x"` ของด่าน */
const ที่โค้ดผลิต = await (async () => {
  const เจอ = new Map();
  for (const f of await readdir(ราก)) {
    if (!f.endsWith(".mjs")) continue;
    const src = await readFile(new URL(f, ราก), "utf8");
    for (const m of src.matchAll(/notSentKind:\s*"([a-z_]+)"/g)) เจอ.set(m[1], f);
    /* ด่านคืน `{ ชนิด: "..." }` แล้วตัวเรียกยัดลง notSentKind ⇒ นับด้วย */
    for (const m of src.matchAll(/ชนิด:\s*"([a-z_]+)"/g)) เจอ.set(m[1], f);
  }
  return เจอ;
})();

test("✅ ตัวปลูกอ่านเจอของจริง (ถ้าอ่านไม่เจอ ด่านจะเขียวลวง)", () => {
  assert.ok(ที่โค้ดผลิต.size >= 5,
    `ต้องเจอชนิดจากโค้ด ≥ 5 · เจอ ${ที่โค้ดผลิต.size}: ${[...ที่โค้ดผลิต.keys()].join(", ")}`);
});

test("🔴 ทุกชนิดที่โค้ดผลิต ต้องอยู่ในรายชื่อที่ส่งให้จอ", () => {
  const ขาด = [...ที่โค้ดผลิต].filter(([k]) => !ชนิดที่ไม่ได้ส่งทั้งหมด.includes(k));
  assert.deepEqual(ขาด.map(([k, f]) => `${k} (${f})`), [],
    "ชนิดที่โค้ดผลิตแต่ไม่อยู่ในรายชื่อ ⇒ จอจะขึ้นค่าดิบ ให้เพิ่มใน ชนิดที่ไม่ได้ส่ง");
});

test("⚠️ รายชื่อต้องไม่มีชนิดที่ไม่มีใครผลิต (กันรายชื่อค้างหลังลบโค้ด)", () => {
  const เกิน = ชนิดที่ไม่ได้ส่งทั้งหมด.filter((k) => !ที่โค้ดผลิต.has(k));
  assert.deepEqual(เกิน, [], `มีในรายชื่อแต่ไม่มีใครผลิต: ${เกิน.join(", ")} ⇒ ลบออก หรือหาที่ผลิตให้เจอ`);
});
