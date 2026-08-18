// ลูกค้ามาจากช่องทางไหน — แปลง "เว็บที่ส่งมา + พารามิเตอร์ในลิงก์" ให้เป็นชื่อช่องทาง
//
// ทำไมไม่ใช้ GA4 อย่างเดียว: GA4 มองไม่เห็นคนที่ใช้ตัวบล็อกโฆษณา หรือ Safari/iOS
// ที่ตัดคุกกี้ ซึ่งคือลูกค้าส่วนใหญ่ของร้าน ตัวนี้นับที่เซิร์ฟเวอร์ บล็อกไม่ได้
//
// ⚠️ หน้าเว็บส่งมาแค่ "ชื่อโดเมนของเว็บที่ส่งมา" ไม่ได้ส่งลิงก์เต็ม
//    เพราะลิงก์เต็มของเว็บอื่นอาจมีข้อมูลส่วนตัวของลูกค้าติดมาโดยไม่ตั้งใจ
//    (เช่นคำค้นในเว็บนั้น หรือรหัสอ้างอิงของผู้ใช้) เราไม่ต้องการและไม่ควรเก็บ

// slug ต้องเป็น ASCII เพราะใช้เป็นส่วนหนึ่งของคีย์ที่เก็บข้อมูล
// kind ใช้จัดกลุ่มให้ดูง่ายในหลังร้าน
export const CHANNELS = {
  direct:      { label: "เข้าตรง",            kind: "direct", note: "พิมพ์เอง · บุ๊กมาร์ก · กดจากแอปแชท" },
  google:      { label: "Google ค้นหา",       kind: "search" },
  "google-ads":{ label: "Google โฆษณา",       kind: "ads"    },
  bing:        { label: "Bing",               kind: "search" },
  search:      { label: "เครื่องค้นหาอื่น",     kind: "search" },
  facebook:    { label: "Facebook",           kind: "social" },
  "facebook-ads":{ label: "Facebook โฆษณา",   kind: "ads"    },
  instagram:   { label: "Instagram",          kind: "social" },
  line:        { label: "LINE",               kind: "social" },
  tiktok:      { label: "TikTok",             kind: "social" },
  "tiktok-ads":{ label: "TikTok โฆษณา",       kind: "ads"    },
  youtube:     { label: "YouTube",            kind: "social" },
  x:           { label: "X (Twitter)",        kind: "social" },
  shopee:      { label: "Shopee",             kind: "market" },
  lazada:      { label: "Lazada",             kind: "market" },
  // ---- ผู้ช่วย AI — ตัวชี้วัดว่างาน GEO/AEO ได้ผลจริงไหม ----
  chatgpt:     { label: "ChatGPT",            kind: "ai" },
  perplexity:  { label: "Perplexity",         kind: "ai" },
  gemini:      { label: "Gemini",             kind: "ai" },
  claude:      { label: "Claude",             kind: "ai" },
  copilot:     { label: "Microsoft Copilot",  kind: "ai" },
  email:       { label: "อีเมล",               kind: "other" },
};

/** ป้ายชื่อภาษาไทยของช่องทาง — เว็บอื่นที่ไม่รู้จักจะขึ้นชื่อโดเมนแทน */
export function channelLabel(slug) {
  if (CHANNELS[slug]) return CHANNELS[slug].label;
  if (slug.startsWith("web~")) return slug.slice(4).replace(/~/g, ".");
  return slug;
}

export function channelKind(slug) {
  if (CHANNELS[slug]) return CHANNELS[slug].kind;
  return "other";
}

