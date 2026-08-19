// ตั้งค่าว่าจะให้บอต AI เจ้าไหนเก็บข้อมูลเว็บเราบ้าง — /api/bot-rules (หลังร้านเท่านั้น)
//
//   GET  → { blockable: [{name, note}], blocked: [ชื่อบอต] }
//   POST { blocked: [...] } → บันทึก
import { adminGate } from "../lib/admin-gate.mjs";
import { BLOCKABLE, readBlocked, saveBlocked } from "../lib/botrules.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async function handler(req, context) {
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  if (req.method === "GET") {
    return json({ blockable: BLOCKABLE, blocked: await readBlocked() });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    try {
      return json({ blocked: await saveBlocked(body?.blocked) });
    } catch (e) {
      return json({ error: e?.message || "บันทึกไม่สำเร็จ" }, 502);
    }
  }

  return json({ error: "method not allowed" }, 405);
}

export const config = { path: "/api/bot-rules" };
