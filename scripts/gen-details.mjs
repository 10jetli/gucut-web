// ดึง "รายละเอียดเต็ม" ออกจาก descriptionHtml ของ Shopify → src/data/details.json
//
// ที่เอามา:
//   specs  รูปตารางสเปก / รูปอธิบายสินค้า ที่ฝังอยู่ในรายละเอียด
//   docs   ลิงก์ดาวน์โหลด (แบบฟอร์ม ลซ.1 · คู่มืออะไหล่)
//   steps  ขั้นตอนขอใบอนุญาตเลื่อยโซ่ยนต์
//
// ใช้ data-original เสมอ (เป็น URL cdn.shopify.com ตัวจริง) ไม่ใช้ www.gucut.com
// เพราะพอปิดร้าน Shopify โดเมนนั้นจะตายไปด้วย
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = "/mnt/user-data/uploads/Downloads/gucut-catalog.jsonl";
const OUT = join(root, "src/data/details.json");

if (!existsSync(RAW)) {
  console.log("[details] ไม่เจอไฟล์แคตตาล็อกดิบ — ข้าม (ใช้ของเดิมที่ commit ไว้)");
  process.exit(0);
}

const products = JSON.parse(readFileSync(join(root, "src/data/products.json"), "utf8"));
const handles = new Set(products.map((p) => p.h));

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
   .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const strip = (s) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const out = {};
for (const line of readFileSync(RAW, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let o;
  try { o = JSON.parse(line); } catch { continue; }
  const h = o.handle;
  if (!h || !handles.has(h) || out[h]) continue;
  const html = o.descriptionHtml || "";
  if (!html) continue;

  // ---- รูปในรายละเอียด (ตารางสเปก ฯลฯ) ----
  const specs = [];
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    const orig = /data-original="([^"]+)"/.exec(tag)?.[1];
    const src = /\ssrc="([^"]+)"/.exec(tag)?.[1];
    let u = orig || src;
    if (!u) continue;
    // www.gucut.com/cdn/shop/... เป็นโดเมนร้าน Shopify — แปลงเป็น cdn.shopify.com
    if (u.includes("www.gucut.com/cdn/shop/")) continue; // มี data-original ให้ใช้อยู่แล้ว
    if (!u.startsWith("http")) continue;
    const w = +(/\swidth="(\d+)"/.exec(tag)?.[1] || 0);
    const ht = +(/\sheight="(\d+)"/.exec(tag)?.[1] || 0);
    if (!specs.some((s) => s.u === u)) specs.push(ht && w ? { u, w, h: ht } : { u });
  }

  // ---- ลิงก์ดาวน์โหลดเอกสาร ----
  const docs = [];
  for (const m of html.matchAll(/<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const label = strip(m[2]);
    if (!label) continue;
    const url = decode(m[1]);
    if (!docs.some((d) => d.url === url)) docs.push({ label, url });
  }

  // ---- ขั้นตอนขอใบอนุญาต (ถ้ามี) ----
  const steps = [];
  if (/วิธีขอใบอนุญาต/.test(html)) {
    for (const m of html.matchAll(/<p>[\s\S]*?<strong>\s*(\d\.[\s\S]*?)<\/strong>[\s\S]*?<\/p>/g)) {
      const t = strip(m[1]);
      if (t && !steps.includes(t)) steps.push(t);
    }
  }

  if (specs.length || docs.length || steps.length) {
    out[h] = {};
    if (specs.length) out[h].specs = specs;
    if (docs.length) out[h].docs = docs;
    if (steps.length) out[h].steps = steps;
  }
}

writeFileSync(OUT, JSON.stringify(out, null, 1));
const nImg = Object.values(out).reduce((a, d) => a + (d.specs?.length || 0), 0);
const nDoc = Object.values(out).reduce((a, d) => a + (d.docs?.length || 0), 0);
console.log(
  `[details] ${Object.keys(out).length} สินค้า · รูปสเปก ${nImg} · เอกสารดาวน์โหลด ${nDoc}`
);
