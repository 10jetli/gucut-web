#!/usr/bin/env node
/* 🕳️ เส้น API ที่ **ไม่มีใครเรียก** — เส้นตายไม่ใช่แค่ขยะ มันคือที่ที่บั๊กอยู่ได้ตลอดกาล
 *
 * 🔴 ที่มา 19 ก.ย. 2569 — ฝั่งจอกวาดฝั่งเขาเจอ 16 เส้นไม่มีใครเรียก และตัวที่ยืนยันว่าตายจริง
 *    (`/api/sales-report` ไม่มีใครเรียก 17 วัน) มี **เพดานเงียบ 1,200 ใบ** ซุกอยู่ข้างใน
 *    🔑 **โค้ดที่ไม่มีใครเรียก ไม่มีใครเจอบั๊กของมัน** ⇒ บั๊กอยู่ได้ตลอดกาล และยังกินโควตาได้ถ้ามีคนเรียก
 *
 * 🔴 และกับดักของตัวกวาดเอง (ฝั่งจอเจอกับตัวเอง): รอบแรกได้ 10 · **ตัดคอมเมนต์แล้วได้ 16**
 *    ⇒ หกตัวถูก "ค้ำ" ด้วยการ **เอ่ยชื่อเส้นในคอมเมนต์** ("เดิมยิง /api/sales-report")
 *    🔑 **การเอ่ยถึง ≠ การเรียก** ⇒ ไฟล์นี้ตัดคอมเมนต์ก่อนกวาดทุกไฟล์
 *
 * 🚫 **รายการให้ไล่ดู ไม่ใช่รายการให้ลบ · ไม่ทำให้ build ตก** เพราะฝั่งท่อมีเส้นที่
 *    *ต้อง* ไม่มีใครในรีโปเรียก โดยถูกต้อง:
 *    · งานตามเวลา (`export const config = { schedule }`) — Netlify เรียกเอง
 *    · webhook/callback ของข้างนอก (Beam · LINE · OAuth · Google Ads script)
 *    · เส้นที่ **จอในรีโปอีกตัว** (`gucut-next`) เรียกผ่านท่อกลาง `/api/web/core`
 *      ⇒ ไฟล์นี้จึงกวาด `~/gucut-next` ด้วยถ้ามีอยู่ **ไม่งั้นจะฟ้องเส้นที่มีคนใช้ทุกวัน**
 *      ⚠️ ไม่มีโฟลเดอร์นั้น ⇒ บอกออกมาว่า **"กวาดไม่ครบ"** ห้ามนิ่งแล้วรายงานเลขเต็ม
 *
 * ใช้: node scripts/check-unreferenced-endpoints.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** ตัดคอมเมนต์หยาบ ๆ — ไม่ใช่ parser · ลบคอมเมนต์บรรทัดก่อนบล็อก (ลำดับนี้สำคัญ:
 *  กลับลำดับแล้ว `/api/x/*` ในคอมเมนต์บรรทัดจะเปิดบล็อกปลอมแล้วกินโค้ดทั้งไฟล์ — พลาดมาแล้ว) */
const ไม่เอาคอมเมนต์ = (s) =>
  s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\/[^\n]*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const ไฟล์ในโฟลเดอร์ = (d, นามสกุล = /\.(mjs|ts|tsx|js|json|html)$/) => {
  const out = [];
  const เดิน = (p) => {
    for (const ชื่อ of readdirSync(p)) {
      if (ชื่อ === "node_modules" || ชื่อ === ".next" || ชื่อ === "out") continue;
      const full = join(p, ชื่อ);
      if (statSync(full).isDirectory()) เดิน(full);
      else if (นามสกุล.test(ชื่อ)) out.push(full);
    }
  };
  เดิน(d);
  return out;
};

const ฟังก์ชัน = readdirSync("netlify/functions").filter((f) => f.endsWith(".mjs"));
if (ฟังก์ชัน.length === 0) {
  console.error("✗ check-unreferenced-endpoints: เจอ 0 ฟังก์ชัน ⇒ **ตะแกรงพัง ไม่ใช่ไม่มีปัญหา**");
  process.exit(2);
}

/* ── รวมข้อความของทุกที่ที่ "เรียก" ได้ (ตัดคอมเมนต์แล้ว) ── */
const แหล่ง = [];
for (const d of ["src", "scripts", "netlify", "public"]) {
  if (existsSync(d)) แหล่ง.push(...ไฟล์ในโฟลเดอร์(d));
}
/* 🔴 **`netlify.toml` นับเป็น "คนเรียก" ด้วย** (แก้ทันทีรอบแรก 19 ก.ย. 2569)
   รอบแรกฟ้อง 6 เส้น: beam-webhook · oauth-{line,facebook,google} · products-feed · catalog-feed
   ⇒ ทั้งหกถูกต่อสายไว้ใน `netlify.toml` ด้วยพาธสาธารณะที่ **ชื่อไม่ตรงกับชื่อไฟล์**
     (`/api/beam/webhook` · `/api/oauth/line/callback` · `/products.json` · `/catalog.xml`)
   ⇒ ลบตามรายการนั้นคือ **ลบเส้นที่ลูกค้าและ Google ใช้อยู่ทุกวัน**
   🔑 ตะแกรงที่ไม่รู้จัก **ชั้นที่ต่อสาย** จะฟ้องของที่มีคนใช้ที่สุด เพราะของพวกนั้น
      "ไม่มีใครในโค้ดเรียก" โดยถูกต้อง ⇒ นี่คือแดงลวงที่พาไปลบของจริง */
