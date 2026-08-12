// สมัคร/ยกเลิก การแจ้งเตือนเด้งเข้ามือถือของแอดมิน — /api/push
//   GET                       ขอกุญแจสาธารณะ (ไม่ลับ ใช้ตอนสมัคร)
//   POST   {subscription}     สมัครเครื่องนี้   (ต้องมี x-admin-key)
//   DELETE {endpoint}         ยกเลิกเครื่องนี้  (ต้องมี x-admin-key)
import { vapid, addSub, removeSub, listSubs, pushToAdmins } from "../lib/push.mjs";

export default async function handler(req) {
  const adminKey = process.env.CHAT_ADMIN_KEY || "";
  const sent = req.headers.get("x-admin-key") || "";
  const ok = adminKey.length > 0 && sent === adminKey;

  if (req.method === "GET") {
    const k = await vapid();
    return json({ key: k.publicKey });
  }

  if (!ok) return json({ error: "unauthorized" }, 401);

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    if (body?.test) {
      const n = await pushToAdmins({
        title: "ทดสอบการแจ้งเตือน",
        body: "ใช้งานได้แล้ว — ลูกค้าทักเมื่อไหร่จะเด้งแบบนี้",
        url: "/admin/chat/",
      });
      return json({ ok: true, sent: n });
    }
    if (!body?.subscription?.endpoint) return json({ error: "no subscription" }, 400);
    const n = await addSub(body.subscription);
    return json({ ok: true, devices: n });
  }

  if (req.method === "DELETE") {
    let body;
    try { body = await req.json(); } catch { body = {}; }
    if (body?.endpoint) await removeSub(body.endpoint);
    return json({ ok: true });
  }

  if (req.method === "PUT") return json({ devices: (await listSubs()).length });
  return json({ error: "method not allowed" }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const config = { path: "/api/push" };
