// ตัวจับ "promise ปล่อยลอย" ในโค้ดฝั่งเซิร์ฟเวอร์ — รันทุกครั้งก่อน build
//
// ---------------------------------------------------------------------------
// ทำไมต้องมี (เจ้าของร้านสั่ง "หาทางแก้ไขป้องกันไม่ให้เกิดซ้ำ" + "กันเหนียว" 28 ส.ค. 2569)
//
// Netlify แช่แข็งฟังก์ชันทันทีที่ตอบคำขอเสร็จ — งานที่ยิงทิ้งไว้โดยไม่ await
// จะตายกลางทางแบบ "ไม่มี error ให้เห็น" บักตระกูลนี้กัดเรามาแล้ว 3 ครั้ง:
//   1. รูปสแกนบัตรไม่ถูกเก็บสักใบ (keepScan — 27 ส.ค.)
//   2. แคชสต็อก ZORT ค้าง 5 วัน หน้าสถานะฟ้อง "สต็อกเก่า 8,213 นาที" (28 ส.ค.)
//   3. เกือบพลาดซ้ำตอนทำลิงก์สั้น ลซ.1 (จับได้เพราะจำบทเรียนข้อ 1 ได้)
// จดใน CLAUDE.md แล้วก็ยังหลุด เพราะคนเขียน (AI) ไม่ได้อ่านทุกบรรทัดทุกรอบ
// ⇒ ต้องเป็นเครื่องตรวจที่ "ตกแล้ว build ไม่ผ่าน" เท่านั้นถึงจะกันได้จริง
//
// กติกาที่ตรวจ (เฉพาะ netlify/functions + netlify/lib):
//   คำสั่งลอย ๆ (ExpressionStatement) ที่เป็นการเรียกงานค้างคา ถือว่าผิด:
//   - X.set(...) / X.setJSON(...) / X.delete(...)   ← เขียน Blobs
//   - fetch(...)                                     ← ยิงเครือข่าย
//   - อะไรก็ตามที่จบด้วย .catch(...) เป็น statement   ← ท่าปล่อยลอยคลาสสิก
//   - void อะไรก็ตาม(...)                            ← ปล่อยลอยแบบตั้งใจ ซึ่งบนเซิร์ฟเวอร์ = ตาย
//   ที่ "ไม่ผิด": await แล้ว · ผูกกับตัวแปร (เอาไปฝาก waitUntil ต่อ) · context.waitUntil(...)
//
//   จำเป็นต้องปล่อยลอยจริง ๆ (รู้ว่าเสี่ยงและยอม) ให้เขียนคอมเมนต์
//   "ปล่อยลอย-ตั้งใจ" ไว้บรรทัดเดียวกันหรือบรรทัดบน — ตัวตรวจจะข้ามให้
//
// edge-functions ไม่ตรวจ — นโยบายที่นั่นกลับด้าน (ห้าม await ถ่วงบอต ดู ai-bots.js)
// ---------------------------------------------------------------------------

import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["netlify/functions", "netlify/lib"];
const WRITE_METHODS = new Set(["set", "setJSON", "delete"]);
const SKIP_MARK = "ปล่อยลอย-ตั้งใจ";

function* mjsFiles(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) yield* mjsFiles(p);
    else if (f.name.endsWith(".mjs")) yield p;
  }
}

/** ชื่อเมธอดท้ายสุดของสายเรียก a.b.c(...) — คืน "" ถ้าไม่ใช่ member call */
function tailMethod(call) {
  return ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : "";
}
/** ตัวรับของเมธอด เช่น s.setJSON → "s" · u.searchParams.set → "searchParams" */
function receiverName(call) {
  if (!ts.isPropertyAccessExpression(call.expression)) return "";
  const r = call.expression.expression;
  if (ts.isIdentifier(r)) return r.text;
  if (ts.isPropertyAccessExpression(r)) return r.name.text;
  return "";
}
// .set/.delete เฉย ๆ เจอทั้งใน Map และ URLSearchParams (ซึ่งเป็นงาน sync ไม่ผิด)
// จึงตีความว่าเป็น Blobs เฉพาะเมื่อตัวรับหน้าตาเป็น store (s, s2, store, xxStore ฯลฯ)
// ส่วน .setJSON มีแต่ Blobs เท่านั้น — จับทุกกรณี
const STORE_LIKE = /^(s\d?|us|store)$|store$/i;
/** ชื่อฟังก์ชันต้นสาย เช่น fetch(...) */
function rootName(call) {
  let e = call.expression;
  while (ts.isPropertyAccessExpression(e)) e = e.expression;
  while (ts.isCallExpression(e)) {
    let inner = e.expression;
    while (ts.isPropertyAccessExpression(inner)) inner = inner.expression;
    e = inner;
  }
  return ts.isIdentifier(e) ? e.text : "";
}