// เว็บที่ส่งมา → ช่องทาง (เทียบจากท้ายชื่อโดเมน จะได้ครอบคลุมทุกโดเมนย่อยและทุกประเทศ)
const BY_HOST = [
  // ⚠️ โดเมนย่อยของ google ที่ไม่ใช่ "ค้นหา" ต้องอยู่ก่อนกฎ google กว้าง ๆ เสมอ
  //    ไม่งั้น gemini.google.com กับ mail.google.com จะถูกนับเป็น Google ค้นหาหมด
  [/(^|\.)gemini\.google\.com$/,        "gemini"],
  [/(^|\.)mail\.google\.com$/,          "email"],
  [/(^|\.)google\./,                    "google"],
  [/(^|\.)bing\.com$/,                  "bing"],
  [/(^|\.)(yahoo|duckduckgo|yandex|baidu|ecosia|brave)\./, "search"],
  [/(^|\.)(facebook\.com|fb\.me|fb\.com|messenger\.com)$/, "facebook"],
  [/(^|\.)instagram\.com$/,             "instagram"],
  [/(^|\.)line\.me$/,                   "line"],
  [/(^|\.)(tiktok\.com|tiktokv\.com)$/, "tiktok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/,   "youtube"],
  [/(^|\.)(twitter\.com|x\.com|t\.co)$/, "x"],
  [/(^|\.)shopee\./,                    "shopee"],
  [/(^|\.)lazada\./,                    "lazada"],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, "chatgpt"],
  [/(^|\.)perplexity\.ai$/,             "perplexity"],
  [/(^|\.)claude\.ai$/,                 "claude"],
  [/(^|\.)copilot\.microsoft\.com$/,    "copilot"],
  [/(^|\.)(outlook\.|mail\.yahoo\.)/,      "email"],
];

// ชื่อที่ร้านอาจพิมพ์เองใน utm_source
const BY_UTM = {
  google: "google", facebook: "facebook", fb: "facebook", meta: "facebook",
  ig: "instagram", instagram: "instagram", line: "line", tiktok: "tiktok",
  youtube: "youtube", yt: "youtube", shopee: "shopee", lazada: "lazada",
  email: "email", newsletter: "email", bing: "bing",
};

const PAID = /^(cpc|ppc|paid|paidsearch|paid_social|cpm|display|ads?)$/i;

const slugHost = (h) =>
  String(h || "").toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9.-]/g, "").slice(0, 50);

/**
 * ตัดสินว่ามาจากช่องทางไหน
 * @param src { h: ชื่อโดเมนของเว็บที่ส่งมา, q: {utm_source, utm_medium, gclid, fbclid, ...} }
 * @param selfHost โดเมนของเราเอง — กันนับลิงก์ภายในเว็บตัวเอง
 */
export function classify(src, selfHost = "") {
  const q = (src && typeof src.q === "object" && src.q) || {};
  const host = slugHost(src?.h);

  // 1) รหัสติดตามที่ระบบโฆษณาแปะมาให้ — ชัดเจนที่สุด เชื่อก่อนอย่างอื่น
  if (q.gclid || q.gbraid || q.wbraid) return "google-ads";
  if (q.msclkid) return "bing";
  if (q.ttclid) return "tiktok-ads";

  // 2) utm ที่ร้านตั้งเองตอนทำแคมเปญ
  const us = String(q.utm_source || "").toLowerCase().trim();
  if (us) {
    const base = BY_UTM[us] || (us.replace(/[^a-z0-9-]/g, "").slice(0, 30) || "other");
    const paid = PAID.test(String(q.utm_medium || ""));
    if (paid && (base === "facebook" || base === "instagram")) return "facebook-ads";
    if (paid && base === "google") return "google-ads";
    if (paid && base === "tiktok") return "tiktok-ads";
    return CHANNELS[base] ? base : `web~${base}`;
  }

  // 3) fbclid มาโดยไม่มี utm = คนกดลิงก์จากโพสต์ปกติ ไม่ใช่โฆษณา
  if (q.fbclid) return "facebook";

  // 4) เว็บที่ส่งมา
  if (!host) return "direct";                      // ไม่มีต้นทาง = พิมพ์เอง/บุ๊กมาร์ก/แอปแชท
  if (selfHost && (host === selfHost || host.endsWith(`.${selfHost}`))) return "direct";
  for (const [re, slug] of BY_HOST) if (re.test(host)) return slug;

  return `web~${host.replace(/\./g, "~")}`;        // เว็บอื่น เก็บชื่อไว้ดูว่ามาจากไหน
}
