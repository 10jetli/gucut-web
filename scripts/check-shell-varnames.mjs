#!/usr/bin/env node
/* 🐚 ด่าน: **ชื่อตัวแปรใน shell ต้องเป็น ASCII** + ไฟล์ .sh ต้องผ่าน `bash -n`
 *
 * 🔴 ที่มา 19 ก.ย. 2569 ค่ำ — ผมเขียน `ผลจด=$(curl … joblog …)` ใน `~/bin/รันงานบิล.sh`
 *    bash **ไม่รับชื่อตัวแปรที่ไม่ใช่ ASCII** ⇒ บรรทัดนั้นกลายเป็น "command not found"
 *    ⇒ `curl` **ยิงจริง** (command substitution ถูกขยายก่อน) แต่คำตอบถูกทิ้ง
 *    ⇒ `case "$ผลจด"` เทียบกับ **ข้อความดิบ `$ผลจด`** (bash ไม่ขยายชื่อที่ผิดรูป)
 *    ⇒ **ตัวเช็ค `fallthrough` ที่เพิ่งสร้างไม่เคยทำงานเลยสักรอบ** — และ log ขึ้นบรรทัดเดียวกันทุกครั้ง
 *      จนดูเหมือน "เน็ตมีปัญหา" ไม่ใช่ "ผมเขียนชื่อตัวแปรผิดภาษา"
 *    🔑 คลังบทเรียนมีข้อนี้อยู่แล้ว (`bash-thai-varnames-fail-silently`) — **ผมพลาดซ้ำ**
 *       ⇒ กฎที่พลาดซ้ำต้องเป็น **ด่าน** ไม่ใช่ความเข้าใจ (`rules-need-a-gate-not-a-reminder`)
 *
 * 🔑 ทำไมมันเงียบ: ผิดพลาดไปตกที่ **stderr ของ cron** ซึ่งไม่มีใครอ่าน · rc ไม่เปลี่ยน ·
 *    และค่าที่หายกลายเป็น "ข้อความดิบ" ซึ่ง `case` ยังจับได้ (ตกช่อง `*)`) ⇒ **ดังผิดเรื่อง**
 *
 * ขอบเขต: ไฟล์ `.sh` ในรีโป (เจอ = build ตก) + โฟลเดอร์นอกรีโปที่ระบุ
 *   `EXTRA_SH_DIRS` (คั่นด้วย `:` · ค่าเริ่มต้น `~/bin` ถ้ามี) ⇒ **ดังแต่ไม่ทำ build ตก**
 *   เพราะคนที่กำลัง push งานอื่นไม่ควรถูกบล็อกด้วยไฟล์ที่ไม่ได้อยู่ในรีโปนี้
 *   (และ Netlify ไม่มีโฟลเดอร์นั้น ⇒ ข้ามเงียบโดยตั้งใจ ไม่ใช่ "ตรวจแล้วผ่าน")
 *
 * 🚫 ไม่ใช่ parser — ตัดคอมเมนต์ก่อนแล้วใช้ตะแกรงคำ ⇒ อ่านว่า **"เจอเท่านี้ในตะแกรงนี้"**
 *    ของที่ซ่อนใน heredoc/eval ตะแกรงนี้ไม่เห็น
 *
 * ใช้: node scripts/check-shell-varnames.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ตัดคอมเมนต์ } from "./_strip-comments.mjs";
import { การกำหนดค่า, ลบเนื้อในสตริง } from "./_sh-varnames.mjs";

/* เหตุที่อ่านบางที่ไม่ได้ — ต้องพิมพ์ออกมา ไม่ใช่กลืน (ดูคอมเมนต์ใน catch) */
const อ่านไม่ได้ = [];

const โฟลเดอร์ในรีโป = ["scripts", "public", "netlify", "."];

function หาไฟล์sh(ราก, ลึกสุด = 2, ลึก = 0) {
  const ออก = [];
  let รายการ;
  try {
    รายการ = readdirSync(ราก, { withFileTypes: true });
  } catch (e) {
    /* 🔴 **20 ก.ย. 2569 — ของเดิมคืนรายการว่างเงียบ ๆ** ⇒ ด่านจะรายงานว่า
       "ไม่เจอไฟล์ .sh" ซึ่ง **อ่านเหมือน "ตรวจแล้วสะอาด"** ทั้งที่อ่านโฟลเดอร์ไม่ได้เลย
       🔑 กติกาที่ตกลงกับฝั่งจอ: **catch ที่คืนค่าถอย ต้องแนบเหตุเสมอ** —
          ไม่งั้น "ไม่รู้เพราะไม่มีของ" กับ "ไม่รู้เพราะอ่านไม่ได้" อ่านเหมือนกันเป๊ะ */
    อ่านไม่ได้.push(`${ราก} — ${String(e?.message || e).slice(0, 70)}`);
    return ออก;
  }
  for (const e of รายการ) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "out") continue;
    const p = join(ราก, e.name);
    if (e.isDirectory()) {
      if (ลึก < ลึกสุด) ออก.push(...หาไฟล์sh(p, ลึกสุด, ลึก + 1));
    } else if (e.name.endsWith(".sh")) ออก.push(p);
  }
  return ออก;
}

