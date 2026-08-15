// หัวใจ / คอมเมนต์ ของคลิปวิดีโอ — /api/social
// เก็บที่ Netlify Blobs (ของ Netlify เอง ไม่ต้องต่อบริการอื่น ไม่มีค่าใช้จ่าย)
//
//   counts       ก้อนเดียวทั้งหมด { "<hash คลิป>": [ถูกใจ, คอมเมนต์] }
//                ฟีดขอทีเดียวได้ครบ 459 ใบ เอาไปจัดอันดับว่าใบไหนคนชอบ
//                (ถ้าแยกเก็บทีละใบ ฟีดต้องยิง 459 ครั้ง — ช้าและเปลืองเครดิต)
//   cmt/<hash>   คอมเมนต์ของคลิปนั้น เก็บล่าสุด 200 ข้อความ
//
// ฝั่งลูกค้า
//   GET  /api/social                       ยอดถูกใจ/คอมเมนต์ทุกคลิป
//   GET  /api/social?id=xxx                คอมเมนต์ของคลิปนั้น
//   POST /api/social {action:"like"|"unlike"|"comment", id, text, name}
// ฝั่งร้าน (ต้องมีรหัสหลังร้าน ผ่าน admin-gate เหมือน API หลังร้านตัวอื่น)
//   DELETE /api/social?id=xxx&cid=yyy      ลบคอมเมนต์ที่ไม่เหมาะสม
//
// ใครกดหัวใจไปแล้วบ้าง "จำไว้ที่เครื่องลูกค้า" (localStorage) ไม่ได้ผูกกับบัญชี
// ตั้งใจให้กดได้เลยโดยไม่ต้องล็อกอิน — แลกกับที่ล้างเบราว์เซอร์แล้วกดซ้ำได้
// ตัวเลขจึงเป็น "ความนิยมโดยประมาณ" พอสำหรับจัดอันดับฟีด ไม่ใช่ตัวเลขทางบัญชี
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";

const MAX_TEXT = 300;
const MAX_NAME = 40;
const MAX_COMMENTS = 200;

// กันสแปม — นับแยกตาม IP
const LIKE_MAX = 120;            // กดหัวใจ/ยกเลิก ได้กี่ครั้ง
const COMMENT_MAX = 5;           // คอมเมนต์ได้กี่ครั้ง
const WINDOW_MS = 10 * 60 * 1000;

const json = (o, s = 200, headers = {}) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", ...headers },
  });

const clean = (v, n) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")   // ตัดอักขระควบคุมทิ้ง
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);

const store = () => getStore({ name: "gucut-social", consistency: "strong" });

const who = (req, context) =>
  context?.ip || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "ไม่รู้";

// เกินโควตาไหม — เก็บเวลาที่ยิงไว้ใน blob เดียวกัน
async function overLimit(s, ip, kind, max) {
  const key = `rl/${kind}/${ip}`;
  const now = Date.now();
  const hits = ((await s.get(key, { type: "json" }).catch(() => null)) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= max) return true;
  hits.push(now);
  await s.setJSON(key, hits).catch(() => {});
  return false;
}

const readCounts = async (s) => (await s.get("counts", { type: "json" }).catch(() => null)) || {};

// แจ้งร้านเวลามีคอมเมนต์ใหม่ — ใช้กลุ่ม Telegram เดิม ไม่ต้องตั้งอะไรเพิ่ม
async function tell(text) {
  const { TELEGRAM_BOT_TOKEN: tok, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!tok || !chat) return;
  await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

export default async function handler(req, context) {
  let s;
  try { s = store(); } catch { return json({ error: "store unavailable" }, 503); }
  const url = new URL(req.url);

  // ---------- อ่าน ----------
  if (req.method === "GET") {
    const id = clean(url.searchParams.get("id"), 64);
    if (id) {
      const list = (await s.get(`cmt/${id}`, { type: "json" }).catch(() => null)) || [];
      return json({ comments: list }, 200, { "cache-control": "public, max-age=0, s-maxage=15" });
    }
    // ยอดรวมทุกคลิป — แคชที่ edge 60 วิ ฟีดของลูกค้าคนถัดไปได้ทันทีไม่ต้องรอ
    return json({ counts: await readCounts(s) }, 200, {
      "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
    });
  }

  // ---------- ลบคอมเมนต์ (ฝั่งร้าน) ----------
  if (req.method === "DELETE") {
    const gate = await adminGate(req, context);
    if (gate) return gate;
    const id = clean(url.searchParams.get("id"), 64);
    const cid = clean(url.searchParams.get("cid"), 64);
    if (!id || !cid) return json({ error: "bad request" }, 400);
    const list = (await s.get(`cmt/${id}`, { type: "json" }).catch(() => null)) || [];
    const next = list.filter((c) => c.i !== cid);
    await s.setJSON(`cmt/${id}`, next);
    const counts = await readCounts(s);
    if (counts[id]) { counts[id][1] = next.length; await s.setJSON("counts", counts); }
    return json({ ok: true, comments: next });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const action = clean(body.action, 20);
  const id = clean(body.id, 64);
  if (!id) return json({ error: "ไม่รู้ว่าคลิปไหน" }, 400);
  const ip = who(req, context);

  // ---------- กดหัวใจ ----------
  if (action === "like" || action === "unlike") {
    if (await overLimit(s, ip, "like", LIKE_MAX)) return json({ error: "กดถี่เกินไป พักสักครู่" }, 429);
    const counts = await readCounts(s);
    const cur = counts[id] || [0, 0];
    cur[0] = Math.max(0, cur[0] + (action === "like" ? 1 : -1));
    counts[id] = cur;
    await s.setJSON("counts", counts);
    return json({ ok: true, likes: cur[0] });
  }

  // ---------- คอมเมนต์ ----------
  if (action === "comment") {
    const text = clean(body.text, MAX_TEXT);
    const name = clean(body.name, MAX_NAME) || "ลูกค้า";
    if (!text) return json({ error: "ยังไม่ได้พิมพ์ข้อความ" }, 400);
    // กันสแปมลิงก์ — ร้านไม่ได้มีคนนั่งเฝ้าลบทั้งวัน
    if (/https?:\/\/|www\.|\.com|\.net|line\.me|@line/i.test(text)) {
      return json({ error: "ใส่ลิงก์ในคอมเมนต์ไม่ได้ ถ้าอยากคุยกับร้านทักแชทได้เลย" }, 400);
    }
    if (await overLimit(s, ip, "cmt", COMMENT_MAX)) {
      return json({ error: "คอมเมนต์ถี่เกินไป พักสัก 10 นาทีแล้วลองใหม่" }, 429);
    }

    const list = (await s.get(`cmt/${id}`, { type: "json" }).catch(() => null)) || [];
    const c = { i: Math.random().toString(36).slice(2, 10), n: name, t: text, at: Date.now() };
    const next = [...list, c].slice(-MAX_COMMENTS);
    await s.setJSON(`cmt/${id}`, next);

    const counts = await readCounts(s);
    counts[id] = [counts[id]?.[0] ?? 0, next.length];
    await s.setJSON("counts", counts);

    await tell(`💬 คอมเมนต์ใหม่ในคลิป\n${name}: ${text}\nคลิป ${id}`);
    return json({ ok: true, comment: c, comments: next });
  }

  return json({ error: "ไม่รู้จักคำสั่งนี้" }, 400);
}

export const config = { path: "/api/social" };
