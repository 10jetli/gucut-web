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
import { pathToFileURL } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "audit-"));
const out = join(tmp, "audit.mjs");
await build({
  entryPoints: ["src/lib/audit.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  alias: { "@": new URL("../src", import.meta.url).pathname },
  loader: { ".json": "json" },
  logLevel: "silent",
});
const { audit } = await import(pathToFileURL(out).href);
const data = audit();
writeFileSync("netlify/lib/audit-data.json", JSON.stringify({ at: Date.now(), ...data }));
console.log(`gen-audit-json: ${data.findings.length} ประเด็น · คะแนนรวม ${data.score}`);
