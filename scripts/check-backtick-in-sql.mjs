#!/usr/bin/env node
/* 🔴 ด่าน: backtick ในคอมเมนต์ SQL ปิด template literal กลางทาง
 *
 * ที่มา (5 ต.ค. 2569): ผมเหยียบคลาสนี้ **4 ครั้งในคืนเดียว** ทุกครั้งเป็นคอมเมนต์ SQL (`-- ...`)
 * ที่อยู่ข้างในคำสั่ง SQL ซึ่งเขียนเป็น template literal แล้วผมพิมพ์ชื่อคอลัมน์คร่อม backtick
 * ตามนิสัยการเขียนมาร์กดาวน์ ⇒ สตริงปิดกลางทาง ⇒ `SyntaxError: missing ) after argument list`
 * ⇒ `node --check` จับได้ทุกครั้ง **แต่หลังเสียเวลาไปแล้ว** และหนึ่งรอบเกือบ commit ไปก่อน
 *
 * 🔑 เหตุที่ต้องเป็นด่าน ไม่ใช่คำเตือน: สี่ครั้งติดแปลว่า "ความตั้งใจ" ไม่ได้ผล
 *    (กฎ rules-need-a-gate-not-a-reminder)
 *
 * ⚠️ **ขอบเขตที่ตั้งใจให้แคบ** — ตรวจเฉพาะบรรทัดที่ ① อยู่ในไฟล์ .mjs ใต้ `netlify/`
 *    ② ขึ้นต้นด้วย `--` (คอมเมนต์ SQL) ③ มี backtick
 *    เพราะคอมเมนต์ SQL อยู่ใน template literal **เสมอโดยนิยาม** (SQL เขียนในนั้นที่เดียว)
 * 🚫 **ห้ามขยายให้ตรวจ backtick ทุกที่** — ทั้งรีโปใช้ backtick ในคอมเมนต์ JS เป็นปกติ
 *    ขยายแล้วได้แดงลวงหลายร้อยจุด แล้วคนจะเลิกอ่านด่านนี้ (แดงลวงแพงกว่าเขียวลวง)
 *
 * ใช้: node scripts/check-backtick-in-sql.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** 🔑 เกณฑ์เดียวที่ทั้งการกวาดจริงและตัวควบคุมใช้ร่วมกัน
 *  ⚠️ แยกออกมาเป็นฟังก์ชันโดยตั้งใจ — ถ้าตัวควบคุมทดสอบ "สำเนาของเกณฑ์"
 *     มันจะเขียวอยู่ต่อให้ของจริงเปลี่ยนไปแล้ว (กฎ edit-the-copy-that-runs) */
export const เป็นคอมเมนต์SQLที่มีbacktick = (บรรทัด) =>
  /^\s*--/.test(บรรทัด) && บรรทัด.includes("`");

/* 🧪 ━━ ตัวควบคุมสองทาง ฝังในตัวด่าน รันทุกรอบ ━━
   ⚠️ ฝังในไฟล์ **ไม่ใช่ขั้นแยกใน package.json** — ขั้นแยกถอดออกได้โดยด่านยังเขียว
   🔑 ฝั่ง "ต้องไม่จับ" สำคัญกว่า เพราะมันคือสิ่งที่กันตะแกรงจาก **กว้างเกิน**
      (ถ้าด่านนี้จับ backtick ในคอมเมนต์ JS ด้วย จะได้แดงลวงหลายร้อยจุดทันที) */
{
  const ต้องจับ = [
    "            -- ค่าคอมโฆษณา `ams_commission` — เพิ่ม 4 ต.ค.",
    "  -- `cogs` คือราคาขาย",
    "-- `x`",
  ];
  const ต้องไม่จับ = [
    "            -- ค่าคอมโฆษณา ams_commission — เพิ่ม 4 ต.ค.",   // ไม่มี backtick
    "    /* คอมเมนต์ JS ที่มี `backtick` ได้ตามปกติ */",            // ไม่ใช่คอมเมนต์ SQL
    "    // อธิบายว่า `formula_sig` คืออะไร",                      // คอมเมนต์ JS บรรทัดเดียว
    "  const sql = `SELECT 1`;",                                   // โค้ดจริง backtick ถูกต้อง
    "            SUM(CASE WHEN formula_sig IS NULL THEN 1 ELSE 0 END) AS n,", // SQL ธรรมดา
    "",
  ];
  const พลาด = [
    ...ต้องจับ.filter((x) => !เป็นคอมเมนต์SQLที่มีbacktick(x)).map((x) => `ต้องจับแต่ไม่จับ: ${x}`),
    ...ต้องไม่จับ.filter((x) => เป็นคอมเมนต์SQLที่มีbacktick(x)).map((x) => `ต้องไม่จับแต่จับ: ${x}`),
  ];
  if (พลาด.length) {
    console.log(`GATE-FAIL: ตัวควบคุมของด่านนี้เองไม่ผ่าน ${พลาด.length} ข้อ ⇒ ตะแกรงแยกแยะไม่ได้ **ห้ามเชื่อผลกวาด**`);
    for (const x of พลาด) console.log(`   ${x}`);
    process.exit(1);
  }
}

const ราก = "netlify";
const ไฟล์ = [];
(function เดิน(d) {
  for (const ชื่อ of readdirSync(d)) {
    const พาธ = join(d, ชื่อ);
    if (statSync(พาธ).isDirectory()) เดิน(พาธ);
    else if (ชื่อ.endsWith(".mjs")) ไฟล์.push(พาธ);
  }
})(ราก);

/* 🔑 **พื้นประชากร** — กวาดได้ 0 ไฟล์ = ตะแกรงพัง ไม่ใช่ "รีโปสะอาด"
   (แกน ② ของ check-gate-selfcontrol — ตอบคำถามว่า "เรายังส่องของอยู่จริงไหม") */
if (ไฟล์.length < 50) {
  console.log(`GATE-FAIL: กวาดเจอแค่ ${ไฟล์.length} ไฟล์ใต้ ${ราก}/ ⇒ ผิดปกติ (เคยวัดได้ 192) **ตะแกรงพัง ไม่ใช่สะอาด**`);
  process.exit(1);
}

const พบ = [];
for (const f of ไฟล์) {
  readFileSync(f, "utf8").split("\n").forEach((ln, i) => {
    if (เป็นคอมเมนต์SQLที่มีbacktick(ln)) พบ.push({ f, n: i + 1, ln: ln.trim().slice(0, 100) });
  });
}

if (พบ.length) {
  console.log(`GATE-FAIL: backtick ในคอมเมนต์ SQL ${พบ.length} จุด — คอมเมนต์ SQL อยู่ใน template literal เสมอ ⇒ backtick ปิดสตริงกลางทาง`);
  for (const x of พบ) console.log(`   ${x.f}:${x.n}  ${x.ln}`);
  console.log(`   ⇒ เขียนชื่อคอลัมน์เปล่า ๆ หรือครอบด้วยเครื่องหมายคำพูดเดี่ยวแทน`);
  process.exit(1);
}
console.log(`✅ ไม่มี backtick ในคอมเมนต์ SQL (กวาด ${ไฟล์.length} ไฟล์ใต้ ${ราก}/ · ตัวควบคุมสองทางผ่าน)`);
