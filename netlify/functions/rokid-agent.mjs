// แว่น Rokid AI Glasses — /api/rokid/sse
//
// "สมอง" ของ Agent แบบกำหนดเอง (自定义智能体 / Custom Agent) บนแพลตฟอร์มนักพัฒนาของ Rokid
// (Rizon · จีนเรียก 灵珠) — เจ้าของร้านใส่แว่น พูดถามเป็นไทย → แว่นถอดเสียงเป็นข้อความ
// → แพลตฟอร์ม Rokid ยิงมาที่นี่ → เราตอบกลับเป็น SSE ทีละคำ → ขึ้นจอแว่น + อ่านออกเสียง
//
//   GET  /api/rokid/sse            สุขภาพ (ไม่มีอะไรลับ) — ตั้งคีย์แล้วหรือยัง · AI พร้อมไหม
//   POST /api/rokid/sse            คำถามจากแว่น (Authorization: Bearer <ROKID_AGENT_KEY>)
//
// รูปแบบคำขอ/คำตอบ (โปรโตคอลของแพลตฟอร์ม Rokid — เอกสารทางการอ่านจากเครื่องนี้ไม่ได้
// ถอดจากสะพานเชื่อมของชุมชนที่ใช้งานจริงกับแว่น 2 โปรเจกต์ ตรงกันทั้งคู่)
//   ขอ:  { message_id, agent_id, message:[{role:"user"|"agent", type:"text"|"image",
//          text?, image_url?}], user_id?, metadata?:{context?:{location,weather,battery}} }
//   ตอบ: text/event-stream
//        event:message  data:{role:"agent",type:"answer",answer_stream:"…",message_id,agent_id,is_finish:false}
//        …ซ้ำทีละชิ้น…
//        event:message  data:{…,answer_stream:"",is_finish:true}
//        event:done     data:[DONE]
//   ⚠️ แพลตฟอร์มรอได้ราว 30–60 วิ และ Netlify ให้ฟังก์ชันวิ่งได้ ~26 วิ
//      จึงเริ่มสตรีมทันที · คำตอบต้องสั้น (จอแว่นเล็ก สีเดียว) · AI จำกัด 20 วิ
//
// ⚠️ คีย์ ROKID_AGENT_KEY คือด่านเดียวกันคนนอก — ทุกคำขอเผาเครดิต AI ของร้านจริง
//    ไม่ตั้งคีย์ = ปิดทั้งระบบ (503) · ผิดเกิน 5 ครั้ง/IP พัก 15 นาที · 60 คำขอ/IP/10 นาที
//    ตัวเลขออเดอร์/ยอดขายส่งให้เฉพาะคนที่ถือคีย์นี้ (คือแว่นของเจ้าของร้าน) — ห้ามเปิดสาธารณะ
// ⚠️ สมองคือ Claude ผ่าน Claude API ตรง (เจ้าของร้านสั่ง 8 ก.ย. 2569 "เชื่อมแว่น Rokid กับ Claude api")
//    ใช้ SDK ทางการ @anthropic-ai/sdk · คีย์ ROKID_CLAUDE_API_KEY จาก console.anthropic.com
//    ไม่มีคีย์นั้นค่อยถอยไป Netlify AI Gateway (คิดเป็นเครดิต Netlify) · ไม่มีทั้งคู่ = ตอบตายตัว
//    ⚠️ ห้ามหยิบ ANTHROPIC_API_KEY ที่ตั้งค้างไว้ที่ Netlify มาใช้ — บทเรียน read-id.mjs 25 ส.ค. 2569
//       คีย์นั้นยิง api.anthropic.com แล้วโดน invalid x-api-key จึงใช้คีย์เฉพาะของแว่นแทน
// ⚠️ ไม่มีคีย์ AI ก็ยังตอบได้ — ตอบแบบตายตัวจากผลค้นสินค้า+สต็อกสด (ไม่เสียเครดิต)
// ⚠️ รูปจากกล้องแว่นมาเป็น URL (image_url) ส่งต่อให้ AI ดูได้ — ใช้ถามว่า "อันนี้รุ่นอะไร"
//    ⚠️ ห้ามให้ AI พูดแทนว่าร้านอื่นขายของปลอม (กติกาเดียวกับไฟล์ที่ AI อ่านทุกไฟล์)
import Anthropic from "@anthropic-ai/sdk";
import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";
import { liveStock } from "../lib/zort-stock.mjs";
import { SITE_HOST } from "../lib/site.mjs";

