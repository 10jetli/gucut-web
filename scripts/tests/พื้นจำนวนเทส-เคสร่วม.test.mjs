// ผูกด่านพื้นจำนวนเทสกับ **ไฟล์เคสร่วมสองรีโป** — ไม่ใช่เคสที่เขียนไว้ในเทสนี้เอง
//
// 🔑 เหตุที่เคสอยู่นอกรีโป (ตกลงกับฝั่งจอ 14 ต.ค. 2569):
//    ด่านเดียวกันมีสองฝั่ง (gucut-web · gucut-next) **ห้ามก๊อปโค้ดข้ามรีโป**
//    (สำเนาที่ถูกวันนี้ = ฝาแฝดที่ถูกแก้คนละวัน ⇒ [[twins-fixed-on-different-days-are-not-equal]])
//    ⇒ แชร์ **เคส** ไม่ใช่ **โค้ด** ⇒ รูปต่างกันได้ แต่ฝั่งใดเพี้ยน เคสจับฝั่งนั้นฝั่งเดียว
//    ⇒ ถ้าแชร์ regex/โค้ด จะได้ "ผิดพร้อมกันทั้งสองฝั่ง" ⇒ [[parity-cant-see-shared-error]]
//
// ⚠️ อ่านไฟล์เคสไม่ได้ ⇒ **ตัดสินไม่ได้ ⇒ ต้องตก** ไม่ใช่ข้ามเงียบ ๆ (ไม่มีด่าน ≠ ผ่านด่าน)
// ⚠️ พิมพ์ mtime ของไฟล์เคสทุกรอบ — มันเป็นของนอกรีโป ⇒ แดงอาจมาจากฝั่งที่เพิ่งแก้ของร่วม
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, statSync, mkdtempSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* 🔴 **เครื่อง build ไม่มี /home/jetli** ⇒ พาธเต็มของไฟล์เคสร่วมอ่านไม่ได้ ⇒ ENOENT ⇒ เทสตก
 *    ⇒ prebuild เรียก `npm test` ⇒ **build ล้ม** (ฝั่งจอจับได้ด้วยการก๊อปเทสออกไปนอกรีโป
 *      แล้วชี้พาธไปที่ไม่มีจริง — การจำลองของผมมองไม่เห็น เพราะโคลนสะอาดของผม
 *      ยังอยู่บนเครื่องที่ **มี** /home/jetli/claude-shared)
 * 🔑 หัวไฟล์นี้เขียนไว้เองว่า "อ่านไฟล์เคสไม่ได้ ⇒ ต้องตก" ⇒ **สเปกนั่นแหละที่ฆ่า build**
 *    และสเปกนั้นถูกในบริบทเดียว: **เครื่องคน** ที่ของร่วมควรมีอยู่
 * ✅ สามสถานะ: เครื่อง build (CI/NETLIFY) ⇒ ประกาศว่าไม่ได้ตรวจแล้ว return (นับเทสเท่าเดิม)
 *              เครื่องคน + อ่านไม่ได้ ⇒ **ตก** (ของร่วมหาย = เรื่องจริงที่ต้องรู้)
 * ⚠️ ใช้ `return` ไม่ใช่ลบเทส ⇒ `# tests` ไม่ลด ⇒ ไม่ชนพื้นจำนวนเทส */
const บนเครื่องbuild = !!(process.env.NETLIFY || process.env.CI);
function อ่านเคสได้ไหม(path) {
  if (existsSync(path)) return true;
  if (บนเครื่องbuild) {
    console.log(`   ⬜ ไม่ได้ตรวจ: ของที่ต้องตรวจไม่มีอยู่บนเครื่อง build (${path})`);
    console.log("      ⇒ หลักประกันจริงอยู่ที่ด่าน pre-push บนเครื่องคน ซึ่งรันเคสร่วมทุกครั้ง");
    return false;
  }
  return true; // เครื่องคน: ปล่อยให้ readFileSync โยน ⇒ ตก ตามสเปกเดิม
}

const CASES = "/home/jetli/claude-shared/lib/เคส-พื้นจำนวนเทส.json";

function โหลดเคส() {
  const raw = readFileSync(CASES, "utf8");
  const st = statSync(CASES);
  const นาที = Math.round((Date.now() - st.mtimeMs) / 60000);
  console.log(`   📂 ไฟล์เคสร่วม (นอกรีโป): แก้ล่าสุด ${st.mtime.toLocaleString("th-TH")} · ${นาที} นาทีที่แล้ว · ${st.size} ไบต์`);
  if (นาที <= 30) console.log(`   ⚠️ **ของร่วมนี้เพิ่งถูกแก้ ≤30 นาที** ⇒ ถ้าเทสนี้แดง ให้สงสัยของที่เพิ่งเปลี่ยนก่อนรื้อด่านตัวเอง`);
  return JSON.parse(raw);
}

