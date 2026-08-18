// สร้างไฟล์ JSON รีวิวแยกรายสินค้าไว้ที่ public/rv/<productId>.json
// หน้า "ดูรีวิวทั้งหมด" จะ fetch ไฟล์นี้แล้วทยอยโชว์ทีละหน้า
// ทำแบบนี้เพื่อไม่ให้ HTML บวมตอนสินค้ามีรีวิวเป็นพัน
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const reviews = JSON.parse(readFileSync(join(root, "src/data/reviews.json"), "utf8"));
const products = JSON.parse(readFileSync(join(root, "src/data/products.json"), "utf8"));
const idByHandle = new Map(products.map((p) => [p.h, p.id]));

// รูปรีวิวที่เก็บมาไว้เองแล้ว → ชี้มาที่เว็บเรา (ที่เหลือชี้ต้นทางเดิมไปก่อน)
const rvMap = JSON.parse(readFileSync(join(root, "src/data/review-image-map.json"), "utf8"));
const localImg = (u) => rvMap[(u || "").split("?")[0]] || u;
let ownImg = 0;
let remoteImg = 0;

const outDir = join(root, "public/rv");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// กันชื่อแพลตฟอร์มหลุดออกไปหน้าเว็บ — ทั้งภาษาอังกฤษและภาษาไทย
// (ลูกค้าบางคนพิมพ์ถึงร้านที่อื่นในรีวิว รีวิวพวกนี้ไม่เอาขึ้น)
const PLATFORM = /shopee|lazada|tiktok|tik ?tok|ช้อปปี้|ช็อปปี้|ลาซาด้า|ลาซาด้า|ติ๊กต๊อก|ติกต็อก|ทิกทอก/i;

// ⚠️ ซ่อนรีวิวที่พูดถึง "ส่งฟรี" — ร้านไม่มีส่งฟรี (เจ้าของร้านย้ำ 18 ส.ค. 2569)
//    รีวิวพวกนี้เป็นคำพูดลูกค้าจริงสมัยขายผ่าน Lazada/Shopee ที่แพลตฟอร์มมีโปรส่งฟรี
//    ปล่อยไว้ = ลูกค้าคาดหวังส่งฟรีแล้วมาเจอค่าส่ง 70-400 บาทตอนเช็คเอาต์
//    เลือก "ซ่อนทั้งรีวิว" ไม่ใช่ "แก้ข้อความ" เพราะแก้คำพูดลูกค้า = ปลอมแปลงรีวิว
//    กระทบ 7 รีวิวจากทั้งหมด 4,622 (0.15%)
const FREE_SHIP = /ส่งฟรี|จัดส่งฟรี|ฟรีค่าส่ง/;

let files = 0;
let cards = 0;
let dropped = 0;
for (const [handle, entry] of Object.entries(reviews)) {
  const id = idByHandle.get(handle);
  if (!id) continue; // สินค้าไม่อยู่ใน catalog (เช่น ยัง draft อยู่)
  const kept = entry.items.filter((r) => {
    if (PLATFORM.test(r.text || "")) { dropped++; return false; }
    if (FREE_SHIP.test(r.text || "")) { dropped++; return false; }
    return true;
  });
  const items = kept
    .sort((a, b) => score(b) - score(a) || b.date.localeCompare(a.date))
    // ไม่ส่งชื่อแพลตฟอร์มออกไปให้ลูกค้าเห็น แม้ในข้อมูลดิบ — เก็บไว้แค่ในไฟล์ต้นทาง
    .map(({ src, ...rest }) => ({
      ...rest,
      images: (rest.images || []).map((u) => {
        const l = localImg(u);
        l === u ? remoteImg++ : ownImg++;
        return l;
      }),
    }));
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

console.log(`[reviews] เขียน ${files} ไฟล์ · ${cards} การ์ดรีวิว → public/rv/` +
  (dropped ? ` · ตัดรีวิวที่เอ่ยชื่อแพลตฟอร์ม ${dropped} ใบ` : ""));
console.log(`[reviews] รูปในรีวิว — จากเราเอง ${ownImg} · ยังชี้ต้นทางเดิม ${remoteImg}`);
