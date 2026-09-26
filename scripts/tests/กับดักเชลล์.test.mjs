/* 🐚 **ยิง bash ของจริงเพื่อยืนยันกับดักเชลล์ที่ทีมเหยียบซ้ำ** — ทุกครั้งที่รันเทส
 *
 * 🔴 ที่มา 19–20 ก.ย. 2569: ฝั่งจอเหยียบ **backtick ครั้งที่ 9** และ **ชื่อตัวแปรไทยครั้งที่ 7**
 *    ภายในสิบนาที **ทั้งที่บันทึกทั้งสองใบถูกต้องและผูกกับกลไกแล้ว**
 *    🔑 ปัญหาที่เขาสรุป: **บันทึกไม่มีอะไรมาตรวจ** ⇒ ผมเสนอย้ายเข้าคลังในรูปที่เครื่องทดสอบได้
 *      ⇒ เขาทำฝั่งจอก่อน · ไฟล์นี้คือฝั่งท่อ (ตั้งชื่อเดียวกันเพื่อให้เทียบข้ามฝั่งได้)
 *
 * ⚠️ **มันแก้อะไรและไม่แก้อะไร** (คำของฝั่งจอ · ผมยกมาทั้งท่อน):
 *    **ไม่ได้กันตอนมือกำลังพิมพ์คำสั่ง** — ตอนนั้นยังไม่มีอะไรกันได้
 *    สิ่งที่มันทำคือทำให้ **ข้อเท็จจริงเรื่องเชลล์ถูกยืนยันด้วยเครื่องซ้ำ ๆ** ในที่ที่ถูกอ่านซ้ำ
 *    ⇒ ย้ายจาก "ต้องจำ" เป็น "ถูกยิงทุกครั้ง" **แต่ยังไม่ใช่การป้องกัน**
 *
 * 🔑 **สองทิศทุกกับดัก** (ท่าผิดต้องพัง · ท่าถูกต้องรอด) — เหตุผลของฝั่งจอ:
 *    ทิศเดียวพิสูจน์ไม่ได้ว่าเราเข้าใจสาเหตุถูก · และสองทิศ **คุมกันเอง**:
 *    วันที่พฤติกรรมเชลล์เปลี่ยน จะมีด้านหนึ่งตกเสมอ ⇒ ไม่ต้องหาตัวควบคุมจากที่อื่น
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bash = (script) => spawnSync("bash", ["-c", script], { encoding: "utf8" });

test("🔴 backtick ในคำพูดคู่: ข้อความหาย · ส่วนที่เหลือยังอยู่ · และ exit 0", () => {
  /* เชลล์ **รันคำในนั้น** แล้วแทนด้วยผลลัพธ์ (ที่นี่คือค่าว่าง) */
  const r = bash('printf "%s" "ช่อง `echo -n` ถูกใช้"');
  assert.equal(r.status, 0, "🔑 exit 0 ⇒ ไม่มีอะไรฟ้อง · คำสั่งถัดไป (เช่น git commit) ยังสำเร็จ");
  assert.equal(r.stdout.includes("`"), false, "backtick ต้องหายไปจากผลลัพธ์");
  assert.ok(r.stdout.includes("ช่อง") && r.stdout.includes("ถูกใช้"),
    "🔑 **ส่วนที่เหลือยังอยู่ จึงดูเหมือนข้อความปกติ** — นี่คือเหตุที่มันรอดสายตา");
});

test("✅ ทิศลบ: คำพูดเดี่ยว — backtick รอดครบ", () => {
  const r = bash(`printf '%s' 'ช่อง \`ของจริง\` ถูกใช้'`);
  assert.equal(r.status, 0);
  assert.equal((r.stdout.match(/`/g) || []).length, 2, "ต้องเหลือ backtick ครบสองตัว");
});

test("✅ ทิศลบ: heredoc ที่ quote ชื่อคั่น — ท่าที่ผมใช้กับ git commit ทุกครั้ง", () => {
  const r = bash("cat <<'EOF'\nช่อง `ของจริง` ถูกใช้\nEOF");
  assert.equal(r.status, 0);
  assert.equal((r.stdout.match(/`/g) || []).length, 2,
    "heredoc ที่ quote ชื่อคั่น ⇒ เชลล์ไม่แตะเนื้อข้อความเลย");
});