const SHOP_NAME = process.env.SHOP_NAME || "GUCUT";           // ชื่อเดียวกับที่ Telegram/LINE ใช้
// รุ่น Claude — ค่าเริ่มต้น Opus 5 (รุ่นหลักปัจจุบัน) · ความเร็วคุมด้วย effort "low" ไม่ใช่ลดรุ่น
// ราคา $5/$25 ต่อล้านโทเค็น — คำถามหนึ่งครั้ง (~1,500 เข้า · ~100 ออก) ราว $0.01
const MODEL = process.env.ROKID_MODEL || "claude-opus-5";
const EFFORT = process.env.ROKID_EFFORT || "low";             // low = ตอบเร็ว เหมาะกับถามสั้น ๆ บนแว่น
const MAX_FAILS = 5;                    // คีย์ผิดเกินนี้ พัก
const LOCK_MS = 15 * 60 * 1000;
const MAX_REQ = 60;                     // คำขอต่อ IP ต่อหน้าต่าง
const WINDOW_MS = 10 * 60 * 1000;
const AI_TIMEOUT_MS = 20000;            // เผื่อเวลาให้ Netlify (~26 วิ) กับแพลตฟอร์ม Rokid
// จอแว่นเล็ก สีเดียว — ตั้งใจให้สั้น (ปกติ SDK แนะนำหลายหมื่น แต่ที่นี่ยาวกว่านี้อ่านไม่ทันและเกินเวลา)
const MAX_TOKENS = 400;
const INDEX_TTL_MS = 10 * 60 * 1000;    // จำดัชนีสินค้าไว้ในหน่วยความจำของฟังก์ชันที่ยังอุ่น
const TOP_N = 8;

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

const who = (req, context) =>
  context?.ip ||
  req.headers.get("x-nf-client-connection-ip") ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

// เทียบคีย์แบบใช้เวลาเท่ากันเสมอ (ท่าเดียวกับ admin-gate)
function same(a, b) {
  const x = Buffer.from(String(a), "utf8");
  const y = Buffer.from(String(b), "utf8");
  if (x.length !== y.length) { timingSafeEqual(x, x); return false; }
  return timingSafeEqual(x, y);
}

const store = () => {
  try { return getStore({ name: "gucut-rokid", consistency: "strong" }); }
  catch { return null; }   // Blobs ล่ม/รันนอก Netlify — ยังตรวจคีย์ตามปกติ แค่ไม่นับครั้ง
};

// ---------------------------------------------------------------------------
// คีย์ของแว่น — Authorization: Bearer <ROKID_AGENT_KEY>
// ---------------------------------------------------------------------------
async function checkKey(req, s, ip) {
  const real = process.env.ROKID_AGENT_KEY || "";
  if (!real) return { ok: false, deny: json({ error: "ยังไม่ได้ตั้ง ROKID_AGENT_KEY — ระบบแว่นปิดอยู่", setup: true }, 503) };

  if (s) {
    const rl = (await s.get(`fail/${ip}`, { type: "json" }).catch(() => null)) || { fails: 0, until: 0 };
    if (rl.until > Date.now()) {
      const min = Math.ceil((rl.until - Date.now()) / 60000);
      return { ok: false, deny: json({ error: `คีย์ผิดหลายครั้ง พัก ${min} นาที` }, 429) };
    }
  }

  const auth = req.headers.get("authorization") || "";
  const sent = auth.replace(/^Bearer\s+/i, "").trim() || req.headers.get("x-api-key") || "";
  if (sent && same(sent, real)) {
    if (s) await s.delete(`fail/${ip}`).catch(() => {});
    return { ok: true, deny: null };
  }

  if (s) {
    const rl = (await s.get(`fail/${ip}`, { type: "json" }).catch(() => null)) || { fails: 0, until: 0 };
    const fails = rl.fails + 1;
    await s.setJSON(`fail/${ip}`, {
      fails: fails >= MAX_FAILS ? 0 : fails,
      until: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0,
    }).catch(() => {});
  }
  return { ok: false, deny: json({ error: "Unauthorized" }, 401) };
}

