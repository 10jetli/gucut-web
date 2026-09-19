#!/usr/bin/env node
/* 🔍 ด่าน: **ทุกไฟล์ `.mjs` ต้องผ่าน `node --check`**
 *
 * 🔴 ที่มา 19 ก.ย. 2569 ค่ำ — ผมเขียน `(shopee-` + `*` + `/tiktok-…)` ในคอมเมนต์ของ
 *    `gen-warn-keys.mjs` ⇒ ลำดับปิดคอมเมนต์อยู่กลางข้อความ ⇒ **ไฟล์พังทั้งไฟล์**
 *    คลังบทเรียนมีข้อนี้อยู่แล้ว (`glob-in-comment-closes-the-comment`) และสั่งไว้ว่า
 *    *"`node --check` ทุกไฟล์ .mjs ที่แก้ ก่อน commit เสมอ"* — แต่นั่นเป็น **คำเตือน ไม่ใช่ด่าน**
 *    ⇒ ผมพลาดซ้ำ ⇒ กติกาที่พลาดซ้ำต้องเป็นด่าน (`rules-need-a-gate-not-a-reminder`)
 *
 * 🔑 ทำไม `npm test` จับไม่ได้: เทสจับได้เฉพาะไฟล์ที่ **ถูก import** โดยเทสตัวใดตัวหนึ่ง
 *    ตัวสร้างใน prebuild และฟังก์ชันฝั่งเซิร์ฟเวอร์หลายไฟล์ไม่มีเทสตรง ⇒ พังแบบเงียบ
 *    จนกว่าจะถึงตอนรันจริง (ซึ่งบางตัวคือ **ตอน build บน Netlify** หรือ **ตอน cron ยิง**)
 *
 * 🔑 และ `tsc` ไม่เห็นไฟล์ `.mjs` เลย — กติกาข้อเดิมของโปรเจกต์นี้
 *
 * ⚠️ ขอบเขต: ไวยากรณ์เท่านั้น (parse ได้ไหม) **ไม่ได้ตรวจว่าโค้ดถูก**
 *    ชื่อที่ไม่ได้ import · ตัวแปรสะกดผิด · ตรรกะกลับด้าน ด่านนี้มองไม่เห็น
 *    ⇒ อ่านผลว่า "ไฟล์ทุกไฟล์ parse ผ่าน" ไม่ใช่ "ไฟล์ทุกไฟล์ใช้ได้"
 */
import { readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ราก = ["scripts", "netlify"];
const ข้าม = new Set(["node_modules", "out", ".next", ".netlify"]);

function ไฟล์mjs(dir) {
  const ออก = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || ข้าม.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) ออก.push(...ไฟล์mjs(p));
    else if (e.name.endsWith(".mjs")) ออก.push(p);
  }
  return ออก;
}

const ไฟล์ = ราก.filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } })
  .flatMap(ไฟล์mjs);

const พัง = [];
for (const f of ไฟล์) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    const บรรทัดแรกที่มีเหตุ = String(e.stderr ?? e.message)
      .split("\n").find((l) => /Error|error:/.test(l)) ?? "(ไม่มีข้อความ)";
    พัง.push({ f, เหตุ: บรรทัดแรกที่มีเหตุ.trim().slice(0, 200) });
  }
}

for (const p of พัง) console.log(`🔴 ${p.f} — ${p.เหตุ}`);

console.log(
  `\n📏 node --check: ตรวจ ${ไฟล์.length} ไฟล์ .mjs ใน ${ราก.join(" · ")} · พัง ${พัง.length}` +
  "\n   ⚠️ ไวยากรณ์เท่านั้น — ชื่อที่ไม่ได้ import / ตรรกะผิด ด่านนี้มองไม่เห็น"
);

if (!ไฟล์.length) {
  console.log("🔴 ไม่เจอไฟล์ .mjs เลยสักไฟล์ ⇒ ถือว่าด่านพัง ไม่ใช่ผ่าน (โครงโฟลเดอร์คงเปลี่ยน)");
  process.exit(1);
}
if (พัง.length) process.exit(1);
