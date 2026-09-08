// ส่งข้อความเข้ากลุ่ม Telegram ของร้าน แทนระบบอื่นที่ไม่มีคีย์ Telegram ของตัวเอง
//
// 🔴 **ทำไมต้องมีไฟล์นี้** (8 ก.ย. 2569 — เจอตอนทำตัวเฝ้าบิล)
//    `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` อยู่ที่ Netlify project **gucut-storefront**
//    เท่านั้น · project **gucut-admin** (หลังร้าน admin.gucut.com) **ไม่มีสักตัว**
//    ⇒ งานตามเวลาทุกตัวฝั่งหลังร้านที่เขียนว่า "เด้ง Telegram" **ส่งไม่เคยออกเลย**
//       เพราะตัวส่งของมันเขียนว่า `if (!token || !chat) return;` = เงียบสนิท
//       (ตัวเก็บบิลรายวันเข้าข่ายนี้ ตั้งแต่วันแรกที่เปิดใช้)
//    ⇒ แทนที่จะ **ก๊อปคีย์ไปวางอีกที่** (คีย์ชุดเดียวอยู่สองที่ = วันเปลี่ยนต้องแก้สองที่
//       แล้วจะลืมแน่นอน) ให้ฝั่งนั้นยิงมาที่นี่ด้วย `x-admin-key` ที่มันถืออยู่แล้ว
//       ⇒ **คีย์ Telegram มีเจ้าของที่เดียวตลอดไป**
//
// POST /api/notify   body: { "text": "…" }   header: x-admin-key
//   ตอบ { ok:true, sent:true } เมื่อ Telegram รับจริง
//   ตอบ { ok:false, error } เมื่อส่งไม่ออก — **ห้ามตอบ ok ตอนส่งไม่ได้**
//   ผู้เรียกต้องเอาค่านี้ไปรายงานต่อ ไม่ใช่กลืน (ดู [[three-states-not-two]])
import { adminGate } from "../lib/admin-gate.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

export default async function handler(req, context) {
  if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);

  // adminGate คืน { wants, ok, deny } ไม่ใช่ Response — ต้องเช็คสองชั้น
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "อ่าน body เป็น JSON ไม่ได้" }, 400);
  }
  const text = String(body?.text ?? "").trim();
  if (!text) return json({ error: "ต้องมีช่อง text" }, 400);
  /* กันข้อความยาวเกินขีดของ Telegram (4096) — ตัดเองดีกว่าให้ปลายทางปฏิเสธทั้งใบ */
  const msg = text.length > 4000 ? text.slice(0, 3990) + "\n…(ตัดท้าย)" : text;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  /* 🔴 ไม่ได้ตั้งคีย์ = ตอบผิดพลาดให้ชัด **ห้ามตอบ ok เงียบ ๆ**
     ความเงียบแบบนั้นคือต้นเหตุของบั๊กที่ไฟล์นี้เกิดมาแก้ */
  if (!token || !chat) {
    return json({ ok: false, error: "ฝั่งนี้ยังไม่ได้ตั้ง TELEGRAM_BOT_TOKEN/CHAT_ID" }, 503);
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: msg,
        parse_mode: String(body?.parseMode ?? "HTML"),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const d = await r.json().catch(() => null);
    /* Telegram ตอบ HTTP 200 พร้อม ok:false ได้ (เช่น parse_mode พัง) ⇒ ต้องดูทั้งสองชั้น */
    if (!r.ok || !d?.ok) {
      return json({ ok: false, error: d?.description || `Telegram ตอบ HTTP ${r.status}` }, 502);
    }
    return json({ ok: true, sent: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message ?? e) }, 502);
  }
}
