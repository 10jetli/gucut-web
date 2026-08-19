// บอตของ AI และเครื่องค้นหา มาเก็บข้อมูลเว็บเราบ้างไหม — เก็บเอง ไม่พึ่งบริการใคร
//
// นี่คือของที่แอป Vizby AI บน Shopify คิดเงินรายเดือนเพื่อทำให้ ("AI crawler analytics")
// คำถามที่ตอบได้: ChatGPT / Gemini / Claude / Perplexity เคยมาอ่านเว็บเราหรือยัง
// อ่านไปกี่หน้า อ่านหน้าไหน และ Googlebot กลับมาเก็บอีกครั้งเมื่อไหร่หลังปลด noindex
//
// ⚠️ วิธีเก็บใช้กติกาเดียวกับ live.mjs — "ห้ามอ่านมาแก้แล้วเขียนกลับ"
//    บอตยิงพร้อมกันหลายคำขอ ถ้าอ่านมาบวกแล้วเขียนกลับจะทับกันจนยอดหาย
//    จึงใช้ "หนึ่งหน้าที่ถูกเก็บ = หนึ่งคีย์" แล้วนับจำนวนคีย์เอา
//      p/<วันที่>/<ชื่อบอต>/<หน้า>
//    บอตเดิมกลับมาอ่านหน้าเดิมในวันเดียวกัน = เขียนทับคีย์เดิม นับเป็น 1 เหมือนเดิม
//    ตัวเลขจึงเป็น "จำนวนหน้าที่บอตนั้นเก็บไปในวันนั้น" ซึ่งเป็นเลขที่เอาไปใช้ได้จริง
//    (ถ้านับเป็น "ครั้ง" บอตที่วนอ่านหน้าเดิมซ้ำ ๆ จะทำให้ตัวเลขดูดีเกินจริง)
import { getStore } from "@netlify/blobs";

const store = () => getStore({ name: "gucut-live", consistency: "eventual" });

const KEEP_DAYS = 60;

export const dayOf = (t = Date.now()) =>
  new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 10);   // เวลาไทย

// ---------------------------------------------------------------------------
// รายชื่อบอต — เรียงจากเจาะจงไปกว้าง ตัวแรกที่ตรงเป็นตัวที่ใช้
//
// ⚠️ ต้องเช็ค Google-Extended / GoogleOther ก่อน Googlebot เสมอ
//    เพราะชื่อมันมีคำว่า "Google" เหมือนกัน ถ้าสลับลำดับจะถูกจับเป็น Googlebot หมด
// ---------------------------------------------------------------------------
const BOTS = [
  // ---- ผู้ช่วย AI ----
  ["GPTBot",            /GPTBot/i,                    "ai", "OpenAI เก็บข้อมูลไปสอนโมเดล"],
  ["OAI-SearchBot",     /OAI-SearchBot/i,             "ai", "OpenAI เก็บไว้ให้ ChatGPT ค้นหา"],
  ["ChatGPT-User",      /ChatGPT-User/i,              "ai", "ผู้ใช้ ChatGPT สั่งให้เปิดหน้านี้"],
  ["ClaudeBot",         /ClaudeBot|anthropic-ai/i,    "ai", "Anthropic (Claude) เก็บข้อมูล"],
  ["Claude-User",       /Claude-User|Claude-SearchBot/i, "ai", "ผู้ใช้ Claude สั่งให้เปิดหน้านี้"],
  ["PerplexityBot",     /PerplexityBot/i,             "ai", "Perplexity เก็บข้อมูล"],
  ["Perplexity-User",   /Perplexity-User/i,           "ai", "ผู้ใช้ Perplexity สั่งให้เปิดหน้านี้"],
  ["Google-Extended",   /Google-Extended/i,           "ai", "Google เก็บไว้ใช้กับ Gemini"],
  ["GoogleOther",       /GoogleOther/i,               "ai", "Google เก็บไว้ใช้งานอื่นนอกจากค้นหา"],
  ["Applebot-Extended", /Applebot-Extended/i,         "ai", "Apple เก็บไว้ใช้กับ Apple Intelligence"],
  ["meta-externalagent",/meta-externalagent|FacebookBot/i, "ai", "Meta AI เก็บข้อมูล"],
  ["Bytespider",        /Bytespider/i,                "ai", "ByteDance (TikTok) เก็บข้อมูล"],
  ["Amazonbot",         /Amazonbot/i,                 "ai", "Amazon (Alexa) เก็บข้อมูล"],
  ["CCBot",             /CCBot/i,                     "ai", "Common Crawl — คลังข้อมูลที่ AI หลายเจ้าเอาไปใช้"],
  ["cohere-ai",         /cohere-ai|cohere-training/i, "ai", "Cohere เก็บข้อมูล"],
  ["DuckAssistBot",     /DuckAssistBot/i,             "ai", "DuckDuckGo AI เก็บข้อมูล"],
  ["YouBot",            /YouBot/i,                    "ai", "You.com เก็บข้อมูล"],
  ["Diffbot",           /Diffbot/i,                   "ai", "Diffbot เก็บข้อมูลไปขายต่อ"],
  ["ImagesiftBot",      /ImagesiftBot/i,              "ai", "เก็บรูปไปสอนโมเดล"],
  // ---- เครื่องค้นหาปกติ ----
  ["Googlebot",         /Googlebot/i,                 "search", "Google จัดอันดับ"],
  ["Bingbot",           /bingbot|BingPreview/i,       "search", "Bing จัดอันดับ"],
  ["DuckDuckBot",       /DuckDuckBot/i,               "search", "DuckDuckGo จัดอันดับ"],
  ["Applebot",          /Applebot/i,                  "search", "Apple / Siri จัดอันดับ"],
  ["YandexBot",         /YandexBot/i,                 "search", "Yandex จัดอันดับ"],
  ["Baiduspider",       /Baiduspider/i,               "search", "Baidu จัดอันดับ"],
  // ---- โซเชียลดึงรูปตอนแชร์ลิงก์ ----
  // ⚠️ ห้ามจับด้วย /Line\/\d/ เด็ดขาด — นั่นคือ user-agent ของ "เบราว์เซอร์ในแอป LINE"
  //    ซึ่งคือลูกค้าจริงที่กดลิงก์จากแชท ไม่ใช่บอต (ลูกค้าร้านนี้มาทางนี้เยอะมาก)
  //    ตัวไล่เก็บรูปตอนแชร์ลิงก์ของ LINE ใช้ชื่อ line-poker / LineBot ต่างหาก
  //    เคยจับผิดมาแล้ว 19 ส.ค. 2569 — ทำให้ลูกค้า LINE ถูกนับเป็นบอตและหายจากตัวเลขคนเข้าเว็บ
  ["LINE",              /LineBot|line-poker/i,         "social", "LINE ดึงรูปตอนแชร์ลิงก์"],
  ["Twitterbot",        /Twitterbot/i,                "social", "X / Twitter ดึงรูปตอนแชร์"],
  ["facebookexternalhit", /facebookexternalhit/i,     "social", "Facebook ดึงรูปตอนแชร์"],
];

