// ย่อรูปสินค้าไว้ล่วงหน้าแล้วเก็บที่ Cloudflare R2
//
//   node scripts/img-to-r2.mjs --limit 20    # ลอง 20 ใบก่อน แนะนำให้ทำอันนี้ก่อนเสมอ
//   node scripts/img-to-r2.mjs               # ทำทั้งหมด
//   node scripts/img-to-r2.mjs --jobs 8      # ย่อพร้อมกันกี่ใบ (ปกติ = จำนวน CPU)
//
// รันซ้ำได้ ใบที่ทำเสร็จแล้วข้ามให้เอง (จดไว้ใน .img-r2-done.json)
//
// ---------------------------------------------------------------------------
// ทำไมต้องทำ — วัดจากเครื่องในไทย 10 ครั้ง เอาค่ากลาง (25 ส.ค. 2569)
//   Netlify /img/ ตรง ๆ    0.142 วิ
//   Netlify Image CDN      0.148 วิ   ← แต่มีจังหวะพุ่งถึง 1.308 วิ ตอนต้องย่อสด
//   R2 + Cloudflare        0.071 วิ   ← เร็วกว่าเท่าตัว และนิ่งมาก (0.061–0.078)
//
// รูปต้นฉบับส่วนใหญ่เป็น 1000×1000 ราว 50 KB แต่การ์ดสินค้าโชว์แค่ 144–176 px
// เดิมจึงต้องให้ Netlify ย่อสดให้ทุกครั้ง — ย่อไว้ก่อนแล้วเสิร์ฟตรงจึงได้ทั้งเร็วและถูก
//
// ⚠️ ต้องมี sharp ก่อน (ลงในเครื่องอย่างเดียว ไม่ commit เข้า package.json
//    เพราะ Netlify จะต้องลงตามทุกครั้งที่ build ทั้งที่ไม่ได้ใช้ตอน build เลย)
//      npm i --no-save sharp
//
// ⚠️ ต้องตั้ง rclone remote ชื่อ r2 ไว้แล้ว (ทำไว้ตั้งแต่ตอนย้ายคลิป)
//    ตรวจด้วย  rclone lsd r2:gucut-video
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = process.cwd();
const SRC_DIR = path.join(root, "public/img");
const DONE_FILE = path.join(root, ".img-r2-done.json");

// ⚠️ ต้องตรงกับ LADDER ใน src/lib/image-loader.js เป๊ะ ๆ
//    ไม่ตรง = เบราว์เซอร์ขอไฟล์ที่ไม่มีอยู่ → รูปหาย ทั้งเว็บ
const LADDER = [128, 256, 384, 640];

// ⚠️ ยังใช้ถังของคลิปอยู่ (คีย์ปัจจุบันสร้างถังใหม่ไม่ได้ — ผูกไว้กับถังเดียว)
//    อยู่ใต้ /i/ แยกจาก /v/ กับ /v2/ ของคลิปชัดเจน ย้ายไปถังใหม่ทีหลังได้ด้วยการ copy
const BUCKET = "r2:gucut-video";
const PREFIX = "i";

const arg = (name, fb) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : fb;
};
const LIMIT = arg("--limit", 0);
const JOBS = arg("--jobs", Math.max(2, os.cpus().length - 1));

const readDone = () => {
  try { return new Set(JSON.parse(fs.readFileSync(DONE_FILE, "utf8"))); }
  catch { return new Set(); }
};

