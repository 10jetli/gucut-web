#!/usr/bin/env node
/* 🧪 **โค้ดที่ Node รันตรง ๆ ห้าม import ไฟล์ TypeScript — Node ที่ build เว็บโหลดมันไม่ได้**
 *
 * 🔴 ที่มา 2 ต.ค. 2569 — deploy `main@9a22940` **Failed** หลัง push 13:47
 *    `not ok 192 - scripts/tests/สามสถานะสต็อก.test.mjs`
 *    `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for src/lib/stock-state.ts`
 *    · เครื่องเรา Node 22 → ลอกชนิดออกให้เอง ⇒ `pass 7 · fail 0`
 *    · Netlify Node 20 (`netlify.toml` → NODE_VERSION) → โหลด `.ts` ไม่ได้ ⇒ **build ตกทั้งใบ**
 *    ⇒ ⇒ คลาส "ผ่านบนเครื่องเราไม่ใช่ผ่าน" · อาการที่เห็นคือ **เว็บไม่อัปเดต** ไม่ใช่เทสแดงตรงหน้า
 *       รอบนั้นเสียเวลา ~1 ชม. ไปตามหาว่า "build hook ไม่ยิง" ทั้งที่มันยิงแล้วและตก
 *
 * 🔑 ทางแก้ที่ด่านนี้บังคับ: ตรรกะที่ทั้งแอปและเทสต้องใช้ ให้อยู่ไฟล์ `.js`
 *    แล้วให้ไฟล์ `.ts` เป็นหน้าร้านของชนิด (ตัวอย่างจริง: `src/lib/stock-state-core.mjs` ↔ `src/lib/stock-state.ts`)
 *
 * 🚫 ขอบเขต: ตรวจ **ข้อความของคำสั่งนำเข้า** ไม่ได้ลองโหลดจริง
 *    ⇒ เขียวที่นี่ = "ไม่มีรูปที่เรารู้จัก" ไม่ใช่ "ทุกไฟล์โหลดได้บน Node 20"
 *    อาการจริงยังต้องดูจาก `npm test` ที่รันด้วย Node เวอร์ชันเดียวกับ Netlify
 *
 * ใช้: node scripts/check-test-ts-imports.mjs [--self-test]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* 🔑 เกณฑ์: ต้องเป็น **คำสั่งนำเข้าที่ขึ้นต้นบรรทัด** ไม่ใช่เจอ ".ts" ที่ไหนก็ได้
 *    เพราะไฟล์ใต้ scripts/ เต็มไปด้วย **ข้อความตัวอย่าง** ของ self-test ด่านอื่น
 *    (วัดแล้ว 2 ต.ค.: ตะแกรงรุ่นแรกจับ `check-layer-direction.mjs:77` ซึ่งเป็นสตริง
 *     ตัวอย่างในเทส ไม่ใช่ import จริง ⇒ **บวกลวง** ⇒ ด่านที่ร้องใส่ของปกติจะถูกปิดใน 1 วัน)
 * 🔑 และต้องจับ **รูปที่ทำ build ตกจริง**: import หลายบรรทัดที่ `} from "...ts"` อยู่บรรทัดของมันเอง
 *    ⇒ ตะแกรงที่ยึดคำว่า `import` ต้นบรรทัดเพียงอย่างเดียว **พลาดรูปนี้ทั้งรูป** */
const รูปของTS = String.raw`[^"']+\.(?:m|c)?tsx?`;
const รูปนำเข้า = [
  new RegExp(String.raw`^\s*import\b[^"']*["'](${รูปของTS})["']`),                 /* ① import ... "x.ts" */
  new RegExp(String.raw`^\s*\}?\s*from\s*["'](${รูปของTS})["']`),                  /* ② `} from "x.ts"` — รูปที่ตกจริง */
  new RegExp(String.raw`^\s*export\b[^"']*from\s*["'](${รูปของTS})["']`),          /* ③ export ... from "x.ts" */
  new RegExp(String.raw`^\s*(?:const|let|var)\b[^=]*=\s*(?:await\s+)?(?:import|require)\s*\(\s*["'](${รูปของTS})["']`), /* ④ dynamic/require */
];