/** ชื่อบอตกับประเภท ถ้าไม่ใช่บอตที่รู้จักคืน null */
export function identify(ua) {
  if (!ua) return null;
  for (const [name, re, kind, note] of BOTS) {
    if (re.test(ua)) return { name, kind, note };
  }
  return null;
}

/** คำอธิบายของบอตแต่ละตัว — ให้หน้าหลังร้านเอาไปโชว์ */
export const BOT_NOTES = Object.fromEntries(BOTS.map(([n, , kind, note]) => [n, { kind, note }]));

// เก็บหน้าไว้ในคีย์เลย จะได้สรุปด้วยการ "นับคีย์" อย่างเดียว ไม่ต้องอ่านเนื้อ (เร็วและถูกกว่ามาก)
// ต้องเข้ารหัสก่อนเพราะ handle สินค้าเป็นภาษาไทย และมี / คั่นซึ่งชนกับตัวแบ่งคีย์
const encPath = (p) => encodeURIComponent(String(p || "/")).replace(/%/g, "~").slice(0, 150);
export const decPath = (k) => {
  try { return decodeURIComponent(k.replace(/~/g, "%")); } catch { return k; }
};

/** จดว่าบอตตัวนี้มาอ่านหน้านี้ — เรียกจาก edge function */
export async function seen(botName, path) {
  const bot = String(botName).replace(/[^\w-]/g, "").slice(0, 40);
  if (!bot) return;
  await store().setJSON(`p/${dayOf()}/${bot}/${encPath(path)}`, 1);
}

/**
 * สรุปให้หน้าหลังร้าน — นับคีย์อย่างเดียว ไม่อ่านเนื้อ
 * คืน { days: {วันที่: {บอต: จำนวนหน้า}}, bots: {บอต:{pages,days,last}}, pages: [...] }
 */
export async function summary() {
  const s = store();
  const { blobs } = await s.list({ prefix: "p/" });

  const days = {};
  const bots = {};
  const pageHits = {};
  const old = [];
  const cutoff = dayOf(Date.now() - KEEP_DAYS * 86400000);

  for (const b of blobs) {
    // p/<วันที่>/<บอต>/<หน้า> — หน้าอาจมี / ในตัวไม่ได้เพราะเข้ารหัสแล้ว จึงตัด 4 ส่วนพอ
    const [, day, bot, ...rest] = b.key.split("/");
    if (!day || !bot || !rest.length) continue;
    if (day < cutoff) { old.push(b.key); continue; }

    (days[day] ||= {});
    days[day][bot] = (days[day][bot] || 0) + 1;

    const e = (bots[bot] ||= { pages: 0, days: new Set(), last: "" });
    e.pages++;
    e.days.add(day);
    if (day > e.last) e.last = day;

    const p = decPath(rest.join("/"));
    pageHits[p] = (pageHits[p] || 0) + 1;
  }

  // เก็บกวาดของเก่าตอนเปิดหน้าหลังร้าน — ไม่ต้องตั้งงานตามเวลาเพิ่ม
  if (old.length) await Promise.allSettled(old.slice(0, 500).map((k) => s.delete(k)));

  return {
    days,
    bots: Object.fromEntries(
      Object.entries(bots).map(([k, v]) => [k, { pages: v.pages, days: v.days.size, last: v.last }]),
    ),
    pages: Object.entries(pageHits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([path, n]) => ({ path, n })),
    notes: BOT_NOTES,
  };
}
