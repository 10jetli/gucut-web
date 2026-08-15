// ย้ายคลิปจาก Shopify ไปเก็บที่ Cloudflare R2 ในรูปแบบ HLS (สตรีมมิ่งปรับความคมชัดเอง)
//
// รันบนเครื่อง Mac ของเจ้าของร้าน (เครื่องที่ Claude ทำงานอยู่ต่อ Shopify CDN ไม่ได้)
//
//   node scripts/video-to-r2.mjs              # ทำทั้งหมด
//   node scripts/video-to-r2.mjs --limit 5    # ลองแค่ 5 คลิปก่อน แนะนำให้ทำอันนี้ก่อน
//   node scripts/video-to-r2.mjs --jobs 4     # แปลงพร้อมกันกี่คลิป (ปกติ = ครึ่งหนึ่งของ CPU)
//   node scripts/video-to-r2.mjs --keep       # ไม่ลบไฟล์ชั่วคราวทิ้ง เอาไว้ตรวจ
//
// รันซ้ำได้ ใบที่ทำเสร็จแล้วจะข้ามให้เอง (จดไว้ใน .r2-done.json)
// ปิดเครื่องกลางคันแล้วมารันต่อได้เลย
//
// ---------- เตรียมเครื่องครั้งเดียว ----------
// 1) ลงเครื่องมือ (ใช้ Homebrew)
//      brew install ffmpeg rclone
//
// 2) เปิด R2 ที่ dash.cloudflare.com -> R2 -> Enable  (ต้องผูกบัตร)
//    สร้าง bucket ชื่อ  gucut-video
//
// 3) สร้างคีย์ที่ R2 -> Manage API Tokens -> Create API Token (สิทธิ์ Object Read & Write)
//    จะได้ Access Key ID กับ Secret Access Key มา  ** อย่าเอาไปวางในแชท **
//
// 4) บอก rclone ให้รู้จัก R2 (พิมพ์ทีเดียว ใส่คีย์ของตัวเองแทน XXX/YYY/ZZZ)
//      rclone config create r2 s3 \
//        provider=Cloudflare \
//        access_key_id=XXX \
//        secret_access_key=YYY \
//        endpoint=https://ZZZ.r2.cloudflarestorage.com \
//        acl=private
//    (ZZZ คือ Account ID ดูได้ที่หน้า R2)
//
// 5) ผูกโดเมนให้ bucket: R2 -> gucut-video -> Settings -> Public access
//    -> Connect Domain -> video.gucut.com
//
// เสร็จแล้วมาแก้ HOST ใน src/lib/videos.ts เป็น https://video.gucut.com

import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { cpus } from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);

const BUCKET = "r2:gucut-video";        // ชื่อ remote ที่ตั้งไว้ตอน rclone config + ชื่อ bucket
const WORK = ".r2-work";                // โฟลเดอร์ทำงานชั่วคราว
const DONE_FILE = ".r2-done.json";      // จดว่าใบไหนเสร็จแล้ว

// ความคมชัดที่จะทำ — ตัวเลขคือความสูงของภาพ
// คลิปแนวตั้งของร้านสูง 1080 อยู่แล้ว จึงได้ครบทั้ง 3 ระดับ
// เน็ตอ่อนเบราว์เซอร์จะหยิบ 480 เอง เน็ตดีขยับขึ้น 1080 ให้เอง
const LADDER = [
  { h: 480, v: "1000k", a: "64k" },
  { h: 720, v: "2000k", a: "96k" },
  { h: 1080, v: "3600k", a: "128k" },
];

const SEG = 4;   // ความยาวชิ้นละกี่วินาที — 4 วิกำลังดี เริ่มเล่นไว สลับความคมชัดไว

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? true);
};
const LIMIT = Number(flag("limit", 0));
const JOBS = Math.max(1, Number(flag("jobs", Math.max(1, Math.floor(cpus().length / 2)))));
const KEEP = args.includes("--keep");

// ---------- ตรวจว่ามีเครื่องมือครบไหม ----------
// ffmpeg/ffprobe ใช้ "-version" แต่ rclone ใช้ "version" เฉย ๆ
// (rclone อ่าน -version เป็นแฟล็กย่อ -v -e -r... แล้วตายทันที เคยทำให้สคริปต์นี้
//  ฟ้องว่า "ยังไม่มี rclone" ทั้งที่ลงไว้แล้ว)
async function need(cmd, how, arg = "-version") {
  try { await run(cmd, [arg]); }
  catch {
    console.error(`\n❌ ยังไม่มี ${cmd} — ลงก่อนด้วยคำสั่ง:\n   ${how}\n`);
    process.exit(1);
  }
}

// ---------- ตัวช่วย ----------
const cdn = (v, suffix) => `https://cdn.shopify.com/videos/c/vp/${v}/${v}.${suffix}.mp4`;

async function probe(file) {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", file,
  ]);
  const [w, h] = stdout.trim().split(",").map(Number);
  return { w, h };
}

async function download(url, to) {
  await run("curl", ["-sSfL", "--retry", "3", "-o", to, url]);
}