// กันยิงรัว — เสียเครดิตจริงต่อคำขอ
async function tooMany(s, ip) {
  if (!s) return false;
  const now = Date.now();
  const rl = (await s.get(`rl/${ip}`, { type: "json" }).catch(() => null)) || { n: 0, start: now };
  if (now - rl.start > WINDOW_MS) { rl.n = 0; rl.start = now; }
  if (rl.n >= MAX_REQ) return true;
  rl.n += 1;
  await s.setJSON(`rl/${ip}`, rl).catch(() => {});
  return false;
}

// ---------------------------------------------------------------------------
// ดัชนีสินค้า — public/search-index.json (สร้างตอน build) + สต็อกสดจาก ZORT
// ---------------------------------------------------------------------------
let indexCache = { at: 0, items: null };

async function loadIndex(origin) {
  if (indexCache.items && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.items;
  const r = await fetch(`${origin}/search-index.json`, { signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  const items = Array.isArray(j?.items) ? j.items : [];
  if (items.length) indexCache = { at: Date.now(), items };
  return items;
}

// คำไทยที่คนพูดถึงอะไหล่บ่อย — ตัดจากประโยคด้วยการหาเป็นชิ้น (ไทยไม่มีช่องว่างระหว่างคำ)
const THAI_TERMS = [
  "โซ่", "บาร์", "แผ่นบังคับโซ่", "คาร์บู", "คาร์บูเรเตอร์", "สตาร์ท", "เชือกสตาร์ท", "ลูกสูบ", "แหวน",
  "หัวเทียน", "กรองอากาศ", "กรองน้ำมัน", "เฟือง", "สเตอร์", "คลัตช์", "ครัช", "ปั๊มน้ำมัน", "เลื่อย",
  "เลื่อยยนต์", "ตะไบ", "น้ำมัน", "ตัดหญ้า", "ใบมีด", "มู่เล่", "คอยล์", "ซีล", "ลูกปืน", "สปริง",
  "ท่อไอเสีย", "ถังน้ำมัน", "ฝาถัง", "ฝาครอบ", "มือจับ", "สวิตช์", "สายน้ำมัน", "หัวฉีด", "เกียร์",
  "แบตเตอรี่", "ไร้สาย", "ปั๊ม", "เครื่องพ่นยา", "เครื่องตัดแต่ง", "บ่า", "ก้าน", "โบลท์", "สกรู", "น็อต",
];
// ชื่อยี่ห้อที่แว่นถอดเสียงเป็นไทย → คำที่อยู่ในชื่อสินค้าจริง
const BRAND_MAP = [
  [/คิงคอง|คิงค่อง/g, "kingkong"], [/นิวเวฟ|นิววเวฟ/g, "newwave"], [/สติล|สติห์ล/g, "stihl"],
  [/ฮัสวาน่า|ฮัสควาน่า/g, "husqvarna"], [/มากิต้า|มากิตะ/g, "makita"], [/ฮอนด้า/g, "honda"],
];

function tokens(q) {
  let s = String(q || "").toLowerCase().normalize("NFC");
  for (const [re, en] of BRAND_MAP) s = s.replace(re, ` ${en} `);
  const out = new Map();                    // token → น้ำหนัก
  // เลขรุ่น/รหัส/คำอังกฤษ น้ำหนักสูง — ระบุตัวสินค้าได้ตรงกว่าคำไทยทั่วไป
  for (const m of s.match(/[a-z0-9][a-z0-9\/.\-]*/g) || []) {
    const t = m.replace(/[.\-\/]+$/, "");
    if (t.length >= 2 && !/^\d$/.test(t)) out.set(t, 2);
  }
  for (const w of s.split(/\s+/)) {
    if (/^[฀-๿]{2,}$/.test(w) && !out.has(w)) out.set(w, 1);
  }
  for (const term of THAI_TERMS) if (s.includes(term)) out.set(term, 1);
  return out;
}

function searchProducts(items, q) {
  const tk = tokens(q);
  if (!tk.size) return [];
  const scored = [];
  for (const it of items) {
    const hay = `${it.t || ""} ${it.k || ""} ${it.vk || ""}`.toLowerCase();
    let score = 0;
    for (const [t, w] of tk) if (hay.includes(t)) score += w;
    if (score > 0) scored.push([score, it]);
  }
  scored.sort((a, b) => b[0] - a[0] || (b[1].s || 0) - (a[1].s || 0));
  return scored.slice(0, TOP_N).map((x) => x[1]);
}

/** สต็อกสด — รวมทุกตัวเลือกของสินค้า · คืน { qty, live } */
function stockOf(it, map) {
  if (!map) return { qty: Number(it.s || 0), live: false };
  const skus = String(it.vk || it.k || "").split(/\s+/).filter(Boolean);
  let qty = 0, hit = false;
  for (const sku of skus) {
    const row = map[sku];
    if (row) { hit = true; qty += Number(row[0] || 0); }
  }
  return hit ? { qty, live: true } : { qty: Number(it.s || 0), live: false };
}

const baht = (n) => `฿${Number(n || 0).toLocaleString("th-TH")}`;

function describe(it, st) {
  const price = it.m && it.m > it.p ? `${baht(it.p)}–${baht(it.m)}` : baht(it.p);
  const stock = st.qty > 0 ? `มี ${st.qty.toLocaleString("th-TH")} ชิ้น` : "หมด";
  return `${it.t} · รหัส ${it.k} · ${price} · ${stock}${st.live ? "" : " (ตัวเลขตอน build ไม่สด)"}`;
}

// ---------------------------------------------------------------------------
// ออเดอร์เว็บวันนี้ — ให้เฉพาะคนถือคีย์ (แว่นของร้าน) · คิดวันแบบไทย (UTC+7)
// ---------------------------------------------------------------------------
const ORDER_RE = /ออเดอร์|ออร์เดอร์|ยอดขาย|ขายได้|คำสั่งซื้อ|ค้างจ่าย|ยังไม่จ่าย|รอจัดส่ง|ส่งของ|วันนี้|เมื่อวาน/;
const thaiDay = (ms) => new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10);

async function ordersSummary() {
  let s;
  try { s = getStore({ name: "gucut-orders", consistency: "strong" }); } catch { return null; }
  const { blobs } = await s.list({ prefix: "o/" });
  // คีย์ o/GC<เวลาฐาน36> เรียงตามเวลาโดยธรรมชาติ — เอา 200 ใบล่าสุดพอ
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, 200);
  const orders = (await Promise.all(keys.map((k) => s.get(k, { type: "json" }).catch(() => null))))
    .filter((o) => o && o.at);
  const today = thaiDay(Date.now());
  const yday = thaiDay(Date.now() - 86400 * 1000);
  const sum = (list) => list.reduce((a, o) => a + Number(o.total || 0), 0);
  const ok = (o) => o.status !== "cancelled" && o.status !== "returned" && (o.paid || o.payment !== "beam");
  const t = orders.filter((o) => thaiDay(o.at) === today && ok(o));
  const y = orders.filter((o) => thaiDay(o.at) === yday && ok(o));
  return {
    today: { count: t.length, total: sum(t) },
    yesterday: { count: y.length, total: sum(y) },
    newCount: orders.filter((o) => o.status === "new" && ok(o)).length,
    pendingPay: orders.filter((o) => o.payment === "beam" && !o.paid && o.status === "new").length,
    shipping: orders.filter((o) => o.status === "confirmed").length,
    recent: t.slice(0, 5).map((o) => `#${o.id} ${baht(o.total)} ${o.status}`),
  };
}

// ---------------------------------------------------------------------------
// อ่านคำขอจากแว่น — รับทั้งรูปแบบ Rizon (message[]) และแบบสั้น {text, image}
// ---------------------------------------------------------------------------
function readRequest(body) {
  const messageId = String(body?.message_id || body?.request_id || `m${Date.now()}`).slice(0, 80);
  const agentId = String(body?.agent_id || "gucut").slice(0, 80);
  const raw = Array.isArray(body?.message) ? body.message : [];
  const history = [];
  for (const m of raw.slice(-12)) {
    const role = m?.role === "agent" || m?.role === "assistant" ? "assistant" : "user";
    if (m?.type === "image" && typeof m.image_url === "string" && /^https?:\/\//.test(m.image_url)) {
      history.push({ role, kind: "image", url: m.image_url });
    } else {
      const text = String(m?.text ?? m?.content ?? "").trim();
      if (text) history.push({ role, kind: "text", text: text.slice(0, 2000) });
    }
  }
  // แบบสั้น (บางสะพานส่งมาเป็น text/image ตรง ๆ)
  if (!history.length) {
    const text = String(body?.text || "").trim();
    if (text) history.push({ role: "user", kind: "text", text: text.slice(0, 2000) });
    const img = body?.image?.data;
    if (typeof img === "string" && img.length > 100) {
      history.push({ role: "user", kind: "b64", data: img.replace(/^data:image\/\w+;base64,/, ""), media: body.image.mime_type || "image/jpeg" });
    }
  }
  const lastUser = [...history].reverse().find((h) => h.role === "user" && h.kind === "text");
  const ctx = body?.metadata?.context || {};
  return { messageId, agentId, history, question: lastUser?.text || "", ctx };
}

// ---------------------------------------------------------------------------
// ทางเชื่อม Claude — เลือกตามลำดับ
//   1. ROKID_CLAUDE_API_KEY → Claude API ตรง (api.anthropic.com) · เปิด server-side fallback ได้
//   2. NETLIFY_AI_GATEWAY_KEY/URL → ทางสำรอง คิดเป็นเครดิต Netlify · คู่คีย์/ที่อยู่ต้องมาเป็นคู่
//      (Gateway บางแบบต้องต่อ /anthropic — เจอ 404 ค่อยลอง ไม่เสียเครดิต · ดูบทเรียนใน read-id.mjs)
// ---------------------------------------------------------------------------
function claudeRoute() {
  const direct = process.env.ROKID_CLAUDE_API_KEY;
  if (direct) return { name: "claude-api", apiKey: direct, baseURL: undefined, beta: true };
  const gwKey = process.env.NETLIFY_AI_GATEWAY_KEY;
  const gwBase = process.env.NETLIFY_AI_GATEWAY_URL;
  if (gwKey && gwBase) return { name: "netlify-gateway", apiKey: gwKey, baseURL: gwBase.replace(/\/+$/, ""), beta: false };
  return null;
}

const makeClient = (route, baseURL) =>
  new Anthropic({ apiKey: route.apiKey, baseURL, timeout: AI_TIMEOUT_MS, maxRetries: 0 });

/**
 * ถาม Claude แบบสตรีม ส่งข้อความออกทาง emit ทีละชิ้น
 * คืน { got, stop } · โยน error ของ SDK ออกมาให้คนเรียกตัดสิน (ถอยไปคำตอบตายตัว)
 * ⚠️ maxRetries 0 — คนใส่แว่นยืนรออยู่ SDK ลองซ้ำเองแล้วเวลารวมทะลุเพดาน Netlify
 */
async function askClaude(route, system, messages, emit) {
  const params = { model: MODEL, max_tokens: MAX_TOKENS, system, messages, output_config: { effort: EFFORT } };
  const run = async (client) => {
    // ทางตรง: เปิด fallbacks "default" — ถ้าตัวกรองความปลอดภัยปฏิเสธ ฝั่ง Anthropic สลับรุ่นให้เองในคำขอเดียว
    const stream = route.beta
      ? client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : client.messages.stream(params);
    let got = 0;
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta" && ev.delta.text) {
        got += 1;
        emit(ev.delta.text);
      }
    }
    const final = await stream.finalMessage();
    return { got, stop: final.stop_reason, usage: final.usage };
  };
  try {
    return await run(makeClient(route, route.baseURL));
  } catch (e) {
    if (e instanceof Anthropic.NotFoundError && route.name === "netlify-gateway") {
      return await run(makeClient(route, `${route.baseURL}/anthropic`));
    }
    throw e;
  }
}

