// ผ่ารูปปกร้านเป็นแบนเนอร์ครึ่งบน/ครึ่งล่าง ย่อไว้ล่วงหน้า แล้วเก็บที่ R2
//
//   npm i --no-save sharp        # ครั้งเดียว
//   node scripts/hero-to-r2.mjs
//
// ---------------------------------------------------------------------------
// รูปนี้คือ "ชิ้นใหญ่สุดที่ลูกค้าเห็นตอนเปิดหน้าแรก" (ตัวชี้วัด LCP ของ PageSpeed)
// เดิมให้ Netlify Image CDN ผ่าครึ่งและย่อสดให้ทุกครั้ง — วัดได้ 0.73 วิ ตอนแคชเย็น
// และมีจังหวะพุ่งถึง 1.3 วิ ซึ่งพอไปโดนรูปนี้เข้า คะแนนตกทันที
//
// ⚠️ ต้องสร้างใหม่ทุกครั้งที่เปลี่ยนไฟล์ public/img/cover-all.jpg
//    ไม่มีอะไรรันให้อัตโนมัติ — ไฟล์เก่าจะค้างอยู่บน R2 ตลอดไป
// ⚠️ ความกว้างต้องตรงกับ HERO_WIDTHS ใน src/lib/hero.ts เป๊ะ ๆ
//    ไม่ตรง = เบราว์เซอร์ขอไฟล์ที่ไม่มี แล้วแบนเนอร์หน้าแรกหายทั้งใบ
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = process.cwd();

const SRC = path.join(root, "public/img/cover-all.jpg");
const WIDTHS = [640, 750, 828, 1080, 1200, 1500];
const SRC_W = 1500;
const HALF_H = 750;
const BUCKET = "r2:gucut-video";

async function main() {
  const { default: sharp } = await import("sharp").catch(() => {
    throw new Error("ยังไม่มี sharp — สั่ง  npm i --no-save sharp  ก่อน");
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gucut-hero-"));
  let total = 0;

  for (const position of ["top", "bottom"]) {
    for (const w of WIDTHS) {
      const h = Math.round((w * HALF_H) / SRC_W);
      const out = path.join(tmp, `${position}-${w}.webp`);
      await sharp(SRC)
        // ครึ่งบน = ตัดจากขอบบน · ครึ่งล่าง = ตัดจากขอบล่าง (เหมือน position ของ Image CDN)
        .extract({
          left: 0,
          top: position === "top" ? 0 : SRC_W - HALF_H,
          width: SRC_W,
          height: HALF_H,
        })
        .resize(w, h)
        // รูปถ่ายฉากร้าน ลดคุณภาพลงหน่อยตาเปล่าดูไม่ออก แต่ไฟล์เบาลงราวหนึ่งในสาม
        .webp({ quality: 60 })
        .toFile(out);
      total += fs.statSync(out).size;
      console.log(`  ${position}-${w}.webp  ${Math.round(fs.statSync(out).size / 1024)} KB`);
    }
  }

  await run("rclone", [
    "copy", tmp, `${BUCKET}/i/hero`,
    "--transfers", "12", "--s3-no-check-bucket", "--stats-one-line",
  ]);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`เสร็จ · ${WIDTHS.length * 2} ไฟล์ รวม ${(total / 1024).toFixed(0)} KB`);
}

main().catch((e) => {
  console.error("ล้มเหลว:", e.message);
  process.exit(1);
});
