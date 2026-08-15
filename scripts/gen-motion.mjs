// วัดลักษณะภาพของคลิปแต่ละใบ → src/data/clip-stats.json  { "<hash>": [เคลื่อนไหว, ความสว่าง] }
//
// ทำไมต้องมี: ในกองคลิป 459 ใบ มีทั้งคลิปคนเลื่อยไม้จริง กับคลิปที่เป็นแค่
// ภาพนิ่งอะไหล่เลื่อนไปมา (สไลด์โชว์) — อย่างหลังไม่ควรขึ้นฟีดหน้าวิดีโอ
// เพราะคนเปิดมาเจอภาพนิ่งก็เลื่อนผ่านทันที
//
// วัดยังไง: ดึงคลิปจาก R2 มา 12 วินาทีแรก ย่อเหลือ 64x64 เอา 2 เฟรม/วินาที
// แล้วให้ ffmpeg หา "ผลต่างระหว่างเฟรม" เฉลี่ย
//   ภาพนิ่ง/สไลด์โชว์ ≈ 8-12   ·   คนเลื่อยไม้จริง ≈ 20-40
//
// แต่ "เคลื่อนไหวน้อย" อย่างเดียวตัดสินไม่ได้ — คลิปคนเลื่อยไม้ที่ตั้งกล้องนิ่ง ๆ
// ก็ได้คะแนนต่ำเหมือนกัน จึงวัด "ความสว่างเฉลี่ย" มาประกอบด้วย
// รูปอะไหล่ในสตูดิโอพื้นขาว ≈ 175+   ·   คลิปถ่ายหน้างานกลางป่า ≈ 80-120
//
//   node scripts/gen-motion.mjs            ทำทุกใบ (ใช้เวลาราว 6-10 นาที)
//   node scripts/gen-motion.mjs --limit 20 ลองไม่กี่ใบก่อน
//
// ต้องมี ffmpeg (brew install ffmpeg) และคลิปต้องอยู่บน R2 แล้ว
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);

const HOST = "https://pub-002ee0abd2f747c5b9e5573c987ca79d.r2.dev";
const OUT = new URL("../src/data/clip-stats.json", import.meta.url);
const STILL = new URL("../src/data/still-clips.json", import.meta.url);

// เกณฑ์ตัดคลิป "ภาพนิ่งสตูดิโอ" ออกจากฟีด — ดูจากความสว่างเฉลี่ยอย่างเดียว
// เพราะรูปอะไหล่ถ่ายบนพื้นขาวสว่างกว่าคลิปหน้างานชัดเจน และไม่มีคลิปจริงคาบเกี่ยว
// (ไล่ดูรูปปกทีละใบในช่วง 150-175 แล้ว: ใบจริงหยุดที่ 163 · ตั้งแต่ 164 ขึ้นไปเป็น
//  รูปอะไหล่กับการ์ตูนอธิบายล้วน ๆ)  ปรับเลขนี้แล้วรัน --stats-only เพื่อออกรายการใหม่
const STILL_BRIGHT = 164;
const OLD_MOTION = new URL("../src/data/motion.json", import.meta.url);
const SECONDS = 12;      // ดูแค่ช่วงต้นคลิปพอ
const JOBS = Math.max(2, Math.floor(cpus().length / 2));

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};