// บอกสาเหตุลง log แบบไม่มีความลับ — ไล่ปัญหาจาก log ฟังก์ชันได้โดยไม่ต้องเดา
function logAiError(route, e) {
  if (e instanceof Anthropic.AuthenticationError) console.log(`rokid ai: คีย์ของทาง ${route.name} ไม่ถูก`);
  else if (e instanceof Anthropic.RateLimitError) console.log("rokid ai: โดนจำกัดอัตราจาก Anthropic");
  else if (e instanceof Anthropic.APIConnectionTimeoutError) console.log(`rokid ai: เกิน ${AI_TIMEOUT_MS} ms`);
  else if (e instanceof Anthropic.APIError) console.log(`rokid ai: API ${e.status} ${String(e.message).slice(0, 160)}`);
  else console.log("rokid ai:", String(e?.message || e).slice(0, 160));
}

function systemPrompt({ products, stockLive, stockAt, orders, ctx }) {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const lines = [
    `คุณคือผู้ช่วยของร้าน ${SHOP_NAME} (${SITE_HOST}) ร้านขายเลื่อยยนต์และอะไหล่ กำลังตอบเจ้าของร้านผ่านแว่นตาอัจฉริยะ`,
    `จอแว่นเล็กมากและเป็นสีเดียว คำตอบต้องสั้นที่สุด: ภาษาไทย ไม่เกิน 2 ประโยค ไม่ใช้หัวข้อ ไม่ใช้ตาราง ไม่ใช้อีโมจิ`,
    `ตัวเลขต้องมาจากข้อมูลด้านล่างเท่านั้น ห้ามเดา ถ้าไม่มีข้อมูลให้บอกว่าไม่พบ และถามกลับสั้น ๆ ว่าหมายถึงรุ่นไหน`,
    `ห้ามพูดว่าร้านอื่นขายของปลอม · ห้ามเปิดเผยข้อมูลลูกค้า (ชื่อ เบอร์ ที่อยู่)`,
    `คนถามยืนรออยู่ตรงหน้าจอแว่น: เริ่มพิมพ์คำตอบทันที ไม่ต้องอธิบายวิธีคิด (Latency-sensitive; begin your visible answer immediately)`,
    `เวลาไทยตอนนี้ ${now.toISOString().slice(0, 16).replace("T", " ")}`,
  ];
  if (products.length) {
    lines.push("", stockLive
      ? `สินค้าที่ใกล้เคียงคำถาม (สต็อกสดจาก ZORT ${stockAt ? "เมื่อ " + new Date(stockAt + 7 * 3600 * 1000).toISOString().slice(11, 16) : ""}):`
      : "สินค้าที่ใกล้เคียงคำถาม (สต็อกเป็นตัวเลขตอน build ยังไม่ใช่ของสด):");
    products.forEach((p) => lines.push(`- ${p}`));
  } else {
    lines.push("", "ไม่พบสินค้าที่ตรงกับคำถามในดัชนี");
  }
  if (orders) {
    lines.push("", "ออเดอร์เว็บ (เฉพาะเจ้าของร้าน):",
      `- วันนี้ ${orders.today.count} ใบ รวม ${baht(orders.today.total)} · เมื่อวาน ${orders.yesterday.count} ใบ รวม ${baht(orders.yesterday.total)}`,
      `- ใบใหม่ยังไม่ยืนยัน ${orders.newCount} · รอลูกค้าจ่าย ${orders.pendingPay} · ยืนยันแล้วรอส่ง ${orders.shipping}`);
    if (orders.recent.length) lines.push(`- ล่าสุดวันนี้: ${orders.recent.join(" · ")}`);
  }
  const ctxBits = [ctx.location && `ที่อยู่ปัจจุบัน ${ctx.location}`, ctx.weather && `อากาศ ${ctx.weather}`, ctx.battery && `แบตแว่น ${ctx.battery}`].filter(Boolean);
  if (ctxBits.length) lines.push("", `ข้อมูลจากแว่น: ${ctxBits.join(" · ")}`);
  return lines.join("\n");
}