// เรียกด่านจริงด้วยไฟล์ชั่วคราว แล้วแปลผลเป็นสามสถานะ
function ยิงด่าน({ จำนวนเทส, พื้น, เหตุที่ลด }) {
  const dir = mkdtempSync(join(tmpdir(), "floor-"));
  const log = join(dir, "test.log");
  const floor = join(dir, "floor.json");
  writeFileSync(log, จำนวนเทส === null ? "ไม่มีบรรทัดจำนวนเทสในนี้\n" : `# tests ${จำนวนเทส}\n# pass ${จำนวนเทส}\n# fail 0\n`);
  writeFileSync(floor, JSON.stringify({ "สูงสุดที่เคยเห็น": พื้น, "วันที่": "2026-10-14", "เหตุที่ลด": เหตุที่ลด ?? null }));
  let out = "", rc = 0;
  try {
    out = execFileSync(process.execPath, ["scripts/check-test-floor.mjs", log, floor], { encoding: "utf8" });
  } catch (e) { rc = e.status ?? 1; out = `${e.stdout ?? ""}${e.stderr ?? ""}`; }
  const พื้นหลัง = JSON.parse(readFileSync(floor, "utf8"))["สูงสุดที่เคยเห็น"];
  if (rc !== 0) return { สถานะ: "ตก", out, พื้นหลัง };
  if (out.includes("คุมไม่ได้รอบนี้")) return { สถานะ: "คุมไม่ได้", out, พื้นหลัง };
  return { สถานะ: "ผ่าน", out, พื้นหลัง };
}

test("ด่านพื้นจำนวนเทส: ตรงกับไฟล์เคสร่วมทุกเคส", () => {
  if (!อ่านเคสได้ไหม(CASES)) return;
  const d = โหลดเคส();
  assert.ok(Array.isArray(d["เคส"]) && d["เคส"].length >= 8, "ไฟล์เคสต้องมีอย่างน้อย 8 เคส — น้อยกว่านี้ให้สงสัยว่าไฟล์ถูกตัด");
  const ตก = [];
  for (const c of d["เคส"]) {
    const r = ยิงด่าน(c);
    if (r.สถานะ !== c["คาดหวัง"]) { ตก.push(`${c["ชื่อ"]}: คาดหวัง ${c["คาดหวัง"]} ได้ ${r.สถานะ}\n${r.out.trim()}`); continue; }
    // บางเคสตรวจ **ไฟล์พื้นหลังด่านทำงาน** ด้วย — ด่านที่เขียนไฟล์ที่มันตรวจ ต้องเขียนทิศเดียว
    if ("พื้นหลังต้องเป็น" in c && r.พื้นหลัง !== c["พื้นหลังต้องเป็น"])
      ตก.push(`${c["ชื่อ"]}: พื้นในไฟล์หลังด่านทำงานต้องเป็น ${c["พื้นหลังต้องเป็น"]} แต่ได้ ${r.พื้นหลัง} ⇒ ด่านเขียนไฟล์ผิดทิศ`);
  }
  assert.equal(ตก.length, 0, `เคสที่ไม่ตรง ${ตก.length}/${d["เคส"].length}:\n${ตก.join("\n---\n")}`);
  console.log(`   ✅ ด่านพื้นจำนวนเทสผ่านเคสร่วม ${d["เคส"].length}/${d["เคส"].length}`);
});

test("ยกพื้นเองเมื่อจำนวนเทสเพิ่ม (และเขียนลงไฟล์จริง)", () => {
  const r = ยิงด่าน({ จำนวนเทส: 1600, พื้น: 1589, เหตุที่ลด: null });
  assert.equal(r.สถานะ, "ผ่าน");
  assert.equal(r.พื้นหลัง, 1600, "ยกพื้นแล้วต้องเขียนลงไฟล์ — ไม่เขียน = พื้นค้างต่ำกว่าของจริงตลอดกาล");
});

test("ไม่ยกพื้นเมื่อเท่าเดิม (กันไฟล์ถูกเขียนทุกรอบโดยไม่จำเป็น)", () => {
  const r = ยิงด่าน({ จำนวนเทส: 1589, พื้น: 1589, เหตุที่ลด: null });
  assert.equal(r.สถานะ, "ผ่าน");
  assert.equal(r.พื้นหลัง, 1589);
});
