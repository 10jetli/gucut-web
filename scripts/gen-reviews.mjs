// สร้างไฟล์ JSON รีวิวแยกรายสินค้าไว้ที่ public/rv/<productId>.json
// หน้า "ดูรีวิวทั้งหมด" จะ fetch ไฟล์นี้แล้วทยอยโชว์ทีละหน้า
// ทำแบบนี้เพื่อไม่ให้ HTML บวมตอนสินค้ามีรีวิวเป็นพัน
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const reviews = JSON.parse(readFileSync(join(root, "src/data/reviews.json"), "utf8"));
const products = JSON.parse(readFileSync(join(root, "src/data/products.json"), "utf8"));
const idByHandle = new Map(products.map((p) => [p.h, p.id]));

const outDir = join(root, "public/rv");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let files = 0;
let cards = 0;
for (const [handle, entry] of Object.entries(reviews)) {
  const id = idByHandle.get(handle);
  if (!id) continue; // สินค้าไม่อยู่ใน catalog (เช่น ยัง draft อยู่)
  const items = [...entry.items].sort(
    (a, b) => score(b) - score(a) || b.date.localeCompare(a.date)
  );
  writeFileSync(
    join(outDir, `${short(id)}.json`),
    JSON.stringify({ avg: entry.avg, count: entry.count, items })
  );
  files++;
  cards += items.length;
}

function score(r) {
  return (r.images.length ? 2 : 0) + (r.text.trim() ? 1 : 0);
}
function short(gid) {
  return String(gid).split("/").pop();
}

console.log(`[reviews] เขียน ${files} ไฟล์ · ${cards} การ์ดรีวิว → public/rv/`);
