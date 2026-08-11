// รูปในรีวิวลูกค้า — เตรียมรายชื่อให้ดาวน์โหลดมาเก็บเอง แล้วทำแผนที่ URL → ไฟล์ในเครื่อง
//
// ทำ 2 อย่าง:
//   src/data/review-image-list.json   รายชื่อที่ต้องโหลด  [[ชื่อไฟล์, URL ต้นทาง], ...]
//   src/data/review-image-map.json  แผนที่เฉพาะรูปที่ "มีอยู่จริง" ใน public/rv-img แล้ว
//
// เป็นระบบ self-healing: รูปไหนยังไม่ได้โหลด เว็บก็ยังชี้ไปที่ต้นทางเดิม ไม่พัง
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMG_DIR = join(root, "public/rv-img");
mkdirSync(IMG_DIR, { recursive: true });

const reviews = JSON.parse(readFileSync(join(root, "src/data/reviews.json"), "utf8"));

// ตัด query string ออกก่อน เพื่อให้ชื่อไฟล์คงที่แม้ต้นทางเปลี่ยน ?v=
export const cleanUrl = (u) => (u || "").split("?")[0];
const nameOf = (u) => createHash("sha1").update(cleanUrl(u)).digest("hex").slice(0, 16) + ".webp";

const urls = new Map(); // url สะอาด -> ชื่อไฟล์
for (const entry of Object.values(reviews)) {
  for (const it of entry.items || []) {
    for (const u of it.images || []) {
      if (!u || !u.startsWith("http")) continue;
      const c = cleanUrl(u);
      if (!urls.has(c)) urls.set(c, nameOf(c));
    }
  }
}

const list = [...urls.entries()].map(([u, n]) => [n, u]).sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(join(root, "src/data/review-image-list.json"), JSON.stringify(list));

const have = new Set(readdirSync(IMG_DIR).filter((f) => f.endsWith(".webp")));
const map = {};
for (const [u, n] of urls) if (have.has(n)) map[u] = "/rv-img/" + n;
writeFileSync(join(root, "src/data/review-image-map.json"), JSON.stringify(map));

const pct = urls.size ? Math.round((Object.keys(map).length / urls.size) * 100) : 100;
console.log(
  `[review-img] รูปในรีวิว ${urls.size} รูป · เก็บเองแล้ว ${Object.keys(map).length} (${pct}%)`
);