export const หาการนำเข้าTS = (ข้อความ) => {
  const ผล = [];
  ข้อความ.split("\n").forEach((บรรทัด, i) => {
    for (const ร of รูปนำเข้า) {
      const m = บรรทัด.match(ร);
      if (m) { ผล.push({ บรรทัด: i + 1, ของ: m[1] }); break; }
    }
  });
  return ผล;
};

const nodeของNetlify = () => {
  try {
    const m = readFileSync("netlify.toml", "utf8").match(/NODE_VERSION\s*=\s*"([^"]+)"/);
    return m ? m[1] : null;
  } catch { return null; }
};

/** รุ่นที่ build เว็บ **โหลด `.ts` ได้เองไหม** — คืน true / false / null (อ่านไม่ได้)
 *  🔴 รุ่นแรกของด่านนี้พิมพ์ว่า "Node <รุ่น> จะโยน ERR_UNKNOWN_FILE_EXTENSION" **ทุกรุ่น**
 *     ⇒ เอาไปรันที่รีโปที่ตรึง Node 22 แล้วมันพูดประโยคที่ **เท็จ** (22 ลอกชนิดออกให้เอง)
 *     ⇒ ⇒ คลาส "ข้อความกับตรรกะต้องมาจากที่เดียวกัน" — ข้อความต้องสร้างจากรุ่นที่วัดได้
 *  📏 ข้อเท็จจริงของ runtime: ≤ 21 โหลดไม่ได้เลย · 22.6–22.17 ต้องใส่ธง
 *     `--experimental-strip-types` · ≥ 22.18 ลอกให้เองโดยไม่ต้องใส่ธง */
const โหลดTSได้ = (รุ่น) => {
  const major = Number.parseInt(String(รุ่น ?? ""), 10);
  if (!Number.isFinite(major)) return null;
  return major >= 22;
};

/* หนี้ที่ยอมให้ค้างได้ — **ลดได้ ห้ามขึ้น** (ใช้เฉพาะรีโปที่รุ่น build ลอกชนิดได้เอง)
   ที่นี่ตรึง Node 20 ⇒ ทุกตัวคือบั๊กทันที ⇒ เพดานต้องเป็น 0 */
const เพดานหนี้ = 0;

const ไล่ไฟล์ = (ราก) => {
  const ออก = [];
  for (const ชื่อ of readdirSync(ราก)) {
    const พาธ = join(ราก, ชื่อ);
    if (statSync(พาธ).isDirectory()) { ออก.push(...ไล่ไฟล์(พาธ)); continue; }
    if (/\.(mjs|cjs|js)$/.test(ชื่อ)) ออก.push(พาธ);
  }
  return ออก;
};

