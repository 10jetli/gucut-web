#!/usr/bin/env node
// แปลงคลิปให้เซกเมนต์สั้นลงเหลือ 2 วินาที — คลิปเริ่มเล่นไวขึ้น
//
// ทำไมต้องแปลงภาพใหม่ ไม่ใช่แค่หั่นใหม่:
//   ตรวจแล้วคลิปชุดเดิมมีจุดตัด (keyframe) ทุก 4 วินาทีเท่านั้น
//   จะหั่นตรงวินาทีที่ 2 ต้องมีจุดตัดตรงนั้น จึงต้องเข้ารหัสวิดีโอใหม่
//   (เสียงคัดลอกได้เลย ไม่ต้องแปลง คุณภาพเสียงจึงไม่เสีย)
//
// ใช้ตัวเร่งความเร็วด้วยชิปของ Mac (h264_videotoolbox) เร็วกว่า CPU ล้วนหลายเท่า
//
// ⚠️ ปลอดภัย: เขียนลงโฟลเดอร์ใหม่ v2/ บน R2 ไม่แตะของเดิมเลย
//    เสร็จแล้วค่อยสลับ HOST ในโค้ดทีเดียว ถ้าไม่ดีก็สลับกลับได้ทันที
//
// วิธีใช้:
//   node scripts/reseg-2s.mjs            ทำทั้งหมด (รันซ้ำได้ ข้ามใบที่ทำแล้ว)
//   node scripts/reseg-2s.mjs --limit 3  ลองแค่ 3 ใบก่อน
//   node scripts/reseg-2s.mjs --only <hash>
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const HOST = "https://video.gucut.com";
const BUCKET = "r2:gucut-video";
const DONE_FILE = new URL("../.reseg-done.json", import.meta.url).pathname;

// ความคมชัดที่มี — bitrate ตั้งให้ "ตรงกับของเดิม" ที่วัดได้จริง
// (637 / 1269 / 2458 kbps) ตั้งสูงกว่านี้ = ไฟล์ใหญ่ขึ้น ลูกค้าเปลืองเน็ต
// และเสียจุดประสงค์ทั้งหมดของการหั่นให้สั้นลง
const LEVELS = [
  { dir: "v480", bitrate: "640k", maxrate: "800k" },
  { dir: "v720", bitrate: "1270k", maxrate: "1600k" },
  { dir: "v1080", bitrate: "2460k", maxrate: "3000k" },
];
const SEG = 2;                       // วินาทีต่อเซกเมนต์

const args = process.argv.slice(2);
const limit = Number(args[args.indexOf("--limit") + 1]) || 0;
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : "";

const loadDone = async () => {
  try { return new Set(JSON.parse(await readFile(DONE_FILE, "utf8"))); } catch { return new Set(); }
};
const saveDone = (s) => writeFile(DONE_FILE, JSON.stringify([...s], null, 0));

const fetchTo = async (url, path) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`โหลดไม่ได้ ${r.status} ${url}`);
  await writeFile(path, Buffer.from(await r.arrayBuffer()));
};

/** ดึงเซกเมนต์เดิมทั้งหมดของชั้นนั้นมาต่อกันเป็นไฟล์เดียว */
async function pullLevel(id, lv, dir) {
  const idx = await (await fetch(`${HOST}/v/${id}/${lv.dir}/index.m3u8`)).text();
  const segs = idx.split("\n").filter((l) => l.trim().endsWith(".ts"));
  if (!segs.length) throw new Error(`ไม่มีเซกเมนต์ใน ${lv.dir}`);
  const files = [];
  for (const s of segs) {
    const p = join(dir, s);
    await fetchTo(`${HOST}/v/${id}/${lv.dir}/${s}`, p);
    files.push(p);
  }
  const listPath = join(dir, `${lv.dir}.txt`);
  await writeFile(listPath, files.map((f) => `file '${f}'`).join("\n"));
  return listPath;
}

