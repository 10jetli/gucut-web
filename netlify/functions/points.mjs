// แต้มสะสม — /api/points
//
//   GET  /api/points                          กติกา + แต้มของฉัน + ประวัติ (ถ้าล็อกอิน)
//   POST {action:"settings", ...}             ตั้งกติกา (ต้องมีรหัสหลังร้าน)
//   POST {action:"adjust", phone, n, note}    เพิ่ม/ลดแต้มให้ลูกค้ามือ (ต้องมีรหัสหลังร้าน)
//
// แต้มถูกบวกจริงตอนออเดอร์ "สำเร็จ" และถูกหักตอนสั่งซื้อ — ทำใน /api/orders
// ที่นี่มีไว้ให้ดูและให้ร้านตั้งค่าเท่านั้น
import { adminGate } from "../lib/admin-gate.mjs";
import { addPoints, readLoyalty, writeLoyalty } from "../lib/points.mjs";
import { currentUser, normPhone, store as usersStore } from "../lib/session.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

export default async function handler(req, context) {
  const cfg = await readLoyalty();

  if (req.method === "GET") {
    let me = null;
    try { me = (await currentUser(req, usersStore()))?.user ?? null; } catch { /* ไม่ได้ล็อกอิน */ }
    return json({
      ...cfg,
      points: Number(me?.points || 0),
      log: Array.isArray(me?.pointLog) ? me.pointLog.slice(0, 30) : [],
    });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  // adminGate คืน { wants, ok, deny } ไม่ใช่ Response — ต้องเช็คสองชั้น
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  if (body.action === "settings") return json({ ok: true, ...(await writeLoyalty(body)) });

  if (body.action === "adjust") {
    const phone = normPhone(body.phone);
    const n = Math.round(Number(body.n) || 0);
    if (!phone || !n) return json({ error: "ต้องมีเบอร์ลูกค้าและจำนวนแต้ม" }, 400);
    const after = await addPoints(usersStore(), phone, n, body.note || "ร้านปรับแต้มให้", null);
    if (after === null) return json({ error: "ไม่พบบัญชีที่ใช้เบอร์นี้" }, 404);
    return json({ ok: true, points: after });
  }

  return json({ error: "ไม่รู้จักคำสั่งนี้" }, 400);
}

export const config = { path: "/api/points" };
