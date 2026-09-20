/* 🧪 ตัวช่วย "เขียนเฉพาะเมื่อเนื้อเปลี่ยน" — **ทดสอบสองทิศ ไม่ใช่ทิศเดียว**
 * 🔴 ที่มา: รอบแรกผมทดสอบแต่ทิศ "เนื้อเปลี่ยน ⇒ เขียน" (ซึ่งผ่านแม้ตัวช่วยพัง)
 *    ทิศที่ตัวช่วยมีไว้ทำ — "ต่างแค่เวลา ⇒ ไม่เขียน" — **ไม่เคยถูกทดสอบ**
 *    ⇒ ตัวช่วยพังเพราะ regex รับแค่ `,` ไม่รับ `;` และ **ผมรายงานว่าแก้แล้ว**
 * 🔑 เทสนี้จึงยืนยันด้วย **เนื้อไฟล์จริงหลังเรียก** ไม่ใช่เชื่อค่าที่ฟังก์ชันคืน
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { เขียนถ้าเนื้อเปลี่ยน } from "../lib/เขียนถ้าเนื้อเปลี่ยน.mjs";

const ที่ทำงาน = mkdtempSync(join(tmpdir(), "wnc-"));
const ไฟล์ = (ชื่อ) => join(ที่ทำงาน, ชื่อ);

test("ต่างแค่ generatedAt ที่ลงท้าย ; ⇒ ไม่เขียน (รูปของ .mjs ที่ export)", () => {
  const p = ไฟล์("a.mjs");
  const เดิม = 'export const generatedAt = "2026-09-20T01:00:00.000Z";\nexport const x = 1;\n';
  writeFileSync(p, เดิม);
  const ผล = เขียนถ้าเนื้อเปลี่ยน(p, 'export const generatedAt = "2026-09-20T02:00:00.000Z";\nexport const x = 1;\n');
  assert.equal(ผล, "เนื้อเดิม—ไม่เขียน");
  assert.equal(readFileSync(p, "utf8"), เดิม, "ไฟล์ต้องไม่ถูกแตะเลย");
});

test('ต่างแค่ "สร้างเมื่อ" ที่ลงท้าย , ⇒ ไม่เขียน (รูปใน JSON)', () => {
  const p = ไฟล์("b.mjs");
  const เดิม = '{\n  "สร้างเมื่อ": "2026-09-20T01:00:00.000Z",\n  "n": 3\n}\n';
  writeFileSync(p, เดิม);
  assert.equal(เขียนถ้าเนื้อเปลี่ยน(p, '{\n  "สร้างเมื่อ": "2026-09-20T09:00:00.000Z",\n  "n": 3\n}\n'), "เนื้อเดิม—ไม่เขียน");
  assert.equal(readFileSync(p, "utf8"), เดิม);
});

test("เนื้อเปลี่ยนจริง ⇒ เขียน (ทิศที่ผ่านแม้ตัวช่วยพัง ⇒ ต้องมีคู่กับข้างบนเสมอ)", () => {
  const p = ไฟล์("c.mjs");
  writeFileSync(p, 'export const generatedAt = "2026-09-20T01:00:00.000Z";\nexport const x = 1;\n');
  const ใหม่ = 'export const generatedAt = "2026-09-20T02:00:00.000Z";\nexport const x = 2;\n';
  assert.equal(เขียนถ้าเนื้อเปลี่ยน(p, ใหม่), "เขียนใหม่");
  assert.equal(readFileSync(p, "utf8"), ใหม่);
});

test("ไม่มีไฟล์เดิม ⇒ เขียน และบอกว่าเป็นไฟล์ใหม่ (ไม่ใช่ 'เนื้อเดิม')", () => {
  const p = ไฟล์("d.mjs");
  assert.equal(เขียนถ้าเนื้อเปลี่ยน(p, "export const x = 1;\n"), "ไฟล์ใหม่");
  assert.equal(readFileSync(p, "utf8"), "export const x = 1;\n");
});

test("บรรทัดเวลาหลายบรรทัดในไฟล์เดียว ⇒ ถอดครบทุกบรรทัด (flag g ต้องทำงาน)", () => {
  const p = ไฟล์("e.mjs");
  const เดิม = 'export const generatedAt = "A";\nexport const y = 9;\n{\n  "วัดเมื่อ": "B",\n  "z": 1\n}\n';
  writeFileSync(p, เดิม);
  assert.equal(เขียนถ้าเนื้อเปลี่ยน(p, 'export const generatedAt = "C";\nexport const y = 9;\n{\n  "วัดเมื่อ": "D",\n  "z": 1\n}\n'), "เนื้อเดิม—ไม่เขียน");
  assert.equal(readFileSync(p, "utf8"), เดิม);
});

test("ปลูกของเสีย: ถ้าตัวช่วยเลิกถอดเวลา เทสข้างบนต้องแดง (พิสูจน์พลังแยกแยะ)", () => {
  /* จำลองรุ่นที่พัง — รับแค่ `,` ไม่รับ `;` = บั๊กของจริงวันที่ 20 ก.ย. 2569 */
  const พัง = (เดิม, ใหม่) => {
    const ถอด = (s) => s.replace(/^\s*"(?:สร้างเมื่อ|วัดเมื่อ|generatedAt)"\s*:\s*"[^"]*",?\s*$/gm, "⟪เวลา⟫");
    return ถอด(เดิม) === ถอด(ใหม่) ? "เนื้อเดิม—ไม่เขียน" : "เขียนใหม่";
  };
  assert.equal(
    พัง('export const generatedAt = "A";\nexport const x = 1;\n', 'export const generatedAt = "B";\nexport const x = 1;\n'),
    "เขียนใหม่",
    "รุ่นพังต้องตอบ 'เขียนใหม่' — ถ้ามันตอบ 'ไม่เขียน' เทสชุดนี้แยกแยะอะไรไม่ได้"
  );
});

process.on("exit", () => { try { rmSync(ที่ทำงาน, { recursive: true, force: true }); } catch {} });
