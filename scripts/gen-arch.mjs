// อ่านสถาปัตยกรรมฝั่งหน้าร้านจาก "ซอร์สจริง" แล้วเขียนลง netlify/lib/arch-data.mjs
// รันตอน prebuild ⇒ หน้าผังในหลังร้านอัปเดตเองทุกครั้งที่ deploy
//
// ⚠️ **ห้ามพิมพ์ตัวเลขหรือรายชื่อลงหน้าเว็บด้วยมือเด็ดขาด**
//    ผังที่คนกรอกเองจะค่อย ๆ กลายเป็นของโกหกโดยไม่มีใครรู้ตัว — เพิ่มฟังก์ชันใหม่แล้วลืมแก้ผัง
//    หน้าจอก็ยังบอกเลขเดิมอย่างมั่นใจ ซึ่งแย่กว่าไม่มีผังเลย เพราะคนเอาไปตัดสินใจต่อ
//    (โรคเดียวกับ "แท็บบอก 44 กดแล้วได้ 0" — ระบบทำงานถูก แต่สื่อสารผิด)
//
// ⚠️ ไฟล์นี้ห้ามทำให้ build ตก — อ่านอะไรไม่ได้ให้ใส่ค่าว่างแล้วบอกในผังว่าอ่านไม่ได้
//    ผังไม่ใช่ข้อมูลกฎหมาย เว็บ deploy ไม่ได้เพราะวาดผังไม่ออก = ได้ไม่คุ้มเสีย
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (p) => {
  try {
    return readFileSync(join(root, p), "utf8");
  } catch {
    return "";
  }
};
const list = (p) => {
  try {
    return readdirSync(join(root, p));
  } catch {
    return [];
  }
};

/* ── ฟังก์ชันเซิร์ฟเวอร์ + งานตั้งเวลา ─────────────────────────── */
const fnFiles = list("netlify/functions").filter((f) => f.endsWith(".mjs"));
const scheduled = [];
for (const f of fnFiles) {
  const src = read(`netlify/functions/${f}`);
  const m = src.match(/schedule:\s*"([^"]+)"/);
  if (m) scheduled.push({ name: f.replace(/\.mjs$/, ""), cron: m[1] });
}

/* ── ถังเก็บข้อมูล Netlify Blobs ───────────────────────────────── */
const allServer = [
  ...fnFiles.map((f) => read(`netlify/functions/${f}`)),
  ...list("netlify/lib").map((f) => read(`netlify/lib/${f}`)),
].join("\n");
const blobs = [
  ...new Set([...allServer.matchAll(/getStore\(\s*(?:\{\s*name:\s*)?"([a-z0-9-]+)"/g)].map((m) => m[1])),
].sort();

/* ── ตารางในคลังเงา (Cloudflare D1) ────────────────────────────── */
// ⚠️ ต้องกวาดทั้งโฟลเดอร์ ไม่ใช่อ่านแค่ coredb.mjs — บางตารางถูกสร้างตอนรันจากไฟล์อื่น
//    (ตารางสำรองข้อมูลใน backup.mjs · ตาราง Shopee ใน shopee-orders.mjs)
//    อ่านที่เดียวแล้วผังจะบอกจำนวนตารางน้อยกว่าความจริงโดยไม่มีใครรู้
const d1Tables = [
  ...new Set([...allServer.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/g)].map((m) => m[1])),
].sort();

/* ── ของนอกบ้าน ────────────────────────────────────────────────
   จับจาก "ตัวแปรลับที่โค้ดเรียกใช้จริง" ไม่ใช่จากรายการที่เขียนเอง
   ⇒ ต่อของใหม่แล้วลืมมาแก้ผัง ผังก็ยังรู้เอง                         */
// ⚠️ **ต้องจับ env ให้ครบทั้งสามท่า ไม่งั้นผังจะบอกว่า "ยังไม่ได้ต่อ" ทั้งที่ต่ออยู่**
//    รอบแรกจับแค่ `process.env.X` แล้ว **ZORT หายทั้งเจ้า** เพราะโค้ดเขียน
//    `const { ZORT_STORENAME, ... } = process.env` — ผังจะขึ้นว่าไม่ได้ต่อ ZORT
//    ทั้งที่มันคือของที่ร้านหากินอยู่ทุกวัน (เจอตอนรันตัวสแกนครั้งแรก 3 ก.ย. 2569)
const envUsed = new Set();
for (const m of allServer.matchAll(/process\.env\.([A-Z0-9_]+)/g)) envUsed.add(m[1]);
for (const m of allServer.matchAll(/const\s*\{([^}]+)\}\s*=\s*process\.env/g)) {
  // รองรับทั้ง { A, B } และ { A: x, B: y }
  for (const part of m[1].split(",")) {
    const name = part.split(":")[0].trim();
    if (/^[A-Z0-9_]+$/.test(name)) envUsed.add(name);
  }
}
// ปุ่มเข้าสู่ระบบอ่าน env แบบไดนามิก (process.env[provider.envId]) — สแกนหาไม่เจอ
// ต้องไปอ่านรายชื่อจากตัว provider เอง
const oauth = read("netlify/lib/oauth.mjs");
for (const m of oauth.matchAll(/env(?:Id|Secret):\s*"([A-Z0-9_]+)"/g)) envUsed.add(m[1]);
const providers = [...oauth.matchAll(/^\s*id:\s*"([a-z]+)",/gm)].map((m) => m[1]);

