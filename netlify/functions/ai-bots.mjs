// บอต AI มาเก็บข้อมูลเว็บเราบ้างไหม — /api/ai-bots  (หลังร้านเท่านั้น)
//
// ข้อมูลถูกจดไว้โดย netlify/edge-functions/ai-bots.js ตอนบอตเข้ามาจริง
// ตัวนี้แค่สรุปให้หน้าหลังร้านดู
//
// ⚠️ ยิง list ทั้งก้อน จึงหนัก — ให้เรียกจากหลังร้านตอนกดปุ่มเท่านั้น
//    ห้ามเอาไปเรียกอัตโนมัติเป็นรอบ ๆ (กติกาที่เจ้าของร้านสั่งไว้)
import { adminGate } from "../lib/admin-gate.mjs";
import { summary } from "../lib/aibots.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async function handler(req, context) {
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  try {
    return json(await summary());
  } catch (e) {
    return json({ error: e?.message || "อ่านข้อมูลไม่สำเร็จ" }, 502);
  }
}

export const config = { path: "/api/ai-bots" };
