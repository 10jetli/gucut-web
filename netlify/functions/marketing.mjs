// พิกเซลการตลาด — /api/marketing
//
//   GET                 ค่าที่หน้าร้านต้องใช้ (เฉพาะรหัสพิกเซล ไม่มี token)
//   GET  ?admin=1       ค่าทั้งหมดสำหรับหน้าหลังร้าน (token ถูกปิดเป็นจุด ๆ)
//   POST {...}          บันทึกค่า (ต้องมีรหัสหลังร้าน)
//
// หน้าร้านเรียก GET ทุกครั้งที่โหลด จึงแคชที่ edge 5 นาที
// เปลี่ยนค่าในหลังร้านแล้วรออย่างช้า 5 นาทีถึงมีผลกับคนที่เพิ่งเข้าเว็บ
import { adminGate } from "../lib/admin-gate.mjs";
import { adminView, publicView, readMarketing, writeMarketing } from "../lib/marketing.mjs";

const json = (o, s = 200, headers = {}) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", ...headers },
  });

export default async function handler(req, context) {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const m = await readMarketing();

    if (url.searchParams.get("admin") === "1") {
      const gate = await adminGate(req, context);
      if (gate.deny) return gate.deny;
      if (!gate.ok) return json({ error: "unauthorized" }, 401);
      return json(adminView(m), 200, { "cache-control": "no-store" });
    }

    return json(publicView(m), 200, {
      // แคชสั้น ๆ พอให้ไม่ยิงทุกครั้งที่เปลี่ยนหน้า แต่แก้ค่าแล้วเห็นผลไว
      "cache-control": "public, max-age=60, s-maxage=300",
    });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const saved = await writeMarketing(body);
  return json({ ok: true, ...adminView(saved) }, 200, { "cache-control": "no-store" });
}

export const config = { path: "/api/marketing" };