async function main() {
  const { default: sharp } = await import("sharp").catch(() => {
    throw new Error("ยังไม่มี sharp — สั่ง  npm i --no-save sharp  ก่อน");
  });

  const done = readDone();
  /* ⚠️ **ต้องรับ .avif ด้วย** — เจอจริง 4 ก.ย. 2569
      รูปสินค้า 03709 (ถังน้ำมันเบนซิน MS381) เป็น .avif ใบเดียวในคลัง
      ตัวกรองเดิมรับแค่ webp/jpg/png ⇒ **ใบนั้นไม่เคยถูกอัปขึ้น R2 เลย และไม่มีอะไรฟ้อง**
      สคริปต์รายงานว่า "เสร็จ" ทุกครั้ง เพราะมันไม่นับไฟล์ที่ไม่เข้าตัวกรองว่าเป็นงานค้าง
      ⇒ ของหายเงียบเพราะ "ไม่เข้าเกณฑ์" ไม่ใช่เพราะ "ทำแล้วพลาด" — จับยากกว่ามาก */
  let files = fs.readdirSync(SRC_DIR).filter((f) => /\.(webp|jpe?g|png|avif)$/i.test(f));
  const todo = files.filter((f) => !done.has(f));
  const pick = LIMIT ? todo.slice(0, LIMIT) : todo;

  console.log(
    `รูปทั้งหมด ${files.length} ใบ · ทำไปแล้ว ${done.size} · รอบนี้จะทำ ${pick.length} ใบ · พร้อมกัน ${JOBS}`,
  );
  if (!pick.length) return console.log("ไม่มีอะไรต้องทำ");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gucut-img-"));
  let ok = 0, fail = 0, bytesIn = 0, bytesOut = 0;

  // ย่อทีละใบแบบขนาน — ใบที่พังไม่ล้มทั้งงาน
  const worker = async (queue) => {
    for (;;) {
      const f = queue.shift();
      if (!f) return;
      try {
        const src = path.join(SRC_DIR, f);
        bytesIn += fs.statSync(src).size;
        const meta = await sharp(src).metadata();

        for (const w of LADDER) {
          const out = path.join(tmp, String(w), f);
          fs.mkdirSync(path.dirname(out), { recursive: true });
          // ⚠️ ห้ามขยายรูปให้ใหญ่กว่าต้นฉบับ — ได้ไฟล์หนักขึ้นแต่ไม่ได้คมขึ้น
          //    withoutEnlargement ทำให้ไฟล์ที่ต้นฉบับเล็กกว่ายังมีอยู่ครบทุกขั้น
          //    ตัวโหลดรูปจะได้ไม่ต้องรู้ว่าใบไหนมีขนาดไหน ขอขั้นไหนก็เจอเสมอ
          await sharp(src)
            .resize(w, null, { withoutEnlargement: true })
            .webp({ quality: 72 })
            .toFile(out);
          bytesOut += fs.statSync(out).size;
        }

        // ต้นฉบับเก็บไว้ด้วย สำหรับหน้าสินค้าที่ต้องการรูปใหญ่สุด
        const orig = path.join(tmp, "orig", f);
        fs.mkdirSync(path.dirname(orig), { recursive: true });
        fs.copyFileSync(src, orig);
        bytesOut += fs.statSync(orig).size;

        ok += 1;
        if (ok % 100 === 0) console.log(`  ย่อแล้ว ${ok}/${pick.length} ใบ`);
        void meta;
      } catch (e) {
        fail += 1;
        console.log(`  ⚠️ ${f}: ${e.message}`);
      }
    }
  };

  const queue = [...pick];
  await Promise.all(Array.from({ length: JOBS }, () => worker(queue)));
  console.log(`ย่อเสร็จ ${ok} ใบ (พัง ${fail}) — กำลังอัปขึ้น R2...`);

  // อัปทีเดียวทั้งโฟลเดอร์ เร็วกว่ายิงทีละไฟล์มาก
  await run("rclone", [
    "copy", tmp, `${BUCKET}/${PREFIX}`,
    "--transfers", "32", "--checkers", "32",
    // ⚠️ R2 ไม่ส่ง cache-control มาเอง ต้องติดไปกับไฟล์ตอนอัปเท่านั้น
    //    ไม่ติด = เบราว์เซอร์ลูกค้าไม่เก็บรูปไว้เลย กลับมาเข้าซ้ำก็โหลดใหม่ทุกใบ
    //    (ตอนอยู่ Netlify ได้ max-age=31536000 มาฟรี — ย้ายมาแล้วหายไปเงียบ ๆ
    //     PageSpeed จับได้ในหัวข้อ "ใช้อายุการใช้งานแคชที่มีประสิทธิภาพ" 25 ส.ค. 2569)
    //    ชื่อไฟล์มีเลขสุ่มต่อท้ายอยู่แล้ว เปลี่ยนรูป = ชื่อเปลี่ยน จึงตั้ง immutable ได้ปลอดภัย
    "--header-upload", "Cache-Control: public, max-age=31536000, immutable",
    // ⚠️ ต้องมี --ignore-times ไม่งั้น rclone เห็นว่าไฟล์ชื่อ+ขนาดเดิมมีอยู่แล้วก็ข้ามไปเฉย ๆ
    //    แล้วหัวข้อมูลด้านบนจะไม่เคยถูกติดเลย (หลงคิดว่าติดแล้ว เพราะ rclone ไม่ฟ้องอะไร)
    //    ปลอดภัยที่จะใส่ถาวร เพราะโฟลเดอร์ชั่วคราวมีแต่ไฟล์ที่ยังไม่เคยอัป
    //    (ตัวกรองซ้ำอยู่ที่ .img-r2-done.json ไม่ได้พึ่ง rclone)
    "--ignore-times",
    "--s3-no-check-bucket",       // คีย์ผูกกับถังเดียว เช็คถังไม่ได้
    "--stats", "10s", "--stats-one-line",
  ], { maxBuffer: 64 * 1024 * 1024 });

  for (const f of pick) done.add(f);
  fs.writeFileSync(DONE_FILE, JSON.stringify([...done]));
  fs.rmSync(tmp, { recursive: true, force: true });

  const mb = (n) => (n / 1024 / 1024).toFixed(1) + " MB";
  console.log(
    `เสร็จ · ต้นฉบับ ${mb(bytesIn)} → ไฟล์ที่สร้าง ${mb(bytesOut)} (${LADDER.length} ขนาด + ต้นฉบับ)`,
  );
}

main().catch((e) => {
  console.error("ล้มเหลว:", e.message);
  process.exit(1);
});