/* 🧪 **ตัวควบคุมสองทางของด่านนี้ — รันทุกรอบ ไม่ได้ซ่อนหลังธง**
   🔑 เหตุที่ต้องฝังใน ไม่ใช่ทำเป็น `--self-test`: ธงที่ต้องมีคนพิมพ์ = ลืมเรียกได้ และถอดออกเงียบได้
      (ด่าน `check-gate-selfcontrol.mjs` ของรีโปนี้จับผมได้ตอน 15:41 น. 2 ต.ค. — รอบแรกผมซ่อนไว้หลังธงจริง ๆ)
   ⚠️ ตะแกรงนี้เป็น regex ⇒ เป็นกองที่ "พังเงียบง่ายที่สุด" ตามที่ตัวนับหนี้เตือนไว้
      ⇒ ควบคุมไม่ผ่าน ⇒ ต้องพูดว่า **ผลของด่านนี้อ่านไม่ได้** ไม่ใช่ "ไม่มีของ" */
{
  const ต้องจับ = [
    'import { a } from ' + JSON.stringify("../../src/lib/x.ts"),
    '} from ' + JSON.stringify("../../src/lib/stock-state.ts") + ';',   /* 🔑 รูปที่ทำ deploy 9a22940 ตกจริง */
    'export { a } from ' + JSON.stringify("./y.ts") + ';',
    "const b = await import(" + JSON.stringify("./y.mts") + ")",
    "const c = require(" + JSON.stringify("./z.tsx") + ")",
    'import ' + JSON.stringify("./ผลข้างเคียง.ts") + ';',
  ];
  const ต้องไม่จับ = [
    "/* เทสที่ import `.ts` จะพังบน Node 20 */",                          /* พูดถึงเฉย ๆ */
    'import { a } from ' + JSON.stringify("../../src/lib/x.js"),        /* .js ปกติ */
    'const u = new URL(' + JSON.stringify("../../src/data/x.json") + ')', /* ไม่ใช่ import */
    "// ชื่อไฟล์ลงท้าย .ts ห้ามถูก import",                                /* ไม่มีเครื่องหมายคำพูด */
    /* 🔴 บวกลวงของจริงที่เจอ 2 ต.ค. — สตริงตัวอย่างใน self-test ของด่านอื่น
       (`scripts/check-layer-direction.mjs:77`) ⇒ ตะแกรงรุ่นแรกของผมจับมันทั้งที่ไม่ใช่ import */
    "    " + JSON.stringify('const m = require("../../app/api/x/route.ts");') + ",",
    "    " + JSON.stringify('import X from "@/components/zort.ts";') + ",",
  ];
  const พลาด = [
    ...ต้องจับ.filter((x) => !หาการนำเข้าTS(x).length).map((x) => `ต้องจับแต่ไม่จับ: ${x.slice(0, 70)}`),
    ...ต้องไม่จับ.filter((x) => หาการนำเข้าTS(x).length).map((x) => `ต้องไม่จับแต่จับ: ${x.slice(0, 70)}`),
  ];
  if (พลาด.length) {
    console.error(
      "🔴 **ตัวควบคุมของด่านนี้ไม่ผ่าน ⇒ ผลของด่านนี้อ่านไม่ได้** (ไม่ใช่ 'ไม่มี import ที่ผิด')\n" +
      พลาด.map((x) => `   · ${x}`).join("\n") +
      "\n   ⇒ รูปที่ใช้จับเปลี่ยนไป ⇒ แก้ตะแกรงก่อน แล้วรันซ้ำ"
    );
    process.exit(1);
  }
  if (process.argv.includes("--self-test")) {
    console.log(`🧪 ตัวควบคุมผ่าน: บวก ${ต้องจับ.length} · ลบ ${ต้องไม่จับ.length} (ปกติรันทุกรอบอยู่แล้ว ธงนี้แค่หยุดตรงนี้)`);
    process.exit(0);
  }
}

const ไฟล์ = ไล่ไฟล์("scripts");
const ปัญหา = [];
for (const f of ไฟล์) for (const x of หาการนำเข้าTS(readFileSync(f, "utf8"))) ปัญหา.push({ ไฟล์: f, ...x });

const nv = nodeของNetlify();
const ลอกชนิดได้ = โหลดTSได้(nv);
const เหตุของรุ่น =
  ลอกชนิดได้ === null ? `🔴 อ่าน NODE_VERSION จาก netlify.toml **ไม่ได้** ⇒ ยังไม่รู้ว่ารุ่นที่ build โหลด .ts ได้ไหม (ไม่รู้ ห้ามอ่านว่าปกติ)`
    : ลอกชนิดได้ ? `Node ${nv} ลอกชนิดออกให้เอง (≥ 22.18 ไม่ต้องใส่ธง) ⇒ **วันนี้ยังโหลดได้** แต่รอดเพราะรุ่นที่ตรึงไว้ ไม่ใช่เพราะโค้ดไม่พึ่ง`
      : `Node ${nv} โหลด .ts **ไม่ได้เลย** ⇒ ERR_UNKNOWN_FILE_EXTENSION ⇒ build ตกทั้งใบ`;

