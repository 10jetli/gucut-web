/* สร้าง netlify/lib/cron-table.mjs จาก "ซอร์สจริงของฟังก์ชัน" ตอน build
 *
 * 🔴 ที่มา (ฝั่งจอขอ 18 ก.ย. 2569): วันนี้ตาราง cron เปลี่ยนสองรอบ
 *    (aacde9e ลดเหลือวันละครั้ง → e54292e กลับเป็นทุก 15 นาที)
 *    จอของเขาค้างค่าของรอบกลางอยู่ครึ่งวัน เพราะ **ตารางถูกพิมพ์ไว้สองที่** (ท่อ + จอ)
 *    🔑 กฎ "เกณฑ์เดียวกันต้องมีแหล่งเดียว" — สองจอบอกคนละเลขเรื่องเดียวกัน แย่กว่าไม่มีเกณฑ์
 *
 * ⚠️ **ห้ามพิมพ์ค่า cron ลงในไฟล์นี้หรือใน core.mjs** — ค่าต้องมาจาก `export const config`
 *    ของฟังก์ชันนั้นเองเท่านั้น ⇒ ใครแก้ตารางที่ไฟล์ฟังก์ชัน ตารางนี้เปลี่ยนเองในรอบ build ถัดไป
 * ⚠️ runtime ของ Netlify function **อ่านซอร์สของฟังก์ชันอื่นไม่ได้** (แต่ละตัวถูก bundle แยก)
 *    จึงต้องอ่านตอน build แล้วฝากไว้เป็นโมดูลที่ import ได้ ไม่ใช่ fs.readdir ตอนตอบคำขอ
 * ⚠️ อ่านไม่ได้/ไม่เจอ ⇒ **ห้ามเดา** ปล่อย cron เป็น null แล้วให้จอเขียนว่า "ยังบอกไม่ได้"
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ราก = join(dirname(fileURLToPath(import.meta.url)), "..");
const โฟลเดอร์ = join(ราก, "netlify", "functions");
const ปลายทาง = join(ราก, "netlify", "lib", "cron-table.mjs");

/** ดึงค่า schedule จากซอร์ส · คืน null ถ้าไม่มี (ไม่ใช่ฟังก์ชันตามเวลา) */
function หาSchedule(src) {
  // รองรับทั้ง schedule: "..." และ schedule:'...' · เอาตัวแรกที่เจอในบล็อก config
  const m = src.match(/export\s+const\s+config\s*=\s*\{[^}]*schedule\s*:\s*["'`]([^"'`]+)["'`]/s);
  return m ? m[1] : null;
}

/** คำอธิบายสั้น — บรรทัดคอมเมนต์แรกของไฟล์ ตัดเครื่องหมายนำหน้าออก
 *  ⚠️ คำอธิบายเป็นของคนอ่าน **ห้ามให้มันมีอำนาจตัดสินใจ** ฝั่งจอต้องตัดสินจาก `cron` เท่านั้น */
function หาคำอธิบาย(src) {
  for (const บรรทัด of src.split("\n", 12)) {
    const t = บรรทัด.replace(/^\s*(\/\/|\/\*+|\*)\s*/, "").trim();
    if (t && !t.startsWith("import") && t.length > 8) return t.slice(0, 160);
  }
  return null;
}

const งาน = [];
for (const ไฟล์ of readdirSync(โฟลเดอร์).filter((f) => f.endsWith(".mjs")).sort()) {
  let src;
  try {
    src = readFileSync(join(โฟลเดอร์, ไฟล์), "utf8");
  } catch {
    continue;                       // อ่านไฟล์เดียวไม่ได้ ⇒ ข้ามตัวนั้น ไม่ล้มทั้งตาราง
  }
  const cron = หาSchedule(src);
  if (!cron) continue;              // ไม่ใช่ฟังก์ชันตามเวลา
  งาน.push({
    id: ไฟล์.replace(/\.mjs$/, ""),
    file: `netlify/functions/${ไฟล์}`,
    cron,
    desc: หาคำอธิบาย(src),
  });
}

/* 🔴 ไม่เจอเลยสักตัว = การอ่านพัง ไม่ใช่ "ร้านไม่มีงานตามเวลา"
   ⇒ โยน error ให้ build ตก ห้ามเขียนไฟล์ว่าง — ไฟล์ว่างจะทำให้จอขึ้นว่า
     "ไม่มีงานตามเวลาเลย" ซึ่งดูเหมือนคำตอบที่สมบูรณ์ทั้งที่เป็นความพัง */
if (!งาน.length) {
  throw new Error("gen-cron-table: ไม่เจอฟังก์ชันตามเวลาสักตัว — รูปแบบ export const config เปลี่ยนไปแล้วหรือ path ผิด");
}

/* เขียนเป็น .mjs ไม่ใช่ .json โดยตั้งใจ — JSON import ต้องมี import attribute
   ซึ่ง Node กับ bundler ของ Netlify ตีความต่างกันได้ ⇒ โมดูลธรรมดาไม่มีปัญหานั้นเลย
   ⚠️ ไฟล์นี้ถูกสร้างตอน build ⇒ **commit ทันทีหลังรัน** ไม่งั้นอีกบัญชี pull ไม่ผ่าน */
writeFileSync(
  ปลายทาง,
  "// ⚠️ ไฟล์นี้ถูกสร้างอัตโนมัติโดย scripts/gen-cron-table.mjs — ห้ามแก้มือ\n" +
  "// ค่า cron มาจาก `export const config` ของไฟล์ฟังก์ชันจริง (แหล่งเดียว)\n" +
  `export const generatedAt = ${JSON.stringify(new Date().toISOString())};\n` +
  `export const source = ${JSON.stringify("netlify/functions/*.mjs (export const config)")};\n` +
  `export const jobs = ${JSON.stringify(งาน, null, 1)};\n`
);
console.log(`gen-cron-table: เขียนตารางงานตามเวลา ${งาน.length} ตัว → netlify/lib/cron-table.mjs`);