const ในรีโป = new Set();
for (const d of โฟลเดอร์ในรีโป) for (const f of หาไฟล์sh(d, d === "." ? 0 : 2)) ในรีโป.add(f);

const นอกรีโป = new Set();
const รายชื่อนอก = (process.env.EXTRA_SH_DIRS ?? `${process.env.HOME}/bin`).split(":").filter(Boolean);
for (const d of รายชื่อนอก) {
  if (!existsSync(d)) continue;
  try {
    if (!statSync(d).isDirectory()) continue;
  } catch (e) {
    อ่านไม่ได้.push(`${d} — ${String(e?.message || e).slice(0, 70)}`);
    continue;
  }
  for (const f of หาไฟล์sh(d, 1)) นอกรีโป.add(f);
}

const ปัญหา = [];
let ไฟล์ที่ตรวจ = 0;

for (const [ชุด, ในรีโปไหม] of [[ในรีโป, true], [นอกรีโป, false]]) {
  for (const path of ชุด) {
    ไฟล์ที่ตรวจ += 1;
    const ดิบ = readFileSync(path, "utf8");

    // ① ชื่อตัวแปร — ตัดคอมเมนต์ก่อน ไม่งั้นคอมเมนต์ที่เล่าเรื่องบั๊กนี้จะโดนจับเอง
    const บรรทัด = ตัดคอมเมนต์(ดิบ, path).split("\n").map(ลบเนื้อในสตริง);
    for (let i = 0; i < บรรทัด.length; i += 1) {
      const m = การกำหนดค่า.exec(บรรทัด[i]);
      if (m) ปัญหา.push({ path, บรรทัด: i + 1, เรื่อง: `ชื่อตัวแปรไม่ใช่ ASCII: \`${m[1]}=\``, ในรีโปไหม });
    }

    // ② bash -n — จับวงเล็บ/quote ไม่ปิด ที่ตะแกรงคำมองไม่เห็น
    try {
      execFileSync("bash", ["-n", path], { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
      const เหตุ = String(e.stderr ?? e.message).trim().split("\n")[0].slice(0, 160);
      ปัญหา.push({ path, บรรทัด: 0, เรื่อง: `bash -n ไม่ผ่าน: ${เหตุ}`, ในรีโปไหม });
    }
  }
}

const ร้ายแรง = ปัญหา.filter((p) => p.ในรีโปไหม);
const แค่ดัง = ปัญหา.filter((p) => !p.ในรีโปไหม);

for (const p of ร้ายแรง) console.log(`🔴 ${p.path}${p.บรรทัด ? ":" + p.บรรทัด : ""} — ${p.เรื่อง}`);
for (const p of แค่ดัง) console.log(`🟠 (นอกรีโป) ${p.path}${p.บรรทัด ? ":" + p.บรรทัด : ""} — ${p.เรื่อง}`);

console.log(
  (อ่านไม่ได้.length
    ? `\n🔴 **อ่านไม่ได้ ${อ่านไม่ได้.length} ที่ ⇒ ส่วนนั้น "ยังไม่ได้ตรวจ" ไม่ใช่ "สะอาด"**: ${อ่านไม่ได้.join(" · ")}`
    : "") +
  `\n📏 ตรวจ ${ไฟล์ที่ตรวจ} ไฟล์ .sh — ในรีโป ${ในรีโป.size} · นอกรีโป ${นอกรีโป.size}` +
  (นอกรีโป.size ? ` (${รายชื่อนอก.filter((d) => existsSync(d)).join(" · ")})` : " (ไม่พบโฟลเดอร์นอกรีโป ⇒ **ข้ามโดยตั้งใจ ไม่ใช่ตรวจแล้วผ่าน**)") +
  `\n   เจอปัญหา: ในรีโป ${ร้ายแรง.length} · นอกรีโป ${แค่ดัง.length}` +
  "\n   ⚠️ ตะแกรงคำ + ตัดคอมเมนต์ ⇒ \"เจอเท่านี้ในตะแกรงนี้\" **ไม่ใช่ \"มีเท่านี้\"** (heredoc/eval มองไม่เห็น)"
);

if (ร้ายแรง.length) {
  console.log("\n🔑 แก้: เปลี่ยนชื่อตัวแปรเป็น A-Z a-z 0-9 _ (ค่าและคอมเมนต์ยังเป็นไทยได้ตามปกติ)");
  process.exit(1);
}
if (แค่ดัง.length) console.log("\n🟠 ของนอกรีโปไม่ทำ build ตก — แต่ต้องไปแก้ที่เครื่อง g1 เอง");
