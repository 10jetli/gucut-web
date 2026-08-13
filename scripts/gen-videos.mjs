// สร้าง src/data/videos.json — คลิปทั้งหมดของร้าน
//
// รันครั้งเดียวตอนย้ายข้อมูลออกจาก Shopify ไม่ได้รันตอน build
//   node scripts/gen-videos.mjs <files.jsonl> <products.jsonl>
//
// ต้องใช้ผลจาก bulk operation ของ Shopify Admin API สองชุด เพราะคลิปอยู่สองที่:
//
//   1) files.jsonl — คลังไฟล์ทั้งร้าน (คลิปส่วนใหญ่อยู่ตรงนี้ แต่ไม่รู้ว่าเป็นของสินค้าไหน)
//      { files { edges { node { __typename createdAt fileStatus alt
//          ... on Video { id duration originalSource { url }
//                         sources { url format mimeType width height }
//                         preview { image { url } } } } } } }
//
//   2) products.jsonl — คลิปที่ติดอยู่กับสินค้า (ได้ชื่อสินค้ากับ handle มาด้วย)
//      { products { edges { node { id handle title status
//          media { edges { node { mediaContentType
//            ... on Video { id duration originalSource { url }
//                           sources { url format mimeType width height }
//                           preview { image { url } } } } } } } } } }
//
// รันด้วย bulkOperationRunQuery ทีละชุด รอจน currentBulkOperation.status = COMPLETED
// แล้วโหลดไฟล์จาก .url (ทำได้ทีละชุด Shopify ให้รัน bulk พร้อมกันไม่ได้)
//
// ⚠️ ไฟล์คลิปยังอยู่บน Shopify CDN — ถ้าย้ายที่เก็บ แก้ที่ videoSrc/videoPoster
// ใน src/lib/videos.ts จุดเดียว ไม่ต้องรันสคริปต์นี้ใหม่

import { readFileSync, writeFileSync } from "node:fs";

const [filesPath, productsPath] = process.argv.slice(2);
if (!filesPath || !productsPath) {
  console.error("ใช้: node scripts/gen-videos.mjs <files.jsonl> <products.jsonl>");
  process.exit(1);
}

const read = (p) => readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l));

// คลิปสั้นกว่านี้ไม่ใช่คลิปจริง — เป็นไฟล์ 3 วินาทีที่แอปวิดีโอในร้าน Shopify สร้างทิ้งไว้
const MIN_MS = 5000;

// คลิปในร้านมาจากหลายแอป ดูได้จากชื่อไฟล์ (alt) ที่แอปเขียนไว้
// เก็บไว้ด้วยเพื่อให้เลือกได้ทีหลังว่าจะเอาของแอปไหนขึ้นเว็บบ้าง
function appOf(alt) {
  const a = String(alt ?? "").toLowerCase();
  if (a.includes("vizup")) return "vizup";
  if (a.includes("shopgracias")) return "gracias";
  if (a.includes("reelup")) return "reelup";
  return undefined;          // ไม่มี alt = อัปกับตัวสินค้าโดยตรง ไม่ได้ผ่านแอป
}

// URL ของ Shopify มีแพตเทิร์นตายตัว เก็บแค่ส่วนที่ต่างกันจริง
// เต็ม ๆ: https://cdn.shopify.com/videos/c/vp/<hash>/<hash>.<suffix>.mp4
const MP4 = /^https:\/\/cdn\.shopify\.com\/videos\/c\/vp\/([0-9a-f]{32})\/\1\.(.+)\.mp4$/;
const POSTER_PREFIX = "https://cdn.shopify.com/s/files/1/0905/1081/9620/files/preview_images/";
const POSTER = /^([0-9a-f]{32})\.thumbnail\.0+\.jpg\?v=(\d+)$/;

// ---------- อ่านคลิปที่ติดกับสินค้า (มีชื่อ + handle) ----------
const products = new Map();
const attached = new Map();          // video id → { handle, title }
for (const l of read(productsPath)) {
  if (l.id?.includes("/Product/")) products.set(l.id, l);
}
for (const l of read(productsPath)) {
  if (l.mediaContentType !== "VIDEO") continue;
  const p = products.get(l.__parentId);
  if (p?.status === "ACTIVE") attached.set(l.id, { h: p.handle, t: p.title, media: l });
}

// ---------- รวมคลิปจากทั้งสองที่ ----------
const clips = new Map();             // video id → node
for (const l of read(filesPath)) {
  if (l.__typename === "Video" && l.fileStatus === "READY") clips.set(l.id, l);
}
for (const [id, a] of attached) if (!clips.has(id)) clips.set(id, a.media);

// เลือกไฟล์ mp4 ที่ความกว้างใกล้ค่าที่ขอที่สุด (ไม่เอา m3u8 เพราะมีแค่บางคลิป)
const pick = (sources, want) => {
  const mp4 = (sources ?? []).filter((s) => s.format === "mp4" && MP4.test(s.url));
  if (!mp4.length) return null;
  return mp4.reduce((best, s) => (Math.abs(s.width - want) < Math.abs(best.width - want) ? s : best));
};

const out = [];
const skipped = { tooShort: 0, noMp4: 0 };

