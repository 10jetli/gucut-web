// รับข้อความจากกลุ่ม Telegram → ส่งกลับไปหาลูกค้าบนเว็บ  (/api/tg)
//
// แอดมินแค่ "กด Reply" ข้อความที่บอทแจ้งเตือนในกลุ่ม แล้วพิมพ์ตอบ
// บอทจะอ่านรหัสห้องจากข้อความต้นทาง แล้วส่งคำตอบเข้าห้องแชทของลูกค้าให้เอง
//
// env
//   TELEGRAM_BOT_TOKEN       token จาก @BotFather
//   TELEGRAM_WEBHOOK_SECRET  รหัสลับ กัน endpoint นี้ถูกยิงมั่ว
import { getStore } from "@netlify/blobs";

const MAX_MSGS = 300;

export default async function handler(req) {
  if (req.method !== "POST") return new Response("ok");

  // Telegram ส่ง header นี้มาด้วยทุกครั้ง — ไม่ตรง = ไม่ใช่ของจริง
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("no", { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  let update;
  try { update = await req.json(); } catch { return new Response("ok"); }

  const msg = update?.message;
  const text = (msg?.text || "").trim();
  const src = msg?.reply_to_message?.text || msg?.reply_to_message?.caption || "";
  if (!msg || !text) return new Response("ok");

  // ต้องเป็นการ reply ข้อความแจ้งเตือนของบอทเท่านั้น
  const cid = /#([a-z0-9-]{8,40})/i.exec(src)?.[1]?.toLowerCase();
  if (!cid) {
    if (msg.reply_to_message) {
      await tg(token, "sendMessage", {
        chat_id: msg.chat.id,
        reply_to_message_id: msg.message_id,
        text: "⚠️ ตอบไม่ได้ — ต้องกด Reply ที่ข้อความแจ้งเตือนของลูกค้า (ข้อความที่มี #รหัสห้อง)",
      });
    }
    return new Response("ok");
  }

  let store;
  try { store = getStore({ name: "gucut-chat", consistency: "strong" }); }
  catch { return new Response("ok"); }

  const t = await store.get(cid, { type: "json" }).catch(() => null);
  if (!t) {
    await tg(token, "sendMessage", {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      text: "⚠️ ห้องแชทนี้ถูกลบไปแล้ว",
    });
    return new Response("ok");
  }

  const who = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ").trim();
  t.messages.push({ from: "s", text: text.slice(0, 2000), at: Date.now(), by: who || undefined });
  if (t.messages.length > MAX_MSGS) t.messages = t.messages.slice(-MAX_MSGS);
  // แอดมินตอบแล้ว = ถือว่าอ่านข้อความลูกค้าหมดแล้ว
  for (const m of t.messages) if (m.from === "c") m.seen = true;
  await store.setJSON(cid, t);

  await tg(token, "sendMessage", {
    chat_id: msg.chat.id,
    reply_to_message_id: msg.message_id,
    text: `✅ ส่งถึงลูกค้าแล้ว${t.name ? ` (${t.name})` : ""}`,
  });
  return new Response("ok");
}

async function tg(token, method, body) {
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch { /* เตือนไม่ได้ก็ไม่เป็นไร อย่าให้พังทั้งระบบ */ }
}

export const config = { path: "/api/tg" };
