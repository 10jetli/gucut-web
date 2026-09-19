// สร้างผลตรวจ SEO เป็น JSON ให้ /api/seo-audit เสิร์ฟ — รันตอน prebuild
//
// เดิมผลตรวจ (src/lib/audit.ts) ฝังอยู่ในหน้า /admin/seo ตอน build เท่านั้น
// หลังร้านหลัก (admin.gucut.com) ที่รวมร่างแล้วต้องอ่านข้ามระบบได้
// จึงคายออกมาเป็นไฟล์ให้ฟังก์ชัน (netlify/lib/audit-data.json — bundle ไปกับฟังก์ชัน)
//
// ⚠️ audit.ts เป็น TypeScript — โหลดผ่าน tsx/esbuild ไม่ได้ในสคริปต์ .mjs ธรรมดา
//    ใช้ esbuild แปลงชั่วคราวแล้ว import (มี esbuild ติดมากับ Next อยู่แล้ว)
import { build } from "esbuild";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";   /* 🔴 เดิมมีแต่ pathToFileURL ⇒ ตอนผมแก้ `.pathname` เป็น fileURLToPath ตัวเช็ค "มี node:url แล้วไหม" ของผมตอบว่ามี ⇒ **ไม่เติมชื่อที่ขาด** ⇒ build ตกเงียบ (แก้ 19 ก.ย. เย็น) */

const tmp = mkdtempSync(join(tmpdir(), "audit-"));
const out = join(tmp, "audit.mjs");
await build({
  entryPoints: ["src/lib/audit.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  // ⚠️ `.pathname` เข้ารหัส %xx ⇒ ใช้ fileURLToPath (แก้ 19 ก.ย. 2569)
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  loader: { ".json": "json" },
  logLevel: "silent",
});
const { audit } = await import(pathToFileURL(out).href);
const data = audit();
writeFileSync("netlify/lib/audit-data.json", JSON.stringify({ at: Date.now(), ...data }));
console.log(`gen-audit-json: ${data.findings.length} ประเด็น · คะแนนรวม ${data.score}`);
