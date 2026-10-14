// 🪝 **ฮุคทุกตัวที่ติดตั้งอยู่ต้องมีต้นฉบับในรีโป** — ไม่ใช่แค่ตัวที่ตัวติดตั้งดูแล
//
// 🔴 ที่มา 14 ต.ค. 2569 — ฝั่งจอเจอว่าตัวติดตั้ง/ตัวตรวจของเขาดูแค่ pre-push
//    ⇒ สำเนา pre-commit ใน .git/ เป็นของเก่า · เขาแก้ต้นฉบับหลายรอบแล้ว **ไม่มีอะไรฟ้อง**
//    🔑 **ตัวตรวจที่ตรวจของชิ้นเดียวในกองที่มีหลายชิ้น รายงานว่ากองนั้นเรียบร้อย**
//    ⇒ ⇒ ตรวจฝั่งนี้แล้วหนักกว่าหนึ่งขั้น: `commit-msg` รันทุก commit **แต่ไม่มีต้นฉบับในรีโปเลย**
//       (ยกเข้า scripts/hooks/ แล้วใน commit เดียวกับเทสนี้)
// ⚠️ เทสนี้ยอมให้ "ไม่มีฮุคเลย" ผ่าน — เครื่องใหม่ที่ยังไม่รันตัวติดตั้งไม่ควรเทสตก
//    แต่ถ้า **มี** ฮุคอยู่ มันต้องมีต้นฉบับ (หรือเป็น pre-push ที่สร้างจากตัวติดตั้ง)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const md5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex").slice(0, 8);

test("ฮุคที่ติดตั้งอยู่ทุกตัวมีต้นฉบับในรีโป และตรงกัน", () => {
  if (!existsSync(".git/hooks")) { console.log("   ⬜ ไม่มี .git/hooks — ข้าม (ช่องว่าง ไม่ใช่ผลผ่าน)"); return; }
  const ฮุค = readdirSync(".git/hooks").filter((f) => !f.endsWith(".sample"));
  const ปัญหา = [];
  for (const h of ฮุค) {
    const src = `scripts/hooks/${h}`;
    if (existsSync(src)) {
      const a = md5(`.git/hooks/${h}`), b = md5(src);
      console.log(`   🪝 ${h} ${a} ${a === b ? "✅ ตรงกับ " + src : "🔴 ไม่ตรงกับ " + src + ` (${b})`}`);
      if (a !== b) ปัญหา.push(`${h}: .git/hooks=${a} แต่ ${src}=${b} ⇒ รัน **โค้ดคนละชุด** กับที่อ่าน`);
    } else if (h === "pre-push") {
      console.log(`   🪝 ${h} ${md5(`.git/hooks/${h}`)} ✅ สร้างจาก scripts/install-pre-push.sh`);
    } else {
      console.log(`   🪝 ${h} ${md5(`.git/hooks/${h}`)} 🔴 ไม่มีต้นฉบับในรีโป`);
      ปัญหา.push(`${h}: ไม่มี ${src} ⇒ หายแล้วสร้างใหม่ไม่ได้ และไม่มีอะไรเทียบว่าถูกแก้ไหม`);
    }
  }
  console.log(`   🪝 ตรวจฮุค ${ฮุค.length} ตัว · มีปัญหา ${ปัญหา.length}`);
  assert.equal(ปัญหา.length, 0, `ฮุคที่มีปัญหา:\n${ปัญหา.join("\n")}`);
});