/** แปลงใหม่ให้เซกเมนต์ยาว 2 วินาที (บังคับใส่จุดตัดทุก 2 วินาที) */
async function encode(listPath, lv, outDir) {
  await mkdir(outDir, { recursive: true });
  const fps = 30;
  await run("ffmpeg", [
    "-v", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", listPath,
    // วิดีโอ: แปลงใหม่ด้วยชิป + บังคับจุดตัดทุก 2 วินาที (สำคัญที่สุด)
    "-c:v", "h264_videotoolbox",
    "-b:v", lv.bitrate, "-maxrate", lv.maxrate, "-bufsize", lv.maxrate,
    "-g", String(SEG * fps), "-keyint_min", String(SEG * fps),
    "-force_key_frames", `expr:gte(t,n_forced*${SEG})`,
    "-profile:v", "main", "-pix_fmt", "yuv420p",
    // เสียง: คัดลอกของเดิม ไม่แปลง คุณภาพไม่เสีย
    "-c:a", "copy",
    "-f", "hls",
    "-hls_time", String(SEG),
    "-hls_playlist_type", "vod",
    "-hls_flags", "independent_segments",
    "-hls_segment_filename", join(outDir, "seg%03d.ts"),
    join(outDir, "index.m3u8"),
  ]);
}

async function main() {
  const videos = JSON.parse(await readFile(new URL("../src/data/videos.json", import.meta.url), "utf8"));
  const list = Array.isArray(videos) ? videos : Object.values(videos)[0];
  const done = await loadDone();

  let todo = list.filter((v) => !done.has(v.v));
  if (only) todo = list.filter((v) => v.v === only);
  if (limit) todo = todo.slice(0, limit);

  console.log(`คลิปทั้งหมด ${list.length} ใบ · ทำแล้ว ${done.size} · รอบนี้จะทำ ${todo.length}`);
  if (!todo.length) return console.log("ไม่มีอะไรต้องทำ");

  const t0 = Date.now();
  for (const [i, v] of todo.entries()) {
    const id = v.v;
    const work = await mkdtemp(join(tmpdir(), "reseg-"));
    try {
      const outRoot = join(work, "out");
      // ⚠️ ไม่ใช่ทุกคลิปมีครบ 3 ความคมชัด — คลิปที่ต้นฉบับเล็กจะไม่มี 1080p
      //    ต้องอ่านจาก master.m3u8 ว่าใบนี้มีอะไรบ้าง ไม่ใช่สมมติว่ามีครบ
      //    (พลาดมาแล้ว: รอบแรกล้มไป 37% เพราะไปหา v1080 ที่ไม่มีอยู่จริง)
      const master = await (await fetch(`${HOST}/v/${id}/master.m3u8`)).text();
      const have = LEVELS.filter((lv) => master.includes(`${lv.dir}/index.m3u8`));
      if (!have.length) throw new Error("master.m3u8 ไม่มีความคมชัดใดเลย");
      for (const lv of have) {
        const src = join(work, lv.dir);
        await mkdir(src, { recursive: true });
        const listPath = await pullLevel(id, lv, src);
        await encode(listPath, lv, join(outRoot, lv.dir));
      }
      // master.m3u8 กับรูปปก คัดลอกของเดิมมาใช้ได้เลย
      await fetchTo(`${HOST}/v/${id}/master.m3u8`, join(outRoot, "master.m3u8"));
      await fetchTo(`${HOST}/v/${id}/poster.jpg`, join(outRoot, "poster.jpg")).catch(() => {});

      await run("rclone", ["copy", outRoot, `${BUCKET}/v2/${id}`, "--transfers", "8", "--checkers", "8"]);

      done.add(id);
      await saveDone(done);
      const per = (Date.now() - t0) / (i + 1) / 1000;
      const left = Math.round((todo.length - i - 1) * per / 60);
      console.log(`[${i + 1}/${todo.length}] ${id} ✓  (เหลืออีกราว ${left} นาที)`);
    } catch (e) {
      console.log(`[${i + 1}/${todo.length}] ${id} ✗ ${String(e.message).slice(0, 120)}`);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
  console.log(`เสร็จ · ใช้เวลา ${Math.round((Date.now() - t0) / 60000)} นาที`);
}

if (!existsSync("/usr/local/bin/rclone") && !existsSync("/opt/homebrew/bin/rclone")) {
  console.error("ไม่พบ rclone");
  process.exit(1);
}
main();
