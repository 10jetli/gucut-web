// รวมรีวิวใหม่ที่ /api/reviews-ingest เก็บไว้ เข้ากับ src/data/reviews.json ตอน build
//
// ทำไมต้องรวมตอน build ไม่ใช่ตอนลูกค้าเปิดหน้า:
//   หน้ารีวิวถูก build เป็นไฟล์นิ่ง (public/rv/<id>.json) และดาว/จำนวนรีวิวถูกฝังในการ์ดสินค้า
//   ถ้าอ่านสดตอนเปิดหน้า ต้องรื้อทั้งระบบ · รวมตอน build จึงเป็นทางที่ไม่แตะของเดิมเลย
//
// ⚠️ ห้ามเขียนทับ src/data/reviews.json ในดิสก์ของ repo แล้ว commit อัตโนมัติ
//    ไฟล์นี้แก้เฉพาะ "ในรอบ build" (Netlify สร้างเครื่องใหม่ทุกครั้ง) — Blobs คือแหล่งจริงของรีวิวใหม่
//    เปิดเว็บดูจะเห็นรีวิวใหม่ทันทีหลัง deploy โดยที่ git ไม่รก
//
// ⚠️ ต้องรันก่อน gen-review-images.mjs และ gen-reviews.mjs เสมอ (สองตัวนั้นอ่านไฟล์นี้ต่อ)
// ⚠️ ไม่มี Blobs / ยิงไม่ได้ = ข้ามเงียบ ๆ ห้ามทำ build ตก — รีวิวใหม่ไม่ขึ้นดีกว่าเว็บ deploy ไม่ได้
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const FILE = join(root, "src/data/reviews.json");

async function pending() {
  let getStore;
  try {
    ({ getStore } = await import("@netlify/blobs"));
  } catch {
    return null; // รันในเครื่องที่ไม่มีแพ็กเกจ
  }
  try {
    const store = getStore({ name: "gucut-reviews", consistency: "strong" });
    const { blobs } = await store.list({ prefix: "r/" });
    if (!blobs.length) return [];
    const out = [];
    // ดึงทีละ 20 ก้อนพร้อมกัน — รีวิวหลักพันก็ยังทันในเวลา build
    for (let i = 0; i < blobs.length; i += 20) {
      const chunk = blobs.slice(i, i + 20);
      const got = await Promise.all(chunk.map((b) => store.get(b.key, { type: "json" }).catch(() => null)));
      out.push(...got.filter(Boolean));
    }
    return out;
  } catch (e) {
    console.log(`merge-pending-reviews: อ่าน Blobs ไม่ได้ (${e?.message || e}) — ข้ามรอบนี้`);
    return null;
  }
}

const fresh = await pending();
if (!fresh) {
  console.log("merge-pending-reviews: ไม่มีที่เก็บรีวิวใหม่ — ใช้ reviews.json เดิม");
  process.exit(0);
}
if (!fresh.length) {
  console.log("merge-pending-reviews: ไม่มีรีวิวใหม่รอ");
  process.exit(0);
}

const data = JSON.parse(readFileSync(FILE, "utf8"));

// ลายนิ้วมือของที่มีอยู่แล้ว — กันซ้ำอีกชั้นเผื่อรีวิวเดิมเคยถูกดึงเข้ามาด้วยมือ
const seen = new Set();
for (const [handle, v] of Object.entries(data)) {
  for (const it of v.items || []) {
    seen.add(`${handle}|${it.author || ""}|${(it.text || "").slice(0, 60)}|${it.date || ""}`);
  }
}

let merged = 0;
let skipDup = 0;
let noProduct = 0;

for (const r of fresh) {
  const key = `${r.handle}|${r.author || ""}|${(r.text || "").slice(0, 60)}|${r.date || ""}`;
  if (seen.has(key)) {
    skipDup++;
    continue;
  }
  // สินค้าที่ยังไม่มีในเว็บ (เช่นยังไม่ปลด draft) — เก็บไว้ใน Blobs ต่อ รอบหน้าค่อยเข้า
  if (!data[r.handle]) {
    noProduct++;
    continue;
  }
  data[r.handle].items.push({
    src: r.platform,
    rating: r.rating,
    author: r.author,
    text: r.text,
    images: r.images || [],
    date: r.date,
  });
  seen.add(key);
  merged++;
}

if (merged > 0) {
  // คิดคะแนนเฉลี่ย/จำนวนใหม่เฉพาะสินค้าที่มีรีวิวเพิ่ม
  for (const v of Object.values(data)) {
    const items = v.items || [];
    if (!items.length) continue;
    v.count = items.length;
    v.avg = Math.round((items.reduce((s, i) => s + (i.rating || 0), 0) / items.length) * 10) / 10;
  }
  writeFileSync(FILE, JSON.stringify(data, null, 1));
}

console.log(
  `merge-pending-reviews: รวมใหม่ ${merged} · ซ้ำข้าม ${skipDup} · ยังไม่มีสินค้าในเว็บ ${noProduct} (รอรอบหน้า)`
);
