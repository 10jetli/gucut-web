// ผูกด่านพื้นจำนวนด่านในสายกับ **ไฟล์เคสร่วมสองรีโป**
// 🔑 เหตุที่แชร์เคสไม่แชร์โค้ด: สำเนาที่ถูกวันนี้ = ฝาแฝดที่ถูกแก้คนละวัน
//    [[twins-fixed-on-different-days-are-not-equal]] · และแชร์โค้ด = ผิดพร้อมกันทั้งสองฝั่ง
//    [[parity-cant-see-shared-error]]
// ⚠️ อ่านไฟล์เคสไม่ได้ ⇒ **ตก** ไม่ใช่ข้ามเงียบ ๆ · พิมพ์ mtime ทุกรอบ (ของนอกรีโป)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, statSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./_ล็อกปลูก.mjs";   // 🔒 ปลูกลงไฟล์จริงต้องทำทีละราย

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

const CASES = "/home/jetli/claude-shared/lib/เคส-พื้นจำนวนด่านในสาย.json";

function โหลดเคส() {
  const st = statSync(CASES);
  const นาที = Math.round((Date.now() - st.mtimeMs) / 60000);
  console.log(`   📂 ไฟล์เคสร่วม (นอกรีโป): ${st.mtime.toLocaleString("th-TH")} · ${นาที} นาทีที่แล้ว · ${st.size} ไบต์`);
  if (นาที <= 30) console.log(`   ⚠️ **ของร่วมนี้เพิ่งถูกแก้ ≤30 นาที** ⇒ แดงรอบนี้ให้สงสัยของที่เพิ่งเปลี่ยนก่อน`);
  return JSON.parse(readFileSync(CASES, "utf8"));
}

// จัดฉาก package.json ปลอมที่มีชื่อด่าน n ตัว แล้วยิงด่านจริง
function ยิงด่าน(c) {
  const dir = mkdtempSync(join(tmpdir(), "chain-"));
  const floor = join(dir, "floor.json");
  const pkg = join(dir, "package.json");
  const n = Number(c["จำนวนด่าน"]);
  let ชื่อ = Array.from({ length: n }, (_, i) => `scripts/check-ปลอม${i}.mjs`);
  // เคส "ชื่อซ้ำ": เติมชื่อเดิมอีกครั้ง ⇒ จำนวน **ชื่อไม่ซ้ำ** ต้องยังเป็น n
  if (c["ชื่อซ้ำ"]) ชื่อ = [...ชื่อ, ชื่อ[0], ชื่อ[1] ?? ชื่อ[0]];
  writeFileSync(pkg, JSON.stringify({ scripts: { prebuild: ชื่อ.map((s) => `node ${s}`).join(" && "), postbuild: "", test: "" } }));
  writeFileSync(floor, JSON.stringify({
    "สูงสุดที่เคยเห็น": c["พื้น"], "วันที่": "2026-10-14", "เหตุที่ลด": c["เหตุที่ลด"] ?? null,
    "_คำนำหน้าที่นับ": ["check-", "probe-", "verify-", "audit-"], "_สายที่นับ": ["prebuild", "postbuild", "test"],
  }));
  if (c["ไฟล์พื้นหาย"]) rmSync(floor);
  let out = "", rc = 0;
  try { out = execFileSync(process.execPath, ["scripts/check-chain-floor.mjs", floor, pkg], { encoding: "utf8" }); }
  catch (e) { rc = e.status ?? 1; out = `${e.stdout ?? ""}${e.stderr ?? ""}`; }
  let พื้นหลัง = null;
  try { พื้นหลัง = JSON.parse(readFileSync(floor, "utf8"))["สูงสุดที่เคยเห็น"]; } catch {}
  if (rc !== 0) return { สถานะ: "ตก", out, พื้นหลัง };
  if (out.includes("คุมไม่ได้รอบนี้")) return { สถานะ: "คุมไม่ได้", out, พื้นหลัง };
  return { สถานะ: "ผ่าน", out, พื้นหลัง };
}