// ป้ายชื่อของแต่ละกลุ่มตัวแปร — เขียนเองส่วนนี้เพราะชื่อตัวแปรไม่ได้บอกว่ามันคือใคร
const LABELS = [
  { id: "zort", name: "ZORT V4", what: "สต็อก · ราคา · ออเดอร์ · ทะเบียนสินค้า", envs: ["ZORT_STORENAME", "ZORT_APIKEY", "ZORT_APISECRET"] },
  { id: "d1", name: "Cloudflare D1", what: "คลังเงา — ฐานข้อมูลของเราเอง", envs: ["CLOUDFLARE_D1_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CORE_D1_ID"] },
  { id: "r2", name: "Cloudflare R2", what: "คลิป HLS + รูปสินค้า (เบราว์เซอร์โหลดตรง)", envs: ["R2_ACCESS_KEY_ID", "R2_BUCKET", "R2_ENDPOINT"] },
  { id: "shopee", name: "Shopee Open API", what: "ออเดอร์ · สต็อก · รีวิว", envs: ["SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY"] },
  { id: "tiktok", name: "TikTok Shop API", what: "ยังไม่ได้รับอนุมัติ", envs: ["TIKTOK_APP_KEY", "TIKTOK_APP_SECRET"] },
  { id: "beam", name: "Beam", what: "รับชำระเงิน + webhook แจ้งเงินเข้า", envs: ["BEAM_API_KEY", "BEAM_MERCHANT_ID"] },
  { id: "line", name: "LINE @gucut1", what: "แจ้งเตือนสถานะออเดอร์ถึงลูกค้า", envs: ["LINE_MESSAGING_TOKEN"] },
  { id: "telegram", name: "Telegram", what: "แจ้งเตือนเข้ากลุ่มร้าน + ปุ่มอนุมัติ", envs: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] },
  { id: "ai", name: "Netlify AI Gateway", what: "อ่านบัตรประชาชนในหน้าขอทะเบียน", envs: ["NETLIFY_AI_GATEWAY_KEY", "NETLIFY_AI_GATEWAY_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"], prefix: "^(NETLIFY_AI_GATEWAY|ANTHROPIC)_" },
  { id: "peak", name: "PEAK (บัญชี/ภาษี)", what: "สะพานส่งยอดขายเข้าโปรแกรมบัญชี", envs: ["PEAK_CONNECT_ID", "PEAK_CONNECT_KEY", "PEAK_USER_TOKEN"] },
  { id: "reviews", name: "รับรีวิวจากมาร์เก็ตเพลส", what: "งานตั้งเวลายิงรีวิวใหม่เข้าเว็บ", envs: ["REVIEWS_INGEST_SECRET"] },
  { id: "netlify", name: "Netlify API", what: "ดูเครดิตที่เหลือของร้าน", envs: ["NLF_CREDITS_TOKEN", "SITE_ID"] },
  { id: "zort2", name: "ZORT บัญชีที่สอง", what: "ร้านสาขา (ceojet) — ใช้เทียบยอดคลังเงา", envs: ["ZORT_STORENAME_2", "ZORT_APIKEY_2", "ZORT_APISECRET_2"], prefix: "ZORT_.*_2" },
  { id: "login", name: "เข้าสู่ระบบด้วยโซเชียล", what: "LINE · Facebook · Google (ลูกค้ากดปุ่มเดียว)", envs: ["LINE_CHANNEL_ID", "FACEBOOK_APP_ID", "GOOGLE_CLIENT_ID"], prefix: "(LINE_CHANNEL|FACEBOOK_APP|GOOGLE_CLIENT|FACEBOOK_API)" },
  { id: "forward", name: "ส่งต่อออเดอร์ (ไม่บังคับ)", what: "ยิงออเดอร์ไปที่อื่นอีกทาง เช่น Make.com", envs: ["ORDER_FORWARD_URL"] },
];

