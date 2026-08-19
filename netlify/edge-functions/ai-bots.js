// จดว่าบอตของ AI / เครื่องค้นหา มาอ่านหน้าไหนบ้าง
//
// ต้องเป็น edge function เพราะเว็บนี้เป็นไฟล์นิ่ง (static export) — คำขอของบอต
// ไม่เคยวิ่งผ่านโค้ดฝั่งเราเลย และบอตไม่รัน JavaScript ตัวนับคนเข้าเว็บจึงมองไม่เห็น
// นี่คือข้อมูลชุดเดียวกับที่แอป Vizby AI บน Shopify คิดเงินรายเดือนเพื่อทำให้
//
// ⚠️ ตัวนี้ทำงานกับ "ทุกคำขอหน้าเว็บ" ห้ามทำอะไรหนักเด็ดขาด
//    คนทั่วไป: เทียบ user-agent ครั้งเดียวแล้วปล่อยผ่านทันที
//    ไม่โหลดโมดูล ไม่แตะที่เก็บข้อมูล ไม่หน่วงหน้าเว็บ
//
// ⚠️ ห้ามให้ไฟล์นี้ throw ออกไปเด็ดขาด — edge function ที่พังทำให้ทั้งเว็บขึ้น 500
//    จึงเรียกโมดูลแบบ dynamic import "ข้างใน" try เสมอ
//    ถ้าวันหนึ่ง @netlify/blobs ใช้ใน edge ไม่ได้ ผลคือแค่ "ไม่มีข้อมูลบอต"
//    ไม่ใช่ "เว็บล่ม" — ถ้า import ไว้ข้างบนไฟล์ ความผิดพลาดจะเกิดก่อนถึง try แล้วเว็บตาย
//
// ปิดตัวนี้ยังไง: ลบไฟล์นี้ทิ้งแล้ว deploy
//                (ตั้งค่าอยู่ที่ config ท้ายไฟล์ ไม่ได้อยู่ใน netlify.toml)

// ตะแกรงหยาบ ๆ ให้คนทั่วไปผ่านฉลุย — ต้องกว้างกว่ารายชื่อจริงใน lib/aibots.mjs เสมอ
// (ตัวจริงค่อยไปแยกว่าเป็นบอตตัวไหนอีกที)
// ⚠️ ชื่อที่ไม่มีคำว่า bot อยู่ในตัว ต้องเขียนเพิ่มเองทุกตัว
//    Google-Extended · anthropic-ai · meta-externalagent · Bytespider ฯลฯ
//    เคยลืม Google-Extended แล้วมันหลุดตะแกรงไปทั้งตัว (จับไม่ได้เลย)
const MAYBE_BOT = /bot|crawl|spider|GPT|Claude|anthropic|Perplexity|Google|cohere|externalagent|facebookexternalhit|line-poker/i;

// ---------------------------------------------------------------------------
// จำไว้ในหน่วยความจำของเครื่องที่รันอยู่ + รวบเขียนทีเดียว
//
// วัดของจริงบน gucut.com 18 ส.ค. 2569 แยกทีละขั้นด้วย user-agent สามแบบ
//   คนทั่วไป (ไม่เข้า edge เลย)      218 ms
//   ผ่านตะแกรงแต่ไม่เขียนข้อมูล       218 ms  ← โหลดโมดูลไม่มีค่าใช้จ่ายเลย
//   เขียนข้อมูลจริง                 778 ms  ← ตัวเขียนกินไป 560 ms เต็ม ๆ
// (ที่เก็บข้อมูลอยู่ us-east-1 เขียนทีต้องข้ามมหาสมุทร และ waitUntil ก็รอให้เสร็จก่อนตอบ)
//
// สรุป: ตัวปัญหาคือ "จำนวนครั้งที่ต้องเขียน" ไม่ใช่ "รอหรือไม่รอ" จึงลดจำนวนครั้งสองชั้น
//   1. จำว่าเขียนไปแล้ว — บอตวนอ่านหน้าเดิมซ้ำ (เกิดบ่อยมาก) ไม่เสียเวลาเลย
//   2. รวบไว้ครบ BATCH ค่อยเขียนทีเดียว — เฉลี่ยแล้วเสียเวลาแค่ 1 ใน BATCH คำขอ
//
// ⚠️ ยอมแลก: เครื่องที่รันอยู่ถูกปิดตอนยังรวบไม่ครบ รายการที่ค้างจะหาย
//    รับได้เพราะข้อมูลนี้ใช้ดูแนวโน้ม ไม่ใช่ตัวเลขบัญชี — และบอตกลับมาอ่านใหม่เรื่อย ๆ
//    สิ่งที่รับไม่ได้คือถ่วง Googlebot เพราะ Google ลดจำนวนหน้าที่ไล่เก็บเมื่อเว็บตอบช้า
// ---------------------------------------------------------------------------
const BATCH = 5;
const MAX_REMEMBER = 5000;      // กันหน่วยความจำบวมถ้าบอตไล่เก็บทั้งเว็บ

const written = new Set();
let pending = [];

export default async function handler(request, context) {
  try {
    const ua = request.headers.get("user-agent") || "";
    if (!MAYBE_BOT.test(ua)) return;      // คนทั่วไป — จบตรงนี้

    const { identify, seen } = await import("../lib/aibots.mjs");
    const bot = identify(ua);
    if (!bot) return;                      // บอตที่ไม่รู้จัก ไม่ต้องจด

    const path = new URL(request.url).pathname;
    const key = `${bot.name}|${path}`;
    if (written.has(key)) return;          // เคยจดแล้ว — ไม่ต้องเสียเวลาอีก
    if (written.size >= MAX_REMEMBER) written.clear();
    written.add(key);

    pending.push([bot.name, path]);
    if (pending.length < BATCH) return;    // ยังไม่ถึงคิวเขียน — ตอบทันที

    const batch = pending;
    pending = [];
    const job = Promise.all(batch.map(([b, p]) => seen(b, p).catch(() => {})));
    if (typeof context?.waitUntil === "function") context.waitUntil(job);
  } catch {
    // จดไม่ได้ก็ไม่เป็นไร ห้ามให้กระทบการเสิร์ฟหน้าเว็บ
  }
  // คืน undefined เสมอ = ให้ Netlify เสิร์ฟของเดิมต่อไปตามปกติ
}

export const config = {
  path: "/*",
  // ไม่ต้องดักไฟล์ที่บอตไม่ได้เอาไปทำอะไร — ลดจำนวนครั้งที่ทำงานลงมาก
  excludedPath: [
    "/_next/*", "/img/*", "/rv/*", "/rv-img/*", "/rv-video/*", "/art/*", "/model/*", "/api/*",
    "/*.png", "/*.jpg", "/*.jpeg", "/*.webp", "/*.avif", "/*.svg", "/*.ico",
    "/*.css", "/*.js", "/*.bin", "/*.m3u8", "/*.mp4",
  ],
};