// ความสว่างเฉลี่ยของภาพจริง (ไม่ใช่ผลต่างระหว่างเฟรม)
async function brightness(hash) {
  const { stderr, stdout } = await run(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error",
      "-t", "8",
      "-i", `${HOST}/v/${hash}/v480/index.m3u8`,
      "-vf", "fps=1,scale=64:64,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
      "-f", "null", "-",
    ],
    { maxBuffer: 8 << 20 },
  );
  const nums = [...`${stdout}${stderr}`.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

async function motion(hash) {
  const { stderr, stdout } = await run(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error",
      "-t", String(SECONDS),
      "-i", `${HOST}/v/${hash}/v480/index.m3u8`,
      "-vf",
      "fps=2,scale=64:64,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
      "-f", "null", "-",
    ],
    { maxBuffer: 8 << 20 },
  );
  const nums = [...`${stdout}${stderr}`.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  if (!nums.length) return null;
  // ตัดเฟรมแรกทิ้ง (เทียบกับจอดำ ค่าจะพุ่งผิดปกติ)
  const use = nums.slice(1);
  return Math.round(((use.reduce((a, b) => a + b, 0) / use.length) + Number.EPSILON) * 100) / 100;
}

const statsOnly = process.argv.includes("--stats-only");

const videos = JSON.parse(await readFile(new URL("../src/data/videos.json", import.meta.url), "utf8"));
const list = (Array.isArray(videos) ? videos : videos.items).map((v) => v.v);
const limit = arg("--limit", list.length);
const todo = list.slice(0, limit);

if (!statsOnly) console.log(`วัดลักษณะภาพ ${todo.length} คลิป · พร้อมกัน ${JOBS} ใบ`);

// ค่าความเคลื่อนไหวที่เคยวัดไว้แล้ว ไม่ต้องวัดซ้ำให้เสียเวลา
let prev = {};
try { prev = JSON.parse(await readFile(OLD_MOTION, "utf8")); } catch { /* ยังไม่เคยวัด */ }

let out = {};
let done = 0, failed = 0;
const queue = [...todo];

if (statsOnly) {
  // ใช้ค่าที่วัดไว้แล้ว — แค่ออกรายการคลิปที่จะซ่อนใหม่ตามเกณฑ์ปัจจุบัน
  out = JSON.parse(await readFile(OUT, "utf8"));
} else await Promise.all(
  Array.from({ length: JOBS }, async () => {
    while (queue.length) {
      const hash = queue.shift();
      try {
        const m = prev[hash] ?? (await motion(hash));
        const b = await brightness(hash);
        if (m !== null && b !== null) out[hash] = [m, b];
        else failed++;
      } catch {
        failed++;   // คลิปเสีย/โหลดไม่ได้ ข้ามไป ไม่ต้องล้มทั้งงาน
      }
      done++;
      if (done % 20 === 0) process.stdout.write(`\r  ${done}/${todo.length}`);
    }
  }),
);

if (!statsOnly) await writeFile(OUT, `${JSON.stringify(out, null, 0)}\n`);

// รายการคลิปที่ไม่เอาขึ้นฟีด — ไฟล์นี้แหละที่เว็บใช้จริง (เล็กกว่า clip-stats มาก)
const still = Object.entries(out).filter(([, [, b]]) => b >= STILL_BRIGHT).map(([id]) => id);
await writeFile(STILL, `${JSON.stringify(still, null, 0)}\n`);
console.log(`ไม่เอาขึ้นฟีด ${still.length} ใบ (สว่าง ≥${STILL_BRIGHT}) · เหลือในฟีด ${Object.keys(out).length - still.length} ใบ`);

const vals = Object.values(out).map((x) => x[0]).sort((a, b) => a - b);
const bright = Object.values(out).map((x) => x[1]).sort((a, b) => a - b);
const at = (p) => vals[Math.floor(vals.length * p)] ?? 0;
console.log(`\nเสร็จ — วัดได้ ${vals.length} ใบ · พลาด ${failed} ใบ`);
console.log(`ต่ำสุด ${vals[0]} · 10% ${at(0.1)} · กลาง ${at(0.5)} · 90% ${at(0.9)} · สูงสุด ${vals.at(-1)}`);
console.log(`ความสว่าง: ต่ำสุด ${bright[0]} · กลาง ${bright[Math.floor(bright.length / 2)]} · สูงสุด ${bright.at(-1)}`);
const studio = Object.values(out).filter(([m, b]) => m < 15 && b >= 150).length;
console.log(`เข้าข่าย "ภาพนิ่งสตูดิโอ" (เคลื่อนไหว <15 และสว่าง ≥150): ${studio} ใบ`);