function toAnthropicMessages(history) {
  const msgs = [];
  for (const h of history) {
    const block = h.kind === "image"
      ? { type: "image", source: { type: "url", url: h.url } }
      : h.kind === "b64"
        ? { type: "image", source: { type: "base64", media_type: h.media, data: h.data } }
        : { type: "text", text: h.text };
    const last = msgs[msgs.length - 1];
    if (last && last.role === h.role) last.content.push(block);
    else msgs.push({ role: h.role, content: [block] });
  }
  // Anthropic ต้องเริ่มด้วย user และสลับบทบาท — ตัดหัวที่เป็น assistant ทิ้ง
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length) msgs.push({ role: "user", content: [{ type: "text", text: "สวัสดี" }] });
  // ปิดท้ายต้องเป็น user — ถ้าใบสุดท้ายเป็นรูปเปล่า ๆ เติมคำถามให้
  const tail = msgs[msgs.length - 1];
  if (tail.role === "user" && !tail.content.some((c) => c.type === "text")) {
    tail.content.push({ type: "text", text: "ในรูปนี้คือสินค้าอะไร ตรงกับรุ่นไหนของร้าน" });
  }
  return msgs;
}

// ---------------------------------------------------------------------------
// ตัวเขียน SSE ตามโปรโตคอลของแพลตฟอร์ม Rokid
// ---------------------------------------------------------------------------
const enc = new TextEncoder();
const sse = (event, data) => enc.encode(`event:${event}\ndata:${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);

function streamAnswer({ messageId, agentId }, produce) {
  const chunk = (text, finish = false) => sse("message", {
    role: "agent", type: "answer", answer_stream: text, message_id: messageId, agent_id: agentId, is_finish: finish,
  });
  const body = new ReadableStream({
    async start(controller) {
      let closed = false;
      const push = (b) => { if (!closed) controller.enqueue(b); };
      // หัวใจเต้นทุก 10 วิ ระหว่างรอ AI ชิ้นแรก — กันตัวกลางตัดสายเพราะเงียบ
      const beat = setInterval(() => push(enc.encode(": heartbeat\n\n")), 10000);
      try {
        await produce((text) => push(chunk(text)));
      } catch (e) {
        console.log("rokid stream error", e?.message);
        push(chunk("ขออภัย ระบบตอบไม่ทัน ลองถามใหม่อีกครั้ง"));
      } finally {
        clearInterval(beat);
        push(chunk("", true));
        push(sse("done", "[DONE]"));
        closed = true;
        controller.close();
      }
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

// คำตอบตายตัวตอนไม่มี AI — ยังใช้เช็คของได้ ไม่เสียเครดิต
function plainAnswer({ hits, stockLive, orders, question }) {
  const parts = [];
  if (orders && ORDER_RE.test(question)) {
    parts.push(`วันนี้ ${orders.today.count} ออเดอร์ รวม ${baht(orders.today.total)} · ใบใหม่ ${orders.newCount} · รอจ่าย ${orders.pendingPay}`);
  }
  if (hits.length) {
    const top = hits.slice(0, 3).map(({ it, st }) => `${it.t.slice(0, 40)} ${baht(it.p)} ${st.qty > 0 ? `มี ${st.qty}` : "หมด"}`);
    parts.push(top.join(" / ") + (stockLive ? "" : " (สต็อกไม่สด)"));
  } else if (!parts.length) {
    parts.push("ไม่พบสินค้าที่ตรงกับคำถาม ลองบอกชื่อรุ่นหรือรหัสสินค้า");
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
export default async function handler(req, context) {
  const s = store();
  const ip = who(req, context);

  if (req.method === "GET") {
    return json({
      ok: true,
      service: "rokid-agent",
      configured: !!process.env.ROKID_AGENT_KEY,
      ai: claudeRoute()?.name || null,      // "claude-api" · "netlify-gateway" · null = ตอบตายตัว
      model: MODEL,
      effort: EFFORT,
      hint: "ตั้ง URL นี้เป็น Custom Agent ที่แพลตฟอร์มนักพัฒนา Rokid แล้วใส่ ROKID_AGENT_KEY เป็น AK · ใส่ ROKID_CLAUDE_API_KEY ให้ Claude ตอบ",
    });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const gate = await checkKey(req, s, ip);
  if (!gate.ok) return gate.deny;
  if (await tooMany(s, ip)) return json({ error: "ถามถี่เกินไป พักสัก 10 นาที" }, 429);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const reqInfo = readRequest(body);
  if (!reqInfo.history.length) return json({ error: "Missing required fields: message" }, 400);

  const origin = new URL(req.url).origin;

  // เตรียมบริบทก่อนเปิดสตรีม — งานสั้น ๆ ทั้งคู่ (ดัชนีอยู่ในหน่วยความจำ · สต็อกอ่านจากแคช 30 นาที)
  let items = [];
  try { items = await loadIndex(origin); } catch (e) { console.log("rokid index fail", e?.message); }
  let stockMap = null, stockAt = 0;
  try {
    const st = await liveStock();
    if (st?.map && !st.stale) { stockMap = st.map; stockAt = st.at; }
  } catch { /* ZORT ล่ม — ใช้ตัวเลขตอน build แล้วบอกว่าไม่สด */ }
  const found = searchProducts(items, reqInfo.question);
  const hits = found.map((it) => ({ it, st: stockOf(it, stockMap) }));
  const stockLive = hits.length ? hits.every((h) => h.st.live) : !!stockMap;

  let orders = null;
  if (ORDER_RE.test(reqInfo.question)) {
    try { orders = await ordersSummary(); } catch (e) { console.log("rokid orders fail", e?.message); }
  }

  const route = claudeRoute();
  const plain = plainAnswer({ hits, stockLive, orders, question: reqInfo.question });

  return streamAnswer(reqInfo, async (emit) => {
    if (!route) { emit(plain); return; }
    const system = systemPrompt({
      products: hits.map((h) => describe(h.it, h.st)), stockLive, stockAt, orders, ctx: reqInfo.ctx,
    });
    let out;
    try {
      out = await askClaude(route, system, toAnthropicMessages(reqInfo.history), emit);
    } catch (e) {
      logAiError(route, e);
      emit(plain);                       // Claude ล่ม/คีย์เสีย/ช้าเกิน — ยังได้คำตอบจากผลค้น
      return;
    }
    // ปฏิเสธก่อนพิมพ์อะไรออกมา (ตัวกรองความปลอดภัย) หรือไม่มีข้อความเลย → ให้คำตอบตายตัวแทนจอว่าง
    if (!out.got) emit(out.stop === "refusal" ? `ตอบคำถามนี้ไม่ได้ · ${plain}` : plain);
  });
}

export const config = { path: "/api/rokid/sse" };