const problems = [];
/* 📏 **นับไฟล์ที่สแกนได้จริง — และ 0 ไฟล์ต้องถือว่าตก ไม่ใช่เขียว** (เพิ่ม 19 ก.ย. 2569)
   🔴 ของเดิมพิมพ์แค่ "ไม่มี promise ปล่อยลอย ✓" ⇒ วันที่ `ROOTS` ผิด (ย้ายโฟลเดอร์ ·
      เปลี่ยนนามสกุลไฟล์) มันจะสแกน 0 ไฟล์ แล้วขึ้นเขียว **หน้าตาเหมือนโค้ดสะอาด**
      = ด่านที่เขียวเพราะไม่ได้ตรวจอะไร ซึ่งอันตรายกว่าไม่มีด่าน
   📌 ผมเพิ่งกำชับเรื่องนี้กับฝั่งจอตอนยกด่านนี้ข้ามรีโป **แล้วพบว่าฝั่งผมเองก็ไม่มี**
      ⇒ 🔑 คำแนะนำที่เราให้คนอื่น ควรเอากลับมาตรวจของตัวเองด้วยทุกครั้ง */
const นับไฟล์ = {};

for (const root of ROOTS) {
  นับไฟล์[root] = 0;
  for (const file of mjsFiles(root)) {
    นับไฟล์[root]++;
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);

    const flag = (node, why) => {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      // คอมเมนต์ยกเว้น — บรรทัดเดียวกันหรือบรรทัดบน
      const cur = lines[line] || "";
      const above = lines[line - 1] || "";
      if (cur.includes(SKIP_MARK) || above.includes(SKIP_MARK)) return;
      problems.push(`${file}:${line + 1} — ${why}\n    ${cur.trim().slice(0, 90)}`);
    };

    const visit = (node) => {
      if (ts.isExpressionStatement(node)) {
        let expr = node.expression;
        let isVoid = false;
        if (ts.isVoidExpression(expr)) { isVoid = true; expr = expr.expression; }
        if (ts.isCallExpression(expr)) {
          const tail = tailMethod(expr);
          const rootFn = rootName(expr);
          const recv = receiverName(expr);
          const blobsWrite = tail === "setJSON" || (WRITE_METHODS.has(tail) && STORE_LIKE.test(recv));
          if (tail === "waitUntil") { /* ฝากถูกวิธีแล้ว */ }
          else if (blobsWrite) flag(node, `เขียน Blobs (.${tail}) โดยไม่ await — Netlify ฆ่าทิ้งก่อนเสร็จ`);
          else if (rootFn === "fetch") flag(node, "fetch โดยไม่ await — ตายกลางทางแบบเงียบ");
          else if (tail === "catch") flag(node, "ปล่อย promise ลอยจบด้วย .catch — ต้อง await หรือฝาก waitUntil");
          else if (isVoid) flag(node, "void ปล่อยลอยบนเซิร์ฟเวอร์ — ต้อง await หรือฝาก waitUntil");
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

/* 🚨 root ไหนสแกนได้ 0 ไฟล์ = ตะแกรงพลาด ไม่ใช่โค้ดสะอาด */
const rootว่าง = Object.entries(นับไฟล์).filter(([, n]) => n === 0).map(([r]) => r);
if (rootว่าง.length) {
  console.error(
    `✗ check-floating: สแกนได้ 0 ไฟล์ใน ${rootว่าง.join(", ")}\n` +
    "   ⇒ **นี่ไม่ใช่ข่าวดี** — แปลว่าตะแกรงชี้ผิดที่ (ย้ายโฟลเดอร์? เปลี่ยนนามสกุล?)\n" +
    "   ⇒ ด่านที่เขียวเพราะไม่ได้ตรวจอะไร อันตรายกว่าไม่มีด่าน ⇒ แก้ ROOTS ให้ตรงก่อน"
  );
  process.exit(1);
}

/* 🔍 **โฟลเดอร์ที่นโยบายกลับด้าน — นับให้เห็น ไม่ข้ามเงียบ** (เพิ่ม 19 ก.ย. 2569)
   `netlify/edge-functions` ห้าม await ตัวเขียนข้อมูล เพราะจะถ่วงบอต Google
   (วัดจริง: 223ms → 1,400ms · Google ลดจำนวนหน้าที่ไล่เก็บเมื่อเซิร์ฟเวอร์ตอบช้า)
   ⇒ **ของเดิมไม่สแกนโฟลเดอร์นี้เลยแบบเงียบ ๆ** ⇒ คนอ่านผลไม่มีทางรู้ว่ามีโฟลเดอร์ที่ถูกยกเว้น
   ⇒ ฝั่งจอทำถูกกว่า: **ข้ามได้ แต่ต้องพิมพ์รายการที่ข้ามออกมาทุกครั้ง**
   🔑 และเขาชี้ด้วยว่าอย่าใช้คำว่า "ปล่อยลอย-ตั้งใจ" กับของกลุ่มนี้ —
      คำนั้นแปลว่า "รู้ว่าเสี่ยงและยอม" ซึ่งผิด ของที่นี่ **ไม่เสี่ยงตั้งแต่ต้น** เพราะสภาพแวดล้อมต่างกัน */
/* ⚠️ **ต้องนับ `.js` ด้วย** — edge functions ที่มีอยู่จริงคือ `ai-bots.js`
   รอบแรกผมใช้ตัวเดินไฟล์ตัวเดิมที่รับแค่ `.mjs` ⇒ พิมพ์ว่า "ยกเว้น 0 ไฟล์"
   ⇒ **เลขที่พิมพ์ออกมาเป็นคำเท็จ** และแย่กว่าไม่พิมพ์ เพราะอ่านได้ว่า "ไม่มีอะไรถูกยกเว้น" */
let ยกเว้นEdge = 0;
try {
  const เดิน = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const q = path.join(dir, f.name);
      if (f.isDirectory()) เดิน(q);
      else if (/\.(mjs|js|ts)$/.test(f.name)) ยกเว้นEdge++;
    }
  };
  เดิน("netlify/edge-functions");
} catch { ยกเว้นEdge = -1; }

if (problems.length) {
  console.error("✗ พบ promise ปล่อยลอยในโค้ดเซิร์ฟเวอร์ — Netlify จะฆ่างานพวกนี้ทิ้งกลางทาง:\n");
  for (const p of problems) console.error("  " + p + "\n");
  console.error(`รวม ${problems.length} จุด · แก้ด้วยการ await หรือฝาก context.waitUntil`);
  console.error(`ถ้าจำเป็นต้องปล่อยลอยจริง ๆ ให้คอมเมนต์ "${SKIP_MARK}" กำกับบรรทัดนั้น`);
  process.exit(1);
}
console.log(
  "check-floating: โค้ดเซิร์ฟเวอร์ไม่มี promise ปล่อยลอย ✓\n" +
  "   📏 สแกน " + Object.entries(นับไฟล์).map(([r, n]) => `${r} ${n} ไฟล์`).join(" · ") + "\n" +
  "   ⏭️ ยกเว้น netlify/edge-functions " +
  (ยกเว้นEdge < 0 ? "(อ่านโฟลเดอร์ไม่ได้)" : `${ยกเว้นEdge} ไฟล์`) +
  " — นโยบายที่นั่นกลับด้าน (ห้าม await ถ่วงบอต) **ไม่ใช่ว่าตรวจแล้วผ่าน**"
);