console.log(
  `🧪 ไฟล์ใต้ scripts/ **${ไฟล์.length}** · ที่ import ไฟล์ TypeScript: **${ปัญหา.length}**` +
  `\n   📏 Netlify build ด้วย Node ${nv ?? "(ไม่รู้)"} · เครื่องที่รันด่านนี้ ${process.version}` +
  `\n   📏 ${เหตุของรุ่น}` +
  (nv && !process.version.startsWith(`v${nv}.`)
    ? `\n   ⚠️ สองรุ่นนี้ **ไม่ตรงกัน** ⇒ "ผ่านที่นี่" ไม่ได้แปลว่า "ผ่านที่ Netlify"`
    : "")
);

/* 🔑 ผิดได้สองทิศ จึงต้องแยกคำตัดสินตามรุ่นที่วัดได้
   · รุ่นโหลดไม่ได้  ⇒ ทุกตัวคือ **บั๊กที่จะทำ build ตก** ⇒ ตกทันที
   · รุ่นโหลดได้     ⇒ เป็น **หนี้** (ระเบิดเวลา: วันที่ใครตรึงรุ่นลงเป็น 20 มันจะล้มพร้อมกันทั้งกอง)
     ⇒ อ่านเป็นเพดานที่ลดได้ ห้ามขึ้น — ห้ามเงียบ เพราะ "ไม่พังวันนี้" ไม่ใช่ "ปลอดภัย"
   · อ่านรุ่นไม่ได้  ⇒ **ไม่รู้** ⇒ ตก (ไม่รู้ห้ามกลายเป็นปกติ) */
const รายการ = ปัญหา.map((x) => `   · ${x.ไฟล์}:${x.บรรทัด} → ${x.ของ}`).join("\n");
const ทางแก้ = `   ⇒ ย้ายตรรกะไปไฟล์ \`.js\` แล้วให้ \`.ts\` ส่งต่อ (ตัวอย่างที่ทำแล้ว: src/lib/stock-state-core.mjs ↔ src/lib/stock-state.ts)`;

if (ลอกชนิดได้ === null) {
  console.error(`\n🔴 ไม่รู้รุ่น Node ที่ build เว็บ ⇒ ตัดสินไม่ได้ว่า ${ปัญหา.length} รายการนี้เป็นบั๊กหรือหนี้` + (ปัญหา.length ? `\n${รายการ}` : ""));
  process.exit(1);
}
if (!ลอกชนิดได้ && ปัญหา.length) {
  console.error(`\n🔴 import ไฟล์ TypeScript จากโค้ดที่ Node รันตรง ๆ — ${เหตุของรุ่น}\n${รายการ}\n${ทางแก้}`);
  process.exit(1);
}
if (ลอกชนิดได้ && ปัญหา.length > เพดานหนี้) {
  console.error(
    `\n🔴 หนี้โตขึ้น (${ปัญหา.length} > ${เพดานหนี้}) — ยังไม่พังวันนี้เพราะ Node ${nv} ลอกชนิดได้\n${รายการ}\n` +
    `   🔑 นี่คือ **ระเบิดเวลา**: วันที่ใครตรึง NODE_VERSION ลงเป็น 20 (เคยเกิดจริง 26 ก.ย. 2569) มันล้มพร้อมกันทั้งกอง\n${ทางแก้}`
  );
  process.exit(1);
}
if (ลอกชนิดได้ && ปัญหา.length) {
  console.log(`   📉 อ่านเป็น **หนี้ ${ปัญหา.length}/${เพดานหนี้}** — ยังไม่พังเพราะรุ่นที่ตรึงไว้ ไม่ใช่เพราะโค้ดเลิกพึ่ง\n${รายการ}`);
}
