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
 *    แล้วให้ไฟล์ `.ts` เป็นหน้าร้านของชนิด (ตัวอย่างจริง: `src/lib/stock-state-core.js` ↔ `src/lib/stock-state.ts`)
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
console.log(
  `🧪 ไฟล์ใต้ scripts/ **${ไฟล์.length}** · ที่ import ไฟล์ TypeScript: **${ปัญหา.length}**` +
  `\n   📏 Netlify build ด้วย Node ${nv ?? "(อ่าน netlify.toml ไม่ได้)"} · เครื่องนี้ ${process.version}` +
  (nv && !process.version.startsWith(`v${nv}.`)
    ? `\n   ⚠️ สองเวอร์ชันนี้ **ไม่ตรงกัน** ⇒ "ผ่านที่นี่" ไม่ได้แปลว่า "ผ่านที่ Netlify"`
    : "")
);
if (ปัญหา.length) {
  console.error(
    `\n🔴 import ไฟล์ TypeScript จากโค้ดที่ Node รันตรง ๆ — Node ${nv ?? "ของ Netlify"} จะโยน ERR_UNKNOWN_FILE_EXTENSION ⇒ build ตกทั้งใบ:\n` +
    ปัญหา.map((x) => `   · ${x.ไฟล์}:${x.บรรทัด} → ${x.ของ}`).join("\n") +
    `\n   ⇒ ย้ายตรรกะไปไฟล์ \`.js\` แล้วให้ \`.ts\` ส่งต่อ (ตัวอย่าง: src/lib/stock-state-core.js ↔ src/lib/stock-state.ts)`
  );
  process.exit(1);
}