test("🔴 ชื่อตัวแปรไทยใน bash: สคริปต์ **ไม่หยุด** · ค่ากลายเป็นว่าง · และ `$ชื่อ` ถูกพิมพ์ดิบ", () => {
  const r = bash('ผลจด=$(echo hello); echo "หลังจากนั้น=[$ผลจด]"; echo "ยังเดินต่อ"');
  assert.match(r.stderr, /command not found/, "bash บ่นใน stderr");
  assert.equal(r.status, 0, "🔑 **ไม่หยุด** — เดินต่อจนจบ ⇒ cron จะไม่เห็นความผิดพลาดนี้เลย");
  assert.ok(r.stdout.includes("ยังเดินต่อ"), "บรรทัดถัดไปยังทำงาน");
  // 🔑 อันตรายจริงที่เหมือนกันทุกเวอร์ชัน: **ค่าที่ควรได้หายไป**
  //    ⇒ `case`/`grep` ที่เทียบกับค่านั้นจะไม่ตรงอะไรเลย โดยไม่มีอะไรฟ้อง
  assert.equal(r.stdout.includes("hello"), false,
    "ค่าที่ควรได้ (hello) ต้องหายไป — นี่คือสิ่งที่ทำให้ `case`/`grep` เงียบผิด");

  /* ⚠️ **รูปของสิ่งที่พิมพ์ออกมาต่างกันตามเวอร์ชัน bash** (วัดจริง 25 ก.ย. 2569)
       bash 5.2 (Linux · g1 · Netlify) → พิมพ์ `$ผลจด` ดิบ ๆ
       bash 3.2 (ตัวที่มากับ macOS)    → กินชื่อไปบางส่วน เหลือไบต์เพี้ยนในวงเล็บ
     ⇒ เดิม assert เฉพาะรูปของ bash 5 ⇒ **บล็อกการ push จากเครื่อง macOS ทุกครั้ง**
       ทั้งที่บทเรียนที่ข้อนี้ต้องการสอน (ค่าหาย · ไม่หยุด) เกิดเหมือนกันทั้งสองเวอร์ชัน
     🚫 ห้ามแก้เป็น skip เงียบ ๆ — ด่าน "ค่าหาย" ข้างบนต้องยังตรวจทุกเครื่อง */
  const major = Number(String(bash("echo ${BASH_VERSINFO[0]}").stdout || "").trim()) || 0;
  if (major >= 4) {
    assert.ok(r.stdout.includes("$ผลจด"), "bash ≥4: `$ชื่อ` ที่ผิดรูปถูกพิมพ์ **ดิบ**");
  } else {
    assert.equal(r.stdout.includes("หลังจากนั้น=[]"), false,
      "bash 3.x: ต้องเหลือไบต์เพี้ยนในวงเล็บ ไม่ใช่ว่างสนิท (ว่างสนิท = พฤติกรรมเปลี่ยนไปอีกแบบ ต้องมาดู)");
  }
});

test("🔑 ชื่อตัวแปรไทย: `bash -n` **ผ่าน** ⇒ ด่านไวยากรณ์อย่างเดียวจะเงียบตลอดกาล", () => {
  const dir = mkdtempSync(join(tmpdir(), "shtrap-"));
  try {
    const f = join(dir, "ลอง.sh");
    writeFileSync(f, '#!/bin/bash\nผลจด=$(echo hi)\necho "$ผลจด"\n');
    const n = spawnSync("bash", ["-n", f], { encoding: "utf8" });
    assert.equal(n.status, 0,
      "bash -n ผ่าน ⇒ **ใครตั้งด่านด้วยตัวตรวจไวยากรณ์อย่างเดียว จะจับกับดักนี้ไม่ได้เลย** " +
      "(ท่อจึงต้องมี check-shell-varnames แยกอีกตัว — ข้อนี้ต้องรู้ก่อนตั้งด่าน)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("✅ ทิศลบ: ชื่อตัวแปร ASCII — ค่าถูกส่งต่อครบ ไม่มีเสียงบ่น", () => {
  const r = bash('JOB_RESULT=$(echo hello); echo "ค่า=[$JOB_RESULT]"');
  assert.equal(r.status, 0);
  assert.equal(r.stderr.trim(), "", "ต้องไม่มีอะไรใน stderr");
  assert.ok(r.stdout.includes("ค่า=[hello]"), "ค่าต้องถูกส่งต่อครบ");
});