for (const f of ["netlify.toml", "public/_redirects"]) {
  if (existsSync(f)) แหล่ง.push(f);
}
const จอ = join(homedir(), "gucut-next");
const มีจอ = existsSync(จอ);
if (มีจอ) for (const sub of ["app", "lib", "components", "middleware.ts"]) {
  const p = join(จอ, sub);
  if (existsSync(p)) แหล่ง.push(...(statSync(p).isDirectory() ? ไฟล์ในโฟลเดอร์(p) : [p]));
}
const เนื้อรวม = แหล่ง.map((f) => ไม่เอาคอมเมนต์(readFileSync(f, "utf8"))).join("\n");

const ตารางเวลา = /export\s+const\s+config\s*=\s*\{[^}]*schedule/;
const ไม่มีใครเรียก = [];
const งานตามเวลา = [];

for (const f of ฟังก์ชัน) {
  const ชื่อเส้น = f.replace(/\.mjs$/, "");
  const เนื้อ = readFileSync(join("netlify/functions", f), "utf8");
  if (ตารางเวลา.test(เนื้อ)) { งานตามเวลา.push(ชื่อเส้น); continue; }
  /* 🔑 **พาธสาธารณะของฟังก์ชัน อาจไม่ใช่ชื่อไฟล์** — Netlify ให้ประกาศเองในไฟล์ฟังก์ชัน
     `export const config = { path: "/api/beam/webhook" }` (เดี่ยวหรืออาร์เรย์)
     🔴 รอบแรกผมค้นด้วยชื่อไฟล์เท่านั้น ⇒ ฟ้อง 6 เส้นที่ลูกค้าและ Google ใช้อยู่ทุกวัน:
        `/api/beam/webhook` (เงินเข้า) · `/api/oauth/{line,facebook,google}/callback` (ปุ่มเข้าสู่ระบบ) ·
        `/products.json` (ฟีดให้ผู้ช่วย AI) · `/catalog.xml` (ฟีดโฆษณา Google Merchant)
        ⇒ ถ้าใครเชื่อรายการนั้นแล้วลบ = **เงินเข้าไม่รู้ · ล็อกอินพัง · ฟีดหาย**
     🔑 ตะแกรงที่ไม่รู้จัก **ชั้นที่ประกาศพาธ** จะฟ้องของที่มีคนใช้ที่สุด เพราะของพวกนั้น
        "ไม่มีใครในโค้ดเรียกด้วยชื่อไฟล์" โดยถูกต้อง ⇒ แดงลวงที่พาไปลบของจริง */
  const พาธประกาศ = [...เนื้อ.matchAll(/path:\s*(\[[^\]]*\]|"[^"]+"|'[^']+')/g)]
    .flatMap((m) => [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]));
  const หนี = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const พบ = [ชื่อเส้น, ...พาธประกาศ].some((n) =>
    (n.startsWith("/")
      ? new RegExp(หนี(n))
      : new RegExp(`/api/${หนี(n)}\\b|["'\`/]${หนี(n)}["'\`?&]`)
    ).test(เนื้อรวม));
  if (!พบ) {
    ไม่มีใครเรียก.push(พาธประกาศ.length ? `${ชื่อเส้น} (ประกาศพาธเอง: ${พาธประกาศ.join(" · ")})` : ชื่อเส้น);
  }
}

console.log("🕳️  เส้น API ที่ไม่มีใครในรีโปเรียก — **รายการให้ไล่ดู ไม่ใช่รายการให้ลบ**\n");
for (const n of ไม่มีใครเรียก) console.log(`   · /api/${n}`);
console.log(
  `\n📏 ตะแกรง: ฟังก์ชัน ${ฟังก์ชัน.length} ตัว · งานตามเวลา ${งานตามเวลา.length} ตัว (Netlify เรียกเอง ⇒ ยกเว้น)` +
  `\n   ⇒ **ไม่มีใครเรียก ${ไม่มีใครเรียก.length} เส้น** · กวาดจาก ${แหล่ง.length} ไฟล์ (ตัดคอมเมนต์ก่อนกวาด)` +
  `\n   ${มีจอ ? "✅ รวมรีโปจอ (~/gucut-next) ด้วย" : "🔴 **ไม่เจอ ~/gucut-next ⇒ กวาดไม่ครบ** เส้นที่จอเรียกจะถูกฟ้องผิด ๆ"}` +
  "\n   ⚠️ เส้นที่ข้างนอกเรียก (webhook Beam/LINE/OAuth · สคริปต์ Google Ads) **ไม่มีใครในรีโปเรียกอยู่แล้ว**" +
  "\n      ⇒ อยู่ในรายการนี้ไม่ได้แปลว่าตาย ⇒ ต้องอ่านทีละเส้น **ห้ามเหมาลบ**" +
  "\n   🔑 การเอ่ยชื่อเส้นในคอมเมนต์ **ไม่ใช่การเรียก** (ฝั่งจอเจอ: ไม่ตัดคอมเมนต์ได้ 10 · ตัดแล้วได้ 16)"
);
