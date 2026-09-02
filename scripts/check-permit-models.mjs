// ตรวจว่ารายชื่อรุ่นเลื่อยยนต์ฝั่งเซิร์ฟเวอร์ยังตรงกับต้นฉบับ — รันตอน prebuild
//
// ต้นฉบับ: src/lib/permit.ts (PERMIT_MODELS / EXEMPT_MODELS)
// สำเนา  : netlify/lib/permit-models.mjs (ฟังก์ชัน .mjs import ไฟล์ .ts ตรง ๆ ไม่ได้)
//
// ⚠️ **ไม่ตรงกัน = build ตก** โดยตั้งใจ — นี่เป็นข้อมูลกฎหมาย ไม่ใช่ค่าตกแต่ง
//    ร้านเพิ่มรุ่นใหม่ในเว็บแล้วลืมแก้ฝั่งเซิร์ฟเวอร์ = เครื่องคิดเงินไม่เตือนเรื่องทะเบียน
//    ลูกค้าถือเลื่อยที่ต้องมีใบอนุญาตออกจากร้านโดยไม่มีใครรู้ (กติกาเดียวกับ check-floating)
import { readFileSync } from "node:fs";

const fail = (msg) => {
  console.error(`\n❌ check-permit-models: ${msg}\n`);
  process.exit(1);
};

const ts = readFileSync(new URL("../src/lib/permit.ts", import.meta.url), "utf8");

/** ดึงค่า model: "..." ทั้งหมดในบล็อกที่ชื่อ name */
function modelsFrom(name) {
  const start = ts.indexOf(`export const ${name}`);
  if (start < 0) fail(`หา ${name} ใน src/lib/permit.ts ไม่เจอ`);
  const open = ts.indexOf("[", start);
  const close = ts.indexOf("\n];", open);
  if (open < 0 || close < 0) fail(`อ่านบล็อก ${name} ไม่ออก`);
  const body = ts.slice(open, close);
  const out = [...body.matchAll(/model:\s*"([^"]+)"/g)].map((m) => m[1]);
  if (!out.length) fail(`${name} ว่างเปล่า — น่าจะอ่านผิดตำแหน่ง`);
  return out;
}

const srcPermit = modelsFrom("PERMIT_MODELS");
const srcExempt = modelsFrom("EXEMPT_MODELS");

const { PERMIT_MODELS, EXEMPT_MODELS } = await import("../netlify/lib/permit-models.mjs");

const same = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

if (!same(srcPermit, PERMIT_MODELS)) {
  fail(
    `รายการ "ต้องขอใบอนุญาต" ไม่ตรงกัน\n` +
      `  src/lib/permit.ts        : ${srcPermit.join(" · ")}\n` +
      `  netlify/lib/permit-models: ${PERMIT_MODELS.join(" · ")}`
  );
}
if (!same(srcExempt, EXEMPT_MODELS)) {
  fail(
    `รายการ "ไม่ต้องขอใบอนุญาต" ไม่ตรงกัน\n` +
      `  src/lib/permit.ts        : ${srcExempt.join(" · ")}\n` +
      `  netlify/lib/permit-models: ${EXEMPT_MODELS.join(" · ")}`
  );
}

console.log(
  `check-permit-models: รุ่นเลื่อยยนต์ตรงกันทั้งสองที่ ✓ ` +
    `(ต้องขอ ${srcPermit.length} · ไม่ต้องขอ ${srcExempt.length})`
);
