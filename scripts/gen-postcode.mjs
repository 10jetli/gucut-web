// สร้าง src/data/postcode.json จากชุดข้อมูลสาธารณะ
//
// ---------------------------------------------------------------------------
// รันใหม่:  node scripts/gen-postcode.mjs
//
// ที่มา: github.com/thailand-geography-data/thailand-geography-json
//
// ⚠️ ห้ามเขียนชื่อตำบลหรือรหัสไปรษณีย์จากความจำเด็ดขาด
//    มันดูเหมือนถูกแต่ผิดเป็นบางตำบลโดยไม่มีอะไรฟ้อง
//    แล้วลูกค้าเอาไปยื่นเป็นคำรับรองต่อนายทะเบียน
//
// ⚠️ รอบแรก (25 ส.ค. 2569) ย่อ 734 อำเภอที่ใช้รหัสเดียวทั้งอำเภอ
//    ให้เหลือแค่ตัวเลข ทิ้งรายชื่อตำบลไป เพื่อลดขนาดไฟล์
//    ผลคือ "ตรวจสะกดชื่อตำบลไม่ได้" ในอำเภอพวกนั้น
//    เจอของจริง 26 ส.ค. 2569 — ตัวอ่านให้ "ภูกาสิงห์" มาแทน "กู่กาสิงห์"
//    แล้วไม่มีอะไรจับได้ เพราะ อ.เกษตรวิสัย เป็นอำเภอรหัสเดียว
//    ⇒ รอบนี้เก็บ "ชื่อตำบลครบทุกอำเภอ" แล้วเก็บรหัสเฉพาะตำบลที่ต่างจากรหัสหลัก
//       ⚠️ ห้ามย่อกลับไปทิ้งรายชื่อตำบลอีก ตัวตรวจสะกดจะตาบอดทันที
//
// รูปแบบที่ได้
//   { "<จังหวัด>": { "<อำเภอ>": { "": "<รหัสหลัก>", "<ตำบล>": "" | "<รหัสต่าง>" } } }
//   ค่าว่าง "" แปลว่าตำบลนั้นใช้รหัสหลักของอำเภอ (ประหยัดที่)
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";

const SRC = "https://raw.githubusercontent.com/thailand-geography-data/thailand-geography-json/main/src/geography.json";
const OUT = path.join(process.cwd(), "src/data/postcode.json");

const rows = await fetch(SRC).then((r) => {
  if (!r.ok) throw new Error(`โหลดข้อมูลไม่ได้ (${r.status})`);
  return r.json();
});
if (!Array.isArray(rows) || rows.length < 7000) {
  // ⚠️ ต้องล้มเสียงดัง ห้ามเขียนไฟล์ครึ่ง ๆ ทับของเดิม
  //    ไฟล์ที่ขาดไปครึ่งจะทำให้ตำบลจริงกลายเป็น "ไม่พบ" แล้วเราจะไปแก้ให้ลูกค้าผิด ๆ
  throw new Error(`ข้อมูลน้อยผิดปกติ (${rows?.length} แถว) ยกเลิก`);
}

/** province -> district -> { tambon: postal } */
const tree = {};
for (const r of rows) {
  const p = r.provinceNameTh, d = r.districtNameTh, t = r.subdistrictNameTh;
  const code = String(r.postalCode ?? "").trim();
  if (!p || !d || !t || !/^\d{5}$/.test(code)) continue;
  ((tree[p] ??= {})[d] ??= {})[t] = code;
}

// ย่อ: หารหัสที่พบบ่อยสุดของอำเภอเป็น "รหัสหลัก" แล้วตำบลที่ตรงกันเก็บเป็นค่าว่าง
const out = {};
let tambons = 0, oddities = 0;
for (const [p, ds] of Object.entries(tree)) {
  out[p] = {};
  for (const [d, ts] of Object.entries(ds)) {
    const tally = {};
    for (const c of Object.values(ts)) tally[c] = (tally[c] || 0) + 1;
    const main = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    const node = { "": main };
    for (const [t, c] of Object.entries(ts)) {
      node[t] = c === main ? "" : c;
      tambons++;
      if (c !== main) oddities++;
    }
    out[p][d] = node;
  }
}

fs.writeFileSync(OUT, JSON.stringify(out));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(
  `เขียน ${OUT}\n` +
  `  จังหวัด ${Object.keys(out).length} · อำเภอ ${Object.values(out).reduce((s, d) => s + Object.keys(d).length, 0)} · ตำบล ${tambons}\n` +
  `  ตำบลที่รหัสต่างจากรหัสหลักของอำเภอ ${oddities} · ขนาด ${kb} KB`,
);
