// สร้างรายชื่อรูปสินค้าทั้งหมดที่ต้องเก็บไว้เอง → public/image-list.json
// ตัวอัปเดตบนเครื่องเจ้าของอ่านไฟล์นี้ แล้วโหลดเฉพาะรูปที่ยังไม่มีใน public/img
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const products = JSON.parse(readFileSync(join(root, "src/data/products.json"), "utf8"));

const localName = (url) => {
  const base = url.split("?")[0].split("/").pop();
  return base ? base.replace(/\.(jpe?g|png|webp|avif|gif)$/i, "") + ".webp" : null;
};

const seen = new Map();
const add = (url) => {
  if (!url || !url.includes("cdn.shopify.com")) return;
  const n = localName(url);
  if (n && !seen.has(n)) seen.set(n, url);
};

for (const p of products) {
  add(p.img);
  for (const u of p.imgs || []) add(u);
  for (const v of p.v || []) add(v.i);
}

const list = [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(join(root, "public/image-list.json"), JSON.stringify(list));
console.log(`[image-list] รูปสินค้าที่ต้องเก็บเอง ${list.length} รูป`);