// แปลงหนึ่งความคมชัด — ไฟล์ออกเป็น m3u8 + ชิ้นวิดีโอ .ts
async function encode(src, dir, rung) {
  await mkdir(dir, { recursive: true });
  await run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", src,
    "-vf", `scale=-2:${rung.h}`,
    "-c:v", "libx264", "-profile:v", "main", "-preset", "veryfast", "-crf", "23",
    "-maxrate", rung.v, "-bufsize", String(parseInt(rung.v) * 2) + "k",
    // บังคับให้ทุกความคมชัดตัดชิ้นตรงจังหวะเดียวกัน ไม่งั้นสลับความคมชัดแล้วภาพกระตุก
    "-force_key_frames", `expr:gte(t,n_forced*${SEG})`,
    "-c:a", "aac", "-b:a", rung.a, "-ac", "2",
    "-f", "hls", "-hls_time", String(SEG), "-hls_playlist_type", "vod",
    "-hls_segment_filename", `${dir}/seg%03d.ts`,
    `${dir}/index.m3u8`,
  ]);
}

// ทำคลิปหนึ่งใบให้ครบ: โหลด -> แปลงทุกความคมชัด -> ทำรูปปก -> อัปขึ้น R2
async function one(clip) {
  const id = clip.v;
  const dir = `${WORK}/${id}`;
  const src = `${dir}/src.mp4`;
  await mkdir(dir, { recursive: true });

  // เอาไฟล์ที่คมที่สุดที่ Shopify มีมาเป็นต้นฉบับ
  await download(cdn(id, clip.hd ?? clip.s), src);
  const { w, h } = await probe(src);

  // ไม่ทำความคมชัดที่ใหญ่กว่าต้นฉบับ (ขยายแล้วไม่ได้ชัดขึ้น ได้แต่ไฟล์อ้วน)
  let rungs = LADDER.filter((r) => r.h <= h);
  if (!rungs.length) rungs = [LADDER[0]];

  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
  for (const r of rungs) {
    await encode(src, `${dir}/v${r.h}`, r);
    const rw = Math.round((w * r.h) / h / 2) * 2;
    const band = parseInt(r.v) * 1000 + parseInt(r.a) * 1000;
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${band},RESOLUTION=${rw}x${r.h}`, `v${r.h}/index.m3u8`);
  }
  await writeFile(`${dir}/master.m3u8`, lines.join("\n") + "\n");

  // รูปปกทำเองจากคลิป จะได้ไม่ต้องพึ่งรูปปกของ Shopify อีก
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1", "-i", src,
    "-frames:v", "1", "-vf", `scale=-2:${Math.min(h, 720)}`, "-q:v", "4", `${dir}/poster.jpg`]);

  await rm(src);   // ต้นฉบับไม่ต้องอัป เปลืองที่เปล่า ๆ
  await run("rclone", ["copy", dir, `${BUCKET}/v/${id}`, "--transfers", "8", "--s3-no-check-bucket"]);
  if (!KEEP) await rm(dir, { recursive: true, force: true });
}

// ---------- เริ่มทำงาน ----------
console.log("ตรวจเครื่องมือ...");
await need("ffmpeg", "brew install ffmpeg");
await need("ffprobe", "brew install ffmpeg");
await need("rclone", "brew install rclone", "version");

const clips = JSON.parse(await readFile("src/data/videos.json", "utf8"));
const done = new Set(existsSync(DONE_FILE) ? JSON.parse(await readFile(DONE_FILE, "utf8")) : []);
let todo = clips.filter((c) => !done.has(c.v));
if (LIMIT) todo = todo.slice(0, LIMIT);

console.log(`คลิปทั้งหมด ${clips.length} ใบ · ทำไปแล้ว ${done.size} ใบ · รอบนี้จะทำ ${todo.length} ใบ · แปลงพร้อมกัน ${JOBS} ใบ`);
if (!todo.length) { console.log("ไม่มีอะไรต้องทำแล้ว ✅"); process.exit(0); }

await mkdir(WORK, { recursive: true });

let ok = 0, fail = 0, at = 0;
const save = () => writeFile(DONE_FILE, JSON.stringify([...done]));

// เดินหน้าทีละหลายใบพร้อมกัน แต่ไม่เกิน JOBS
async function worker() {
  while (at < todo.length) {
    const clip = todo[at++];
    const n = at;
    try {
      await one(clip);
      done.add(clip.v);
      ok++;
      if (ok % 10 === 0) await save();
    } catch (e) {
      fail++;
      console.error(`  ✗ ${clip.v} — ${String(e.message ?? e).split("\n")[0]}`);
    }
    process.stdout.write(`\r  ${n}/${todo.length} · สำเร็จ ${ok} · พลาด ${fail}   `);
  }
}
await Promise.all(Array.from({ length: JOBS }, worker));
await save();

console.log(`\n\nเสร็จแล้ว — สำเร็จ ${ok} ใบ · พลาด ${fail} ใบ`);
console.log(`รวมทำไปแล้วทั้งหมด ${done.size}/${clips.length} ใบ`);
if (fail) console.log("ใบที่พลาดรันสคริปต์ซ้ำได้เลย มันจะข้ามใบที่เสร็จแล้วให้เอง");
if (done.size === clips.length) {
  console.log("\n🎉 ครบแล้ว — ขั้นต่อไปแก้ HOST ใน src/lib/videos.ts เป็น https://video.gucut.com");
}
