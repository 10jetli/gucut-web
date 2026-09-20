/* เทสด่าน "ชื่อตัวแปร shell ต้องเป็น ASCII"
 *
 * 🔴 ที่มาของด่าน 19 ก.ย. 2569: `ผลจด=$(curl … joblog …)` ใน `~/bin/รันงานบิล.sh`
 *    bash ไม่รับชื่อที่ไม่ใช่ ASCII ⇒ บรรทัดตาย · curl ยิงจริงแต่คำตอบถูกทิ้ง
 *    ⇒ ตัวเช็ค `fallthrough` ไม่เคยทำงานสักรอบ **โดยไม่มีอะไรฟ้อง**
 *
 * 🔑 เทสนี้มี **ตัวควบคุมลบ** เท่าจำนวนตัวควบคุมบวก — ด่านที่ร้องใส่ของปกติ
 *    จะถูกปิดใน 1 วัน ⇒ "ไม่ร้องใส่ของถูก" สำคัญเท่า "ร้องใส่ของผิด"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { การกำหนดค่า, ลบเนื้อในสตริง } from "../_sh-varnames.mjs";

const จับไหม = (บรรทัด) => การกำหนดค่า.test(ลบเนื้อในสตริง(บรรทัด));

test("จับการกำหนดค่าที่ชื่อไม่ใช่ ASCII", () => {
  for (const ln of [
    "ผลจด=$(curl -s https://gucut.com/api/core)",
    "  ผลที่จะจด=\"failed\"",
    "export ชื่องาน=บิล",
    "[ 1 = 1 ] && ผลลัพธ์=ok",
    "if true; then ค่า=1; fi",
  ]) assert.equal(จับไหม(ln), true, `ควรจับ: ${ln}`);
});

test("ไม่ร้องใส่ของถูก — ตัวควบคุมลบ", () => {
  for (const ln of [
    'JOB_RESULT="failed"',                       // ASCII ปกติ
    'LOG_REPLY=$(curl -s https://gucut.com/)',
    'echo "สถานะ (ก่อนหน้า=$PREV)"',              // ⬅️ เคสที่ด่านให้แดงลวงในรันแรก
    "echo 'ผลลัพธ์=ok'",
    'MSG="🔑 ชื่องาน=บิล"',
    "curl --data \"ผล=$JOB_RESULT\" https://gucut.com/",
    "grep 'ค่า=' file.txt",
  ]) assert.equal(จับไหม(ln), false, `ไม่ควรจับ: ${ln}`);
});

test("ลบเนื้อในสตริงแล้วต้องเหลือโครงคำสั่งไว้", () => {
  assert.equal(ลบเนื้อในสตริง('A="x" && B=1'), 'A="" && B=1');
  assert.equal(ลบเนื้อในสตริง("echo 'ก=1' ; C=2"), "echo '' ; C=2");
  // escape ใน "..." ต้องไม่ทำให้เข้าใจว่าสตริงปิด
  assert.equal(ลบเนื้อในสตริง('A="a\\"b" ; ข=1').includes("ข="), true);
});

test("ตัวด่านจริง: ไฟล์นอกรีโป = ดังแต่ไม่ทำ build ตก", () => {
  const dir = mkdtempSync(join(tmpdir(), "shvar-"));
  try {
    writeFileSync(join(dir, "ปลูก.sh"), "#!/bin/bash\nผลลัพธ์=1\necho ok\n");
    const out = execFileSync("node", ["scripts/check-shell-varnames.mjs"], {
      env: { ...process.env, EXTRA_SH_DIRS: dir },
      encoding: "utf8",
    });
    assert.match(out, /🟠/, "ต้องรายงานเป็นสีส้ม");
    assert.match(out, /ผลลัพธ์=/, "ต้องเอ่ยถึงชื่อที่เจอ — ไม่งั้นคนที่ชนด่านหาที่แก้ไม่ได้");
    assert.match(out, /นอกรีโป 1/, "ต้องบอกขอบเขตที่ตรวจ");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ไม่พบโฟลเดอร์นอกรีโป ⇒ ต้องเขียนว่า 'ข้ามโดยตั้งใจ' ไม่ใช่เงียบ", () => {
  const out = execFileSync("node", ["scripts/check-shell-varnames.mjs"], {
    env: { ...process.env, EXTRA_SH_DIRS: join(tmpdir(), "ไม่มีจริง" + "ZZ" + "NOPEZZ") },
    encoding: "utf8",
  });
  assert.match(out, /ข้ามโดยตั้งใจ ไม่ใช่ตรวจแล้วผ่าน/);
});
