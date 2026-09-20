#!/usr/bin/env node
/* 🏷️ **เส้นไหนของ `/api/core` ตอบ `skip` ได้จริง** — จากคำตอบจริง ไม่ใช่จากการอ่านซอร์ส
 *
 * 🔴 ที่มา 20 ก.ย. 2569 — ฝั่งจอขอรายชื่อนี้เพื่อทำด่าน "จอที่ยิงเส้นที่ตอบ skip ได้ ต้องอ่าน skip"
 *    ผมตอบด้วยตะแกรงอ่านซอร์สก่อน (จับคู่ไฟล์ `lib/` ที่มี `skip:` กับพารามิเตอร์ด้วยหน้าต่างบรรทัด)
 *    ⇒ ได้ **58 ตัว** แล้วสุ่มยิงตรวจ 6 ตัว ⇒ **บวกลวงทันที 2 ตัว** (`deploys` · `zortfiles`)
 *    🔑 เหตุ: ไฟล์หนึ่งมีหลายฟังก์ชัน — `skip` อยู่ใน**ฟังก์ชันอื่น**ที่พารามิเตอร์นั้นไม่ได้เรียก
 *       ⇒ **ผมจับคู่ที่ระดับไฟล์ ทั้งที่ของจริงอยู่ที่ระดับฟังก์ชัน**
 *    ⚠️ และบวกลวงในงานนี้แพงเป็นพิเศษ เพราะด่านฝั่งจอจะ **สั่งให้คนเติมโค้ด**
 *       ⇒ เติมทางอ่าน `skip` ในจอที่ไม่มีวันได้รับ `skip` = **กิ่งที่เดินไม่ถึง** = ที่ให้คำกล่าวอ้างเน่า
 *
 * 🚫 **ยิงได้เฉพาะเส้นอ่านล้วน — GET ไม่ได้แปลว่าไม่เปลี่ยนข้อมูล**
 *    `?sync=1` ดึง ZORT จริง · `?backup=1` เขียนจริง · `?stockpush…` ดันสต็อกไปมาร์เก็ตเพลส
 *    ⇒ เส้นที่ยิงไม่ได้ต้องรายงานเป็น **"ยังไม่รู้"** ห้ามยุบไปรวมกับ "ไม่มี skip"
 *    🔑 สามสถานะ ไม่ใช่สอง — ฝั่งจอรับกติกานี้แล้ว
 *
 * ใช้: node scripts/probe-skip-endpoints.mjs          (ต้องมี ~/.gucut-admin-key)
 *      node scripts/probe-skip-endpoints.mjs --json   (ส่งต่อให้ฝั่งจอ)
 */
import { readFileSync } from "node:fs";
import { จดว่ารันแล้ว } from "./lib/จดว่ารันแล้ว.mjs";
import { homedir } from "node:os";

const ฐาน = process.env.PROBE_BASE || "https://gucut.com";
const เป็นJSON = process.argv.includes("--json");

/* 📋 รายชื่อมาจากตะแกรงอ่านซอร์ส (58 ตัว) — ตัวนี้ใช้เป็น **รายชื่อผู้ต้องสงสัย** เท่านั้น
   คำตัดสินมาจากการยิง ⇒ ตะแกรงผิดได้ แต่คำตอบจริงผิดไม่ได้ */
const ผู้ต้องสงสัย = [
  "blankwhere", "cardguess", "categoryvalues", "channelcompare", "customer", "daily",
  "deploys", "dupsku", "mkpfees", "mkpfinance", "mkpfinancemirror", "mkpfinanceprobe",
  "monthly", "noitems", "ordercheck", "orderitems", "pending", "pendingsplit", "purchase",
  "pushstate", "pushstuck", "quotation", "returnorder", "returnskus", "shopeeunlisted",
  "source", "statuscross", "stock", "sweeptiming", "tiktokshape", "tiktokstock",
  "transfer", "usage", "warehousevalues", "zortarchived", "zortbundle", "zortcostfields",
  "zortdocfilter", "zortdocrows", "zortfiles", "zortlist", "zortmissing", "zortmonthly",
];
/* 🚫 คำที่บ่งว่า **เส้นนั้นลงมือทำอะไร** ⇒ ไม่ยิง ⇒ รายงานเป็น "ยังไม่รู้"
   ⚠️ นี่เป็นการคัดด้วย **ชื่อ** ซึ่งเป็นวิธีที่เราห้ามใช้ตัดสินประเภทโดยทั่วไป
      ⇒ ที่นี่ยอมรับได้เพราะความผิดพลาดตกไปทางปลอดภัย: คัดเกิน = ได้ "ยังไม่รู้" เพิ่ม
      ⇒ **ไม่ใช่** การจัดประเภทผลลัพธ์ แต่เป็นการเลือกว่าจะไม่แตะอะไร */
const คำที่ลงมือ = ["sync", "sweep", "now", "backfill", "clear", "move", "del", "backup",
  "restore", "init", "add", "update", "delete", "push", "takeover", "receive", "grade",
  "void", "edit", "resettransfers", "d1move", "archiveslips", "slipscan", "imgmirror"];
const ไม่ยิง = (ชื่อ) => คำที่ลงมือ.some((k) => ชื่อ.toLowerCase().includes(k));

