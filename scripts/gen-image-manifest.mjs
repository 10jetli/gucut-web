// สแกนรูปที่เก็บไว้เองใน public/img/ แล้วทำบัญชีรายชื่อ → src/data/image-map.json
// catalog.ts จะใช้บัญชีนี้สลับ URL จาก Shopify มาเป็นของเราเอง "เฉพาะไฟล์ที่มีจริง"
// รูปไหนยังไม่ได้เก็บ ก็ใช้ Shopify ต่อไป — เว็บไม่มีวันรูปแตกระหว่างทาง
import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dir = join(root, "public/img");
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const files = readdirSync(dir).filter((f) => !f.startsWith("."));
writeFileSync(
  join(root, "src/data/image-map.json"),
  JSON.stringify(files.sort())
);

console.log(`[images] เก็บเองแล้ว ${files.length} รูป → public/img/`);