const integrations = LABELS.map((l) => ({
  ...l,
  // โค้ดเรียกตัวแปรพวกนี้อยู่จริงไหม — ถ้าไม่ แปลว่าถอดออกไปแล้วแต่ผังยังจำได้
  inCode: l.envs.some((e) => envUsed.has(e)),
}));

// ตัวแปรที่ยังไม่ได้จัดหมวด — ไม่ทำให้ build ตก แต่ต้องโผล่บนหน้าจอ
// ⚠️ ถ้าซ่อนไว้ ผังจะดูครบทั้งที่ตกหล่น ซึ่งคือของที่เราพยายามเลี่ยงทั้งวัน
// ตัวตั้งค่าย่อยของเจ้าที่รู้จักแล้ว (ZORT_SALES_CHANNEL · BEAM_ENV · PEAK_LIVE …) ไม่นับว่าตกหล่น
const known = new Set(LABELS.flatMap((l) => l.envs));
const familiar = LABELS.map((l) => l.prefix || `^(${l.envs.map((e) => e.split("_")[0]).join("|")})_`);
const IGNORE = /^(NEXT_PUBLIC_|NODE_|NETLIFY$|CONTEXT$|DEPLOY_|URL$|SITE_NAME$|CHAT_ADMIN_KEY$|COUPON_CODES$|CHAT_NOTIFY_URL$|POS_BRANCHES$|READ_ID_MODEL$)/; // ตัวตั้งค่าของเรา ไม่ใช่ของนอกบ้าน
const unlabelled = [...envUsed]
  .filter((e) => !known.has(e) && !IGNORE.test(e) && !familiar.some((p) => new RegExp(p).test(e)))
  .sort();

/* ── หน้าเว็บฝั่งลูกค้า ─────────────────────────────────────────── */
const pages = (() => {
  const out = [];
  const walk = (dir, base = "") => {
    for (const e of list(dir)) {
      if (e.startsWith("_") || e.endsWith(".tsx") || e.endsWith(".ts") || e.endsWith(".css")) continue;
      const rel = `${base}/${e}`;
      if (read(`${dir}/${e}/page.tsx`)) out.push(rel);
      walk(`${dir}/${e}`, rel);
    }
  };
  walk("src/app");
  return out.sort();
})();

const data = {
  generatedAt: new Date().toISOString(),
  site: "gucut.com",
  project: "gucut-storefront",
  repo: "gucut-web",
  functions: { count: fnFiles.length, scheduled },
  edge: list("netlify/edge-functions").filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, "")),
  blobs,
  d1: { tables: d1Tables },
  integrations,
  unlabelled,
  loginProviders: providers,
  pages: { count: pages.length },
};

writeFileSync(
  join(root, "netlify/lib/arch-data.mjs"),
  `// สร้างอัตโนมัติโดย scripts/gen-arch.mjs ตอน build — **ห้ามแก้ด้วยมือ**\n` +
    `// แก้ที่นี่จะถูกเขียนทับรอบหน้า และทำให้ผังในหลังร้านโกหกจนกว่าจะมีคนสังเกต\n` +
    `export const ARCH = ${JSON.stringify(data, null, 2)};\n`
);

console.log(
  `gen-arch: ฟังก์ชัน ${data.functions.count} · ตั้งเวลา ${scheduled.length} · ` +
    `edge ${data.edge.length} · ถัง ${blobs.length} · ตาราง D1 ${d1Tables.length} · ` +
    `ของนอกบ้าน ${integrations.filter((i) => i.inCode).length}/${integrations.length}` +
    (unlabelled.length ? ` · ⚠️ ตัวแปรยังไม่จัดหมวด ${unlabelled.length}` : "")
);
