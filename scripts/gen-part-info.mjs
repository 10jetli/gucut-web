// แกะข้อมูลอะไหล่ออกจาก "ชื่อสินค้า" → src/data/part-info.json
//
// ชื่ออะไหล่ของร้านอัดข้อมูลไว้เยอะมาก เช่น
//   "04418 สกรูหัวจม M5x10 (ยึดท่อไอเสีย) 5200, (7800sp-F11)(B5), 8800(F4)"
// แกะได้: รหัส 04418 · ใช้กับ 5200/7800SP/8800 · ตำแหน่งในผัง F11,B5,F4 · ขนาด M5x10
//
// ลูกค้าอะไหล่ค้นด้วย "รุ่นเครื่อง + เลขตำแหน่งในผัง" เป็นหลัก
// ดึงออกมาเป็นข้อมูลจริงแล้วทั้งโชว์ในหน้าสินค้าและใส่ในดัชนีค้นหาได้
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const products = JSON.parse(readFileSync(join(root, "src/data/products.json"), "utf8"));

// เรียงจากยาวไปสั้น — จับตัวที่เฉพาะเจาะจงที่สุดก่อน แล้วตัดข้อความนั้นออก
// เพื่อไม่ให้ "7800TB" ถูกนับเป็น "7800" ซ้ำ หรือ "MINI-ONE" กลายเป็น "MINI"
const MODELS = [
  ["MINI-ONE", /MINI[\s-]?ONE/g],
  ["7800TB", /7800\s?TB|7800\s?TURBO/g],
  ["7800SP", /7800\s?SP(?!ER)/g],
  ["8800SP", /8800\s?SP/g],
  ["9800SP", /9800\s?SP/g],
  ["MS070", /MS\s?070/g],
  ["MS170", /MS\s?170/g],
  ["MS180", /MS\s?180/g],
  ["MS250", /MS\s?250/g],
  ["MS341", /MS\s?341/g],
  ["MS361", /MS\s?361/g],
  ["MS362", /MS\s?362/g],
  ["MS381", /MS\s?381/g],
  ["MS440", /MS\s?440/g],
  ["MS460", /MS\s?460/g],
  ["MS660", /MS\s?660/g],
  ["ATOM", /ATOM/g],
  ["MINI", /\bMINI\b/g],
  ["9800", /\b9800\b/g],
  ["8800", /\b8800\b/g],
  ["7800", /\b7800\b/g],
  ["5800", /\b5800\b/g],
  ["5200", /\b5200\b/g],
  ["4500", /\b4500\b/g],
  ["3800", /\b3800\b/g],
  ["2500", /\b2500\b/g],
  ["1700", /\b1700\b/g],
  ["F880", /\b880\b/g],
  ["F660", /\b660\b/g],
  ["F440", /\b440\b/g],
  ["F381", /\b381\b/g],
  ["F361", /\b361\b/g],
  ["F250", /\b250\b/g],
  ["F090", /\b090\b/g],
  ["F070", /\b070\b/g],
  ["F038", /\b038\b/g],
];

function parse(title) {
  // ตัดรหัส 5 หลักหน้าชื่อออกก่อน ไม่งั้นเลขรหัสจะไปชนกับเลขรุ่น
  const m = /^\s*(\d{4,5})\s+(.*)$/.exec(title);
  const code = m ? m[1].padStart(5, "0") : null;
  let body = m ? m[2] : title;

  const out = {};
  if (code) out.code = code;

  // ---- ขนาด / เกลียว (เก็บไว้ก่อน แล้วเอาออกจากข้อความ กันไปปนกับตำแหน่ง) ----
  const sizes = [];
  const SIZE = /\b(?:ST\s?)?M?\d+(?:\.\d+)?\s?[x×]\s?\d+(?:\.\d+)?(?:\s?[x×]\s?\d+(?:\.\d+)?)?(?:\s?mm)?|\b\d+-\d+-\d+\b/gi;
  let work = body.replace(SIZE, (s) => {
    const v = s.replace(/\s+/g, "");
    if (!sizes.includes(v)) sizes.push(v);
    return " ";
  });

  // ---- รุ่นเครื่องที่ใช้ได้ ----
  const fits = [];
  let scan = work.toUpperCase();
  for (const [name, re] of MODELS) {
    re.lastIndex = 0;
    if (re.test(scan)) {
      fits.push(name);
      scan = scan.replace(new RegExp(re.source, "g"), " "); // ตัดออกกันซ้ำซ้อน
    }
  }

  // ---- ตำแหน่งในผังอะไหล่ ----
  const pos = [];
  for (const mm of work.matchAll(/NO\.?\s?(\d{1,3})/gi)) {
    const v = "NO." + mm[1];
    if (!pos.includes(v)) pos.push(v);
  }
  // รหัสช่อง เช่น (F11) (B5) H10 — ตัวอักษร A-L ตามด้วยเลข 1-2 หลัก
  // ไม่เอา M (เกลียวเมตริก) และต้องไม่ตามด้วย x หรือจุด
  for (const mm of work.matchAll(/(?<![A-Z0-9])([A-L])\s?(\d{1,2})(?![\dx.×])\b/g)) {
    if (mm.index < 2) continue;          // อยู่ต้นชื่อ = รหัสสินค้า ไม่ใช่ตำแหน่งในผัง
    const v = mm[1] + mm[2];
    if (!pos.includes(v)) pos.push(v);
  }

  // ---- เบอร์อ้างอิง เช่น #6202RS ----
  const refs = [];
  for (const mm of body.matchAll(/#\s?([0-9]{3,}[A-Z0-9-]*)/g)) {
    if (!refs.includes(mm[1])) refs.push(mm[1]);
  }

  if (fits.length) out.fits = fits;
  if (pos.length) out.pos = pos.slice(0, 6);
  if (sizes.length) out.size = sizes.slice(0, 3);
  if (refs.length) out.ref = refs.slice(0, 3);
  return Object.keys(out).length > 1 || out.fits || out.pos ? out : null;
}

const info = {};
for (const p of products) {
  const r = parse(p.t);
  if (r) info[p.h] = r;
}

writeFileSync(join(root, "src/data/part-info.json"), JSON.stringify(info));
const n = (k) => Object.values(info).filter((v) => v[k]).length;
console.log(
  `[part-info] แกะได้ ${Object.keys(info).length} สินค้า · ใช้กับรุ่น ${n("fits")} · ตำแหน่งในผัง ${n("pos")} · ขนาด ${n("size")}`
);
