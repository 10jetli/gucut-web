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

// 📍 ปลายทางของรูปรีวิว — ย้ายจาก Netlify มา R2 เมื่อ 28 ก.ย. 2569 (ท่าเดียวกับที่เคยย้าย `/img/`)
//    วัดแล้ว: รูปรีวิว 3,117 ใบ (115 MB) วิ่งผ่าน Netlify จริง (`server: Netlify`)
//    ⇒ กินทั้งมิเตอร์ "คำขอ" และ "แบนด์วิดท์" ซึ่งเป็น 2 ใน 4 หมวดที่ Netlify คิดเงิน
//    และ R2 เสิร์ฟจากกรุงเทพฯ (`cf-ray …-BKK`) ส่วน Netlify เสิร์ฟจากสิงคโปร์
//
// 🔑 **ตั้งไว้ที่นี่ที่เดียวโดยตั้งใจ** — แผนที่ก้อนนี้คือแหล่งเดียวที่ทั้งสองทางอ่าน:
//      · `src/lib/reviews.ts`  → หน้าสินค้า (ฝั่งเซิร์ฟเวอร์)
//      · `scripts/gen-reviews.mjs` → `public/rv/*.json` ที่หน้า "รีวิวทั้งหมด" โหลดจากเบราว์เซอร์
//    เคยจะไปแก้ทีละทาง แล้วพบว่าค่าจะเลื่อนกันทีหลังแน่นอน ⇒ แก้ที่ต้นทางของทั้งคู่แทน
//    (เจอของจริงตอน build: หน้าสินค้าเปลี่ยนเป็น R2 แล้ว แต่ `/rv/*.json` ยังชี้ `/rv-img/` อยู่ 146 ไฟล์)
//
// ⚠️ **ชื่อไฟล์เป็นลายนิ้วมือ sha1 ของ URL ต้นทาง** ⇒ เนื้อเปลี่ยน = ชื่อเปลี่ยน จึงติด `immutable` ได้
// ⚠️ **เพิ่มรูปรีวิวใหม่ต้องอัปขึ้น R2 เองทุกครั้ง** ไม่มีอะไรทำให้อัตโนมัติ:
//      rclone copy public/rv-img r2:gucut-video/rvi \
//        --header-upload "cache-control: public, max-age=31536000, immutable" --ignore-times
//    ไม่อัป = แผนที่ชี้ไปที่ไฟล์ที่ยังไม่มีบน R2 ⇒ **รูปหายเงียบ ๆ** (ต่างจากของเดิมที่ไฟล์อยู่ในโปรเจกต์)
//    ด่านตรวจ: จำนวนไฟล์ใน public/rv-img ต้องเท่ากับบน R2 (`rclone lsf r2:gucut-video/rvi | wc -l`)
// ⚠️ ถอยกลับ: เปลี่ยน RV_HOST เป็น "/rv-img" แล้วรันสคริปต์นี้ใหม่ — ไฟล์เดิมยังอยู่ครบในโปรเจกต์
const RV_HOST = "https://video.gucut.com/rvi";

const have = new Set(readdirSync(IMG_DIR).filter((f) => f.endsWith(".webp")));
const map = {};
for (const [u, n] of urls) if (have.has(n)) map[u] = RV_HOST + "/" + n;
writeFileSync(join(root, "src/data/review-image-map.json"), JSON.stringify(map));

const pct = urls.size ? Math.round((Object.keys(map).length / urls.size) * 100) : 100;
console.log(
  `[review-img] รูปในรีวิว ${urls.size} รูป · เก็บเองแล้ว ${Object.keys(map).length} (${pct}%)`
);
