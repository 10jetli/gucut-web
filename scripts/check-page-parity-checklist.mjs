import { readFile } from "node:fs/promises";

const file = new URL("../docs/reviews/page-parity-checklist.md", import.meta.url);
const text = await readFile(file, "utf8");

const required = [
  "## กติกาตัดสิน",
  "## แม่แบบต่อหนึ่งหน้า",
  "ปุ่ม/เมนู",
  "ช่องกรอก/ตัวกรอง",
  "การ์ด",
  "คอลัมน์",
  "กราฟ",
  "ตัวเลข",
  "loading/empty/error/partial/stale/permission",
  "### ตารางเทียบตัวเลข",
  "## ตัวอย่างกรอกจริง 1 — สร้างรายการซื้อ",
  "## ตัวอย่างกรอกจริง 2 — รายการสินค้า",
  "ต้องดูจอ ZORT",
  "ยังคำนวณเปอร์เซ็นต์ไม่ได้",
];

for (const phrase of required) {
  if (!text.includes(phrase)) throw new Error(`ใบตรวจขาดหัวข้อบังคับ: ${phrase}`);
}

const ids = [...text.matchAll(/^\| ((?:BUY|STOCK)-[A-Z]\d+) \|/gm)].map((m) => m[1]);
if (ids.length < 55) throw new Error(`ตัวอย่างสองหน้าละเอียดไม่พอ: พบ ${ids.length} รายการ`);
const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
if (duplicate) throw new Error(`ID ซ้ำ: ${duplicate}`);

const buy = ids.filter((id) => id.startsWith("BUY-")).length;
const stock = ids.filter((id) => id.startsWith("STOCK-")).length;
if (buy < 15 || stock < 35) throw new Error(`รายการต่อหน้าไม่ครบ: BUY=${buy}, STOCK=${stock}`);

const unresolvedSections = text
  .split(/^## /m)
  .filter((section) => /ตัวอย่างกรอกจริง/.test(section) && /⏳ ต้องดูจอ ZORT/.test(section));
function validatePendingSections(sections) {
  for (const section of sections) {
    if (!section.includes("ยังคำนวณเปอร์เซ็นต์ไม่ได้")) {
      throw new Error("ตัวอย่างมีรายการรอดู ZORT แต่ไม่ปิดทางเปอร์เซ็นต์ปลอม");
    }
  }
}
validatePendingSections(unresolvedSections);

// Mutation guard: เกณฑ์ 100% ต้องห้ามผ่านเมื่อ inventory ยังมีรายการรอหลักฐาน
const fakeComplete = unresolvedSections.map((section) =>
  section.replaceAll("ยังคำนวณเปอร์เซ็นต์ไม่ได้", "100%"),
);
let rejectedFakeComplete = false;
try { validatePendingSections(fakeComplete); } catch { rejectedFakeComplete = true; }
if (!rejectedFakeComplete) throw new Error("mutation guard ไม่จับ 100% ปลอม");

console.log(`page-parity-checklist: ผ่าน · BUY ${buy} รายการ · STOCK ${stock} รายการ · ID ไม่ซ้ำ`);