for (const [id, c] of clips) {
  const dur = c.duration ?? 0;
  if (dur < MIN_MS) { skipped.tooShort++; continue; }

  // 480p พอสำหรับฟีดบนมือถือ — คลิปเล่นเองตอนเลื่อน ถ้าใช้ 720p กินเน็ตลูกค้า 3 เท่า
  const sd = pick(c.sources, 480);
  const hd = pick(c.sources, 720);
  if (!sd) { skipped.noMp4++; continue; }

  const [, hash, suffix] = sd.url.match(MP4);
  const hdSuffix = hd && hd.url !== sd.url ? hd.url.match(MP4)[2] : undefined;

  let pv;
  const purl = c.preview?.image?.url;
  if (purl?.startsWith(POSTER_PREFIX)) {
    const m = purl.slice(POSTER_PREFIX.length).match(POSTER);
    if (m && m[1] === hash) pv = Number(m[2]);   // ปกใช้ hash เดียวกับคลิป เก็บแค่เลขเวอร์ชัน
  }

  const link = attached.get(id);
  out.push({
    ms: dur,                       // ความยาวเต็ม ๆ ใช้ตอนตัดไฟล์ซ้ำ แล้วลบทิ้ง
    v: hash,                       // ตัวไฟล์คลิป
    s: suffix,                     // ส่วนท้ายไฟล์ 480p
    hd: hdSuffix,                  // ส่วนท้ายไฟล์ 720p (มีบางคลิป)
    pv,                            // เลขเวอร์ชันรูปปก
    dur: Math.round(dur / 1000),
    vw: sd.width,
    vh: sd.height,
    h: link?.h,                    // handle สินค้า (มีเฉพาะคลิปที่ติดกับสินค้า)
    t: link?.t,                    // ชื่อสินค้า
    a: appOf(c.alt),               // แอปที่อัปคลิปนี้ขึ้นร้าน
  });
}

// ---------- จัดลำดับ ----------
// ไม่ตัดคลิปไหนทิ้งเลย เจ้าของร้านสั่งว่าเอามาทั้งหมด
//
// แต่แอปวิดีโอในร้าน (reelUp / vizup / shopgracias) อัปคลิปเดิมซ้ำหลายรอบตลอดปี
// ทุกครั้งที่อัปใหม่ Shopify ให้ไฟล์ใหม่คนละ hash เทียบว่าเป็นคลิปเดียวกันตรง ๆ ไม่ได้
// เดาจาก "ความยาวเท่ากันเป๊ะระดับมิลลิวินาที + ขนาดภาพเท่ากัน" ได้อย่างเดียว
//
// จึงไม่ตัด แต่จัดลำดับแทน — หยิบทีละใบวนไปทุกกลุ่ม ใบที่หน้าตาเหมือนกัน
// จะไม่มาอยู่ติดกัน ฟีดช่วงแรกได้คลิปที่ต่างกันหมด ใบที่ซ้ำไปต่อท้าย
const groups = new Map();
for (const c of out) {
  const key = `${c.ms}|${c.vw}x${c.vh}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(c);
  delete c.ms;
}
// ลำดับความสำคัญ:
//   0 คลิปแนวตั้ง = ถ่ายด้วยมือถือหน้างาน คลิปคนตัดไม้จริงอยู่กลุ่มนี้ (Vizup ขึ้นก่อน)
//   1 คลิปที่ผูกกับสินค้า = คลิปโชว์สินค้าในสตูดิโอ ทรงจัตุรัสหมด แต่กดซื้อจากคลิปได้
//   2 ที่เหลือ
// เรียงตามชั้นก่อน แล้วค่อยวนหยิบกันไม่ให้ใบซ้ำอยู่ติดกัน "ภายในชั้นเดียวกัน"
const upright = (c) => c.vw / c.vh < 0.85;
const rank = (c) => (upright(c) ? 0 : c.h ? 1 : 2);
const tiers = [[], [], []];
// ในชั้นแนวตั้ง เอา Vizup ขึ้นก่อน (เป็นแอปที่ร้านใช้อยู่ คลิปใหม่สุด)
const within = (a, b) => rank(a) - rank(b) || (a.a === "vizup" ? 0 : 1) - (b.a === "vizup" ? 0 : 1);
for (const g of groups.values()) {
  g.sort(within);
  tiers[rank(g[0])].push(g);
}
for (const t of tiers) t.sort((a, b) => within(a[0], b[0]));

const kept = [];
for (const tier of tiers) {
  for (let round = 0; ; round++) {
    const before = kept.length;
    for (const g of tier) if (g[round]) kept.push(g[round]);
    if (kept.length === before) break;
  }
}
const dupes = [...groups.values()].reduce((s, g) => s + g.length - 1, 0);

writeFileSync("src/data/videos.json", JSON.stringify(kept) + "\n");
console.log(`เขียน src/data/videos.json — ${kept.length} คลิป`);
console.log(`  ผูกกับสินค้า ${kept.filter((c) => c.h).length} คลิป (${new Set(kept.filter((c) => c.h).map((c) => c.h)).size} สินค้า)`);
console.log(`  รวมความยาว ${Math.round(kept.reduce((s, c) => s + c.dur, 0) / 60)} นาที`);
const byApp = {};
for (const c of kept) byApp[c.a ?? "อัปกับสินค้าโดยตรง"] = (byApp[c.a ?? "อัปกับสินค้าโดยตรง"] ?? 0) + 1;
console.log("  แยกตามแอปที่อัป:", byApp);
console.log("  ข้าม:", skipped);
console.log(`  น่าจะเป็นคลิปเดิมที่แอปอัปซ้ำ ${dupes} ใบ — ไม่ได้ตัดทิ้ง แค่ดันไปไว้ท้ายฟีด`);
