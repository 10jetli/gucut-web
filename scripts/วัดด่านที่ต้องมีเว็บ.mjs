#!/usr/bin/env node
/* เปิดท่อปลอม → เล็งด่านที่ "ต้องมีเว็บจริง" มาที่มัน → ส่งต่อผลและรหัสจบของด่านตรง ๆ
 *
 * ใช้: node scripts/วัดด่านที่ต้องมีเว็บ.mjs <verify-contract-keys|probe-applied-keys|audit-core-contract>
 * 🔑 มีไว้ให้ `scripts/ด่านแยกแยะได้ไหม.mjs` เรียกเป็น `คำสั่ง` ได้ — ตัวปลูกจะปลูกที่
 *    `scripts/lib/ท่อปลอมสำหรับวัดด่าน.mjs` (ปลูกใน **คำตอบ** ไม่ใช่ในซอร์สของด่าน)
 * 🚫 รหัสจบต้องเป็นของด่าน ไม่ใช่ของไฟล์นี้ — ไม่งั้นตัวชี้ขาดจะพังไปทางเดียวกับสัญญาณเตือน
 *    (ท่อปลอมเปิดไม่ขึ้น = ด่านแดงเพราะยิงไม่ถึง ซึ่งหน้าตาเหมือน "ด่านจับได้") ⇒ จึงยืนยันก่อนว่าท่อขึ้นจริง
 */
import { spawn } from "node:child_process";
import { เปิดท่อปลอม } from "./lib/ท่อปลอมสำหรับวัดด่าน.mjs";

const ชื่อ = process.argv[2];
const ทะเบียน = {
  "verify-contract-keys": { ไฟล์: "scripts/verify-contract-keys.mjs", env: (u) => ({ SITE: u }) },
  "probe-applied-keys": { ไฟล์: "scripts/probe-applied-keys.mjs", env: (u) => ({ SITE: u }) },
  /* 🔑 ตัวนี้ตัดสินจาก **พฤติกรรมของท่อ** (ส่งค่ากรองแล้วดูว่าจำนวนแถวเปลี่ยนไหม)
     ⇒ ท่อปลอมต้องคืน **แถวจริง** ไม่ใช่ 0 แถว ไม่งั้นด่านตอบ "วัดไม่ได้" (ซื่อสัตย์ แต่ไม่แยกแยะ)
     ⇒ สภาพที่ด่านมีไว้จับคือ **ประกาศ `supportedFilters` แล้วเมินจริง** ⇒ อยู่ในโหมดของท่อปลอม */
  "probe-list-filters": { ไฟล์: "scripts/probe-list-filters.mjs", env: (u) => ({ SITE: u }) },
  "audit-core-contract": {
    ไฟล์: "scripts/audit-core-contract.mjs",
    env: (u) => ({ GUCUT_CORE_AUDIT_URL: `${u}/api/core`, GUCUT_CORE_AUDIT_KEY: "stub-local-key"   /* ⚠️ ASCII เท่านั้น — ค่านี้ไปเป็นหัว HTTP */ }),
  },
};
const t = ทะเบียน[ชื่อ];
if (!t) {
  console.error(`❌ ไม่รู้จักด่าน "${ชื่อ ?? ""}" — มี: ${Object.keys(ทะเบียน).join(" · ")}`);
  process.exit(2);
}

const ท่อ = await เปิดท่อปลอม();
/* ① ยืนยันว่าท่อปลอมขึ้นจริงก่อนตัดสินอะไร — ถ้าไม่ขึ้น ห้ามให้ผลออกมาปนกับ "ด่านจับได้" */
try {
  const r = await fetch(`${ท่อ.ที่อยู่}/api/netlify-credits`, { signal: AbortSignal.timeout(5000) });
  const d = await r.json();
  if (!r.ok || typeof d !== "object") throw new Error(`ตอบ ${r.status}`);
} catch (e) {
  console.error(`❌ ท่อปลอมไม่ขึ้น (${String(e?.message || e)}) ⇒ **ยังไม่ได้วัด ไม่ใช่ด่านจับได้**`);
  await ท่อ.ปิด();
  process.exit(2);
}

console.error(`🧪 ท่อปลอมที่ ${ท่อ.ที่อยู่} · วัดด่าน ${ชื่อ}`);
/* 🔴 **ห้ามใช้ `spawnSync` ที่นี่เด็ดขาด — พลาดมาแล้ว 20 ก.ย. 2569**
   ท่อปลอมอยู่ใน **โปรเซสเดียวกับตัวรัน** ⇒ `spawnSync` บล็อก event loop
   ⇒ ท่อปลอมไม่ตอบสักคำขอ ⇒ ด่านแดงเพราะ **ยิงไม่ถึง** ซึ่งหน้าตาเหมือน "ด่านจับได้"
   🔑 และด่านตัวที่ตกก็เขียนไว้ตรง ๆ ว่า "ยังไม่ได้ตรวจ ไม่ใช่ตก" — **ตัวมันซื่อสัตย์ คนอ่านต้องอ่าน**
   🔑 ด่านตรวจก่อนยิง (ยืนยันท่อขึ้น) **ผ่านฉลุย** เพราะตอนนั้นยังไม่บล็อก
      ⇒ "ตรวจก่อนเริ่ม" ไม่ครอบสภาพที่เกิดขึ้น **ระหว่าง** ทำงาน */
const เด็ก = spawn("node", [t.ไฟล์], {
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env, ...t.env(ท่อ.ที่อยู่) },
});
const รหัสจบ = await new Promise((resolve) => {
  เด็ก.on("error", () => resolve(2));
  เด็ก.on("close", (code, signal) => resolve(signal ? 2 : (code ?? 2)));
});
await ท่อ.ปิด();
process.exit(รหัสจบ);