let คีย์ = "";
try { คีย์ = readFileSync(`${homedir()}/.gucut-admin-key`, "utf8").trim(); } catch (e) {
  console.error(`🔴 อ่านรหัสหลังร้านไม่ได้: ${String(e?.message || e).slice(0, 120)}`);
  console.error("   ⇒ **ตัดสินไม่ได้ทั้งกอง** — ไม่มีรหัส = ทุกเส้นตอบ 401 ซึ่งไม่มีคีย์ skip");
  console.error("      ⇒ ผลจะหน้าตาเหมือน \"ไม่มีเส้นไหนตอบ skip เลย\" ซึ่งเป็นคำตอบที่ผิดและดูน่าเชื่อ");
  process.exit(1);
}

const ผล = { มีskip: [], ไม่มีskip: [], ยังไม่รู้: {} };
for (const ชื่อ of ผู้ต้องสงสัย) {
  if (ไม่ยิง(ชื่อ)) { ผล.ยังไม่รู้[ชื่อ] = "เส้นนี้อาจลงมือเขียน/ดึงของจริง ⇒ ไม่ยิงโดยตั้งใจ"; continue; }
  let r, d = null;
  try {
    r = await fetch(`${ฐาน}/api/core?${ชื่อ}=1`, {
      headers: { "x-admin-key": คีย์ }, signal: AbortSignal.timeout(25000),
    });
    d = await r.json().catch(() => null);
  } catch (e) { ผล.ยังไม่รู้[ชื่อ] = `ยิงไม่สำเร็จ: ${String(e?.message || e).slice(0, 60)}`; continue; }
  if (!d || typeof d !== "object") { ผล.ยังไม่รู้[ชื่อ] = `ตอบ ${r.status} · ไม่ใช่ JSON object`; continue; }
  if (d.fallthrough === true) { ผล.ยังไม่รู้[ชื่อ] = "ตกไปคำตอบหน้าแรก ⇒ ชื่อพารามิเตอร์นี้ไม่ใช่รูปที่ท่อรับ"; continue; }
  if ("skip" in d) ผล.มีskip.push({ ชื่อ, skipว่าง: d.skip === null || d.skip === "" });
  else ผล.ไม่มีskip.push(ชื่อ);
}

if (เป็นJSON) { console.log(JSON.stringify(ผล, null, 1)); process.exit(0); }

const ยังไม่รู้n = Object.keys(ผล.ยังไม่รู้).length;
console.log(
  `🏷️ ยิงของจริงที่ ${ฐาน} — ผู้ต้องสงสัยจากตะแกรงซอร์ส **${ผู้ต้องสงสัย.length} ตัว**\n` +
  `   ✅ มีคีย์ \`skip\` ในคำตอบ: **${ผล.มีskip.length}**  ` +
  `(ค่าว่างอยู่ ${ผล.มีskip.filter((x) => x.skipว่าง).length} ⇒ มีช่องแต่วันนี้ทำต่อได้)\n` +
  `   ⬜ ไม่มีคีย์ \`skip\`: **${ผล.ไม่มีskip.length}**\n` +
  `   ❓ **ยังไม่รู้: ${ยังไม่รู้n}** ⇒ ห้ามอ่านว่า "ไม่มี skip"`
);
console.log("\n✅ เส้นที่ตอบ skip ได้จริง (ส่งให้ฝั่งจอใช้ทำด่านได้):");
for (const x of ผล.มีskip) console.log(`   · ?${x.ชื่อ}=1${x.skipว่าง ? "   (skip เป็นค่าว่างตอนวัด)" : "   ⚠️ skip มีข้อความจริงตอนวัด"}`);
console.log("\n❓ ยังไม่รู้ (เหตุผลรายตัว):");
for (const [k, v] of Object.entries(ผล.ยังไม่รู้)) console.log(`   · ?${k}=1 — ${v}`);
console.log(
  "\n⚠️ **ขอบเขต** — วัดที่ท่อรุ่นที่ deploy อยู่ **ไม่ใช่ซอร์สในเครื่อง**\n" +
  "   · เส้นที่คีย์ `skip` โผล่เฉพาะตอน **ของจริงขาด** (คีย์ไม่ได้ตั้ง · โทเค็นหมดอายุ)\n" +
  "     จะถูกนับเป็น \"ไม่มี\" ในวันที่ทุกอย่างพร้อม ⇒ **ผลนี้หมดอายุได้** ⇒ ยิงซ้ำก่อนใช้ตัดสินใจ\n" +
  "   · ผู้ต้องสงสัยมาจากตะแกรงซอร์สที่ **มีลบลวงได้** ⇒ เส้นที่ไม่อยู่ในรายชื่อนี้ = **ยังไม่ได้ตรวจ**"
);

/* 🕰️ **จดว่ารันแล้ว** — ตัวนี้ไม่มีอะไรจุดชนวน ⇒ ถ้าไม่จด **ไม่มีใครรู้ว่ามันตายไปแล้วหรือยัง**
   🚫 จดไม่ได้ ⇒ ไม่ทำให้ตัวตรวจล้ม (เสียบันทึกดีกว่าเสียผลตรวจ) */
จดว่ารันแล้ว('probe-skip-endpoints.mjs', `แยกได้ ${แยกได้}/${เส้น.length}`);
