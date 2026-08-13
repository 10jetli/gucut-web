// ระบบแชทในเว็บ — /api/chat
// เก็บบทสนทนาไว้ที่ Netlify Blobs (ของ Netlify เอง ไม่ต้องต่อบริการอื่น ไม่มีค่าใช้จ่าย)
//
// ฝั่งลูกค้า
//   GET  /api/chat?cid=xxx            อ่านบทสนทนาของตัวเอง
//   POST /api/chat  {cid,text,...}    ส่งข้อความ
// ฝั่งร้าน (ต้องมี key)
//   ส่ง header  x-admin-key: <CHAT_ADMIN_KEY>  มาด้วยทุกครั้ง
//   GET  /api/chat                    รายการห้องแชททั้งหมด
//   GET  /api/chat?cid=xxx            อ่านห้องนั้น
//   POST   /api/chat  {cid,text}      ตอบลูกค้า
//   DELETE /api/chat?cid=xxx          ลบห้องแชททิ้ง
//
// env ที่ใช้
//   CHAT_ADMIN_KEY   รหัสเข้าหน้าแชทของร้าน (ตั้งเองยาว ๆ)
//   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID  เตือนเข้ากลุ่ม Telegram + ตอบกลับจากกลุ่มได้
//   CHAT_NOTIFY_URL  (ไม่บังคับ) ยิง POST ไปที่อื่นเพิ่ม เช่น Make.com
import { getStore } from "@netlify/blobs";
import { pushToAdmins } from "../lib/push.mjs";
import { adminGate } from "../lib/admin-gate.mjs";

const MAX_TEXT = 2000;
const MAX_MSGS = 300;
const clean = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export default async function handler(req, context) {
  const url = new URL(req.url);
  // รหัสร้านส่งมาทาง header ไม่ใช่ query string — กันรหัสไปโผล่ใน log
  // ด่านตรวจอยู่ที่ lib/admin-gate.mjs — มีกันเดารหัสรัว ๆ ให้ด้วย
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  const asAdmin = gate.ok;

  // ---------- เช็คสุขภาพระบบ (ไม่เปิดเผยค่าลับ) ----------
  if (req.method === "GET" && url.searchParams.get("health") === "1") {
    return json({
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      telegramHook: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      adminKey: Boolean(process.env.CHAT_ADMIN_KEY),
      waitUntil: Boolean(context?.waitUntil),
    });
  }

  let store;
  try {
    store = getStore({ name: "gucut-chat", consistency: "strong" });
  } catch {
    return json({ error: "chat store unavailable" }, 503);
  }

  // ---------- ฝั่งร้าน: รายการห้องแชท ----------
  if (req.method === "GET" && asAdmin && !url.searchParams.get("cid")) {
    const { blobs } = await store.list();
    const rooms = [];
    for (const b of blobs) {
      const t = await store.get(b.key, { type: "json" }).catch(() => null);
      if (!t) continue;
      const last = t.messages[t.messages.length - 1];
      rooms.push({
        cid: t.cid, name: t.name, phone: t.phone, product: t.product,
        last: last ? { from: last.from, text: last.text.slice(0, 80), at: last.at } : null,
        unread: t.messages.filter((m) => m.from === "c" && !m.seen).length,
        n: t.messages.length,
      });
    }
    rooms.sort((a, b) => (b.last?.at || 0) - (a.last?.at || 0));
    return json({ rooms });
  }

  const cid = clean(url.searchParams.get("cid") || "", 40);

  // ---------- อ่านบทสนทนา ----------
  if (req.method === "GET") {
    if (!/^[a-z0-9-]{8,40}$/.test(cid)) return json({ error: "bad cid" }, 400);
    const t = await store.get(cid, { type: "json" }).catch(() => null);
    if (asAdmin && t) {
      // ร้านเปิดอ่านแล้ว = ทำเครื่องหมายว่าอ่านข้อความลูกค้าแล้ว
      let changed = false;
      for (const m of t.messages) if (m.from === "c" && !m.seen) { m.seen = true; changed = true; }
      if (changed) await store.setJSON(cid, t);
    }
    return json({ thread: t || { cid, messages: [] } });
  }

  // ---------- ส่งข้อความ ----------
  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const id = clean(body.cid, 40);
    const text = clean(body.text, MAX_TEXT);
    if (!/^[a-z0-9-]{8,40}$/.test(id)) return json({ error: "bad cid" }, 400);
    if (!text) return json({ error: "empty" }, 400);

    const t = (await store.get(id, { type: "json" }).catch(() => null)) || {
      cid: id, created: Date.now(), name: "", phone: "", product: null, messages: [],
    };
    if (!asAdmin) {
      if (body.name) t.name = clean(body.name, 60);
      if (body.phone) t.phone = clean(body.phone, 20);
      if (body.product) t.product = { h: clean(body.product.h, 200), t: clean(body.product.t, 160) };
    }
    t.messages.push({ from: asAdmin ? "s" : "c", text, at: Date.now(), ...(asAdmin ? {} : { seen: false }) });
    if (t.messages.length > MAX_MSGS) t.messages = t.messages.slice(-MAX_MSGS);
    await store.setJSON(id, t);

    // เตือนร้านว่ามีข้อความใหม่
    // ต้องรอให้ยิงเสร็จก่อนตอบกลับ ไม่งั้น serverless ดับก่อน แจ้งเตือนไม่ออก
    // (waitUntil อยู่ที่ context ไม่ใช่ req — เคยเขียนผิดแล้วแจ้งเตือนหายเงียบ ๆ)
    const jobs = [];
    const later = (p) => (context?.waitUntil ? context.waitUntil(p) : jobs.push(p));
    if (!asAdmin) {
      const who = t.name || "ลูกค้า";
      const about = t.product?.t ? `\n📦 ${t.product.t}` : "";
      const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        // ท้ายข้อความมี #รหัสห้อง — แอดมินกด Reply แล้วบอทจะรู้ว่าตอบใคร
        const body = `💬 ${who}${about}\n\n${text}\n\n↩️ กด Reply ข้อความนี้เพื่อตอบลูกค้า\n#${id}`;
        later(
          fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: body, disable_web_page_preview: true }),
          }).catch(() => {})
        );
      }
      // เด้งเข้ามือถือแอดมินทุกเครื่องที่เปิดการแจ้งเตือนไว้
      later(
        pushToAdmins({
          title: `💬 ${who}`,
          body: (t.product?.t ? t.product.t + "\n" : "") + text,
          url: "/admin/chat/",
          tag: id,
        }).catch(() => {})
      );
      if (process.env.CHAT_NOTIFY_URL) {
        later(
          fetch(process.env.CHAT_NOTIFY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: `💬 ${who}: ${text}`, cid: id, text, name: t.name, phone: t.phone }),
          }).catch(() => {})
        );
      }
    }
    if (jobs.length) await Promise.allSettled(jobs);
    return json({ ok: true, thread: t });
  }

  // ---------- ลบห้องแชท (เฉพาะร้าน) ----------
  if (req.method === "DELETE") {
    if (!asAdmin) return json({ error: "unauthorized" }, 401);
    if (!/^[a-z0-9-]{8,40}$/.test(cid)) return json({ error: "bad cid" }, 400);
    await store.delete(cid).catch(() => {});
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",   // แชทต้องสดเสมอ ห้าม cache
    },
  });
}

export const config = { path: "/api/chat" };