test("ด่านพื้นจำนวนด่านในสาย: ตรงกับไฟล์เคสร่วมทุกเคส", () => {
  if (!อ่านเคสได้ไหม(CASES)) return;
  const d = โหลดเคส();
  assert.ok(Array.isArray(d["เคส"]) && d["เคส"].length >= 10, "ไฟล์เคสต้องมีอย่างน้อย 10 เคส");
  const ตก = [];
  for (const c of d["เคส"]) {
    const r = ยิงด่าน(c);
    if (r.สถานะ !== c["คาดหวัง"]) { ตก.push(`${c["ชื่อ"]}: คาดหวัง ${c["คาดหวัง"]} ได้ ${r.สถานะ}\n${r.out.trim()}`); continue; }
    if ("พื้นหลังต้องเป็น" in c && r.พื้นหลัง !== c["พื้นหลังต้องเป็น"])
      ตก.push(`${c["ชื่อ"]}: พื้นในไฟล์หลังด่านทำงานต้องเป็น ${c["พื้นหลังต้องเป็น"]} แต่ได้ ${r.พื้นหลัง} ⇒ เขียนไฟล์ผิดทิศ`);
  }
  assert.equal(ตก.length, 0, `เคสที่ไม่ตรง ${ตก.length}/${d["เคส"].length}:\n${ตก.join("\n---\n")}`);
  console.log(`   ✅ ด่านพื้นจำนวนด่านในสายผ่านเคสร่วม ${d["เคส"].length}/${d["เคส"].length}`);
});

test("ข้อความตอนตกต้องแยก 'ตะแกรงพัง' ออกจาก 'สายหด' (ทางแก้คนละอย่าง)", () => {
  const พัง = ยิงด่าน({ "จำนวนด่าน": 3, "พื้น": 25, "เหตุที่ลด": null });
  const หด = ยิงด่าน({ "จำนวนด่าน": 24, "พื้น": 25, "เหตุที่ลด": null });
  assert.equal(พัง.สถานะ, "ตก"); assert.equal(หด.สถานะ, "ตก");
  assert.match(พัง.out, /ตะแกรงพัง/, "น้อยกว่า 5 ต้องบอกว่าตะแกรงพัง");
  assert.doesNotMatch(หด.out, /ตะแกรงพัง/, "สายหดธรรมดาต้องไม่บอกว่าตะแกรงพัง");
  assert.match(หด.out, /หายไป 1 ตัว/, "สายหดต้องบอกจำนวนที่หาย");
});

test("ด่านตัวนี้ต้องไม่อยู่ในสายที่มันนับ (ไม่งั้นหายไปพร้อมของที่มันจับ)", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const สาย = ["prebuild", "postbuild", "test"].map((k) => String(pkg?.scripts?.[k] ?? "")).join(" ");
  assert.doesNotMatch(สาย, /check-chain-floor/, "check-chain-floor ต้องเรียกจากฮุคเท่านั้น");
  /* 🔴 **สามสถานะ ไม่ใช่สองสถานะ** — ของเดิมอ่านฮุคตรง ๆ ⇒ ENOENT บนเครื่องที่ยังไม่ติดตั้งฮุค
   *    ⇒ `npm test` ตก ⇒ prebuild ตก ⇒ **build ของ Netlify ล้มสองใบติดกัน (142dd282 · 3b23972a)**
   *    🔑 ด่าน push จับไม่ได้เลย เพราะมันรันบน **เครื่องที่มีฮุคอยู่แล้วเสมอ**
   *       ⇒ ⇒ "ผ่านบนเครื่องเรา ไม่ใช่ผ่าน" กลับด้าน: เทสยืนยัน **สภาพของเครื่องนักพัฒนา**
   *          แล้วถูกเอาไปวางในสายที่รันบนเครื่อง build ซึ่งไม่มีสภาพนั้นโดยธรรมชาติ */
  if (!existsSync(".git/hooks/pre-push")) {
    console.log("   ⬜ คุมไม่ได้รอบนี้: ยังไม่ได้ติดตั้งฮุค (.git/hooks/pre-push ไม่มี) — ช่องว่าง ไม่ใช่ผลผ่าน");
    console.log("      ⇒ ติดตั้งด้วย `bash scripts/install-pre-push.sh` แล้วเทสข้อนี้จะคุมได้");
    return;
  }
  const hook = readFileSync(".git/hooks/pre-push", "utf8");
  assert.match(hook, /check-chain-floor/, "ฮุคที่ติดตั้งอยู่ต้องเรียกมันจริง — ไม่ใช่มีแต่ไฟล์");
});
