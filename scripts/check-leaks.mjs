#!/usr/bin/env node
// ตรวจว่า **ของที่ห้ามขึ้นเว็บ** หลุดเข้าไฟล์ที่ส่งให้เบราว์เซอร์หรือเปล่า — รันหลัง build
//
// ⚠️ **ทำไมต้องอัตโนมัติ** (6 ก.ย. 2569)
//    ข้อห้ามพวกนี้อยู่ในคู่มือมานานแล้ว และวิธีตรวจก็เขียนไว้ครบ
//    **แต่มันพึ่ง "คนจำได้ว่าต้องตรวจ"** ⇒ วันที่คนเหนื่อยหรือรีบ deploy คือวันที่ไม่มีใครตรวจ
//    และของที่หลุดขึ้นเว็บแล้ว **เอากลับไม่ได้** (Google เก็บไปแล้ว · คนโหลดไฟล์ไปแล้ว)
//
// ⚠️ **ห้ามค้นด้วยชื่อตำบล** — ให้ผลบวกลวงทุกครั้ง เพราะตาราง 7,436 ตำบลของหน้า /permit/
//    มีชื่อตำบลทุกชื่ออยู่แล้ว (เจอของจริง 6 ก.ย. 2569: ฝั่งจอทักว่าที่อยู่หลุด — ตรวจแล้วไม่หลุด)
//    ⇒ ค้นด้วย **บ้านเลขที่ + หมู่** ซึ่งเจาะจงพอ
//
// ⚠️ **รายการยกเว้นต้องเขียนเหตุผลกำกับทุกบรรทัด**
//    ยกเว้นโดยไม่มีเหตุผล = วันหนึ่งของจริงหลุดผ่านช่องนั้นแล้วไม่มีใครรู้ว่าทำไมถึงยกเว้นไว้
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = "out";
if (!existsSync(OUT)) {
  console.log("check-leaks: ยังไม่มีโฟลเดอร์ out/ — ข้าม (ยังไม่ได้ build)");
  process.exit(0);
}

/* สิ่งที่ห้ามหลุด · แต่ละข้อบอกด้วยว่า "ถ้าเจอแล้วต้องดูยังไง"
   ⚠️ `allow` = ข้อความที่ถ้าอยู่ใกล้ ๆ กัน ถือว่าเป็นเคสที่ตั้งใจ **ต้องมีเหตุผลกำกับ** */
const RULES = [
  {
    id: "ที่อยู่ร้าน",
    needle: "81 หมู่ 11",
    why: "เจ้าของร้านสั่งห้ามเอาที่อยู่ขึ้นเว็บ (Shopee/Lazada ก็ไม่โชว์)",
    /* ✅ ยกเว้นเดียวที่ตั้งใจ: ที่อยู่ส่งเอกสาร ลซ.๒ ในหน้า /permit/
       ลูกค้าต้องส่งเอกสารตัวจริงมาที่ร้าน ⇒ ไม่มีที่อยู่ = ทำเรื่องต่อไม่ได้
       ที่มาอยู่ที่ `DOC_MAILING` ใน src/lib/permit.ts (ไม่ใช่ `SHOP` ใน shop.ts) */
    allowNear: ["ลซ", "DOC_MAILING", "ส่งเอกสาร", "0435565000668"],
    allowWhy: "ที่อยู่ส่งเอกสาร ลซ.๒ — ตั้งใจให้มี",
  },
  {
    id: "ค่าคีย์ลับ",
    /* ⚠️ จับ **ค่า** ไม่ใช่ **ชื่อ** — ชื่อคีย์โผล่ได้ในข้อความบอกวิธี
        ("ลืมรหัส? ดูที่ Netlify → Environment variables → CHAT_ADMIN_KEY")
        ซึ่งไม่ใช่การหลุด ⇒ มองหารูปของค่าจริงแทน: ชื่อคีย์ตามด้วยเครื่องหมายเท่ากับ/โคลอน แล้วมีค่ายาว ๆ */
    regex: /(ZORT_APIKEY|ZORT_APISECRET|CHAT_ADMIN_KEY|TIKTOK_APP_SECRET|BEAM_[A-Z_]*KEY)["'\s]*[:=]["'\s]*[A-Za-z0-9_\-]{16,}/,
    why: "คีย์ที่หลุดเข้าไฟล์ .js = ใครเปิดดูซอร์สก็เห็น",
  },
  {
    id: "ชื่อร้านที่ไม่ได้แทนค่า",
    /* กติการ้านต้นแบบ: ทุกที่ต้อง import BRAND — เขียน "${BRAND.name}" ในเครื่องหมายคำพูดธรรมดา
       จะกลายเป็นตัวหนังสือดิบบนหน้าเว็บ และ **tsc ผ่านฉลุยเพราะมันเป็นข้อความที่ถูกต้อง** */
    needle: "BRAND.name",
    why: "ตัวแปรไม่ถูกแทนค่า ⇒ ลูกค้าเห็น ${BRAND.name} บนหน้าเว็บ",
  },
];

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    /* ตรวจเฉพาะไฟล์ที่ **ส่งให้เบราว์เซอร์จริง** — .js .html .txt .json .md
       ⚠️ ไฟล์ source map (.map) ไม่นับ เพราะ Netlify ไม่ได้เสิร์ฟ และมันจะให้ผลบวกลวงเยอะ */
    else if (/\.(js|html|txt|json|md|xml)$/.test(e) && !e.endsWith(".map")) files.push(p);
  }
})(OUT);

const hits = [];
for (const f of files) {
  let s;
  try { s = readFileSync(f, "utf8"); } catch { continue; }
  for (const r of RULES) {
    let idx = -1;
    if (r.needle) idx = s.indexOf(r.needle);
    else if (r.regex) { const m = r.regex.exec(s); idx = m ? m.index : -1; }
    if (idx < 0) continue;
    /* ⚠️ ดูบริบทรอบ ๆ ก่อนตัดสิน — ข้อความเดียวกันอยู่คนละที่มีความหมายคนละอย่าง
        (บทเรียนของวันนี้: ตรวจของทีละชิ้นแล้วถูกหมด ไม่ได้แปลว่าของทั้งก้อนพูดความจริง) */
    const ctx = s.slice(Math.max(0, idx - 200), idx + 200);
    if (r.allowNear && r.allowNear.some((a) => ctx.includes(a))) continue;
    hits.push({ rule: r, file: f, ctx: ctx.replace(/\s+/g, " ").slice(0, 160) });
  }
}

if (!hits.length) {
  console.log(`check-leaks: ตรวจ ${files.length} ไฟล์ใน out/ — ไม่มีของต้องห้ามหลุด ✅`);
  process.exit(0);
}
console.error(`\n🔴 check-leaks: เจอของต้องห้ามใน out/ ${hits.length} จุด — **หยุด deploy**\n`);
for (const h of hits) {
  console.error(`  [${h.rule.id}] ${h.file}`);
  console.error(`     เหตุผลที่ห้าม: ${h.rule.why}`);
  console.error(`     บริบท: …${h.ctx}…\n`);
}
console.error("ถ้าเป็นเคสที่ตั้งใจให้มี ให้เพิ่มใน allowNear ของกฎนั้น **พร้อมเหตุผลกำกับ**");
console.error("⚠️ ห้ามยกเว้นโดยไม่เขียนเหตุผล — วันหนึ่งของจริงจะหลุดผ่านช่องนั้นโดยไม่มีใครรู้ว่าทำไม\n");
process.exit(1);
