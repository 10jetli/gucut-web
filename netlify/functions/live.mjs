// นับคนเข้าเว็บ — /api/live
//
//   POST {vid, path}   หน้าเว็บส่งมาทุกครั้งที่เปลี่ยนหน้า (ไม่ต้องมีรหัส)
//   GET                สรุปให้หน้าหลังร้าน (ต้องมีรหัสหลังร้าน)
//
// ตัว POST ต้องเบาที่สุด เพราะยิงทุกครั้งที่ลูกค้าเปลี่ยนหน้า
// ตอบ 204 ไม่มีเนื้อ ไม่ต้องให้เบราว์เซอร์รออ่านอะไร
import { adminGate } from "../lib/admin-gate.mjs";
import { ping, stats, sweep } from "../lib/live.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async function handler(req, context) {
  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return new Response(null, { status: 204 }); }
    // นับพลาดดีกว่าทำให้หน้าเว็บช้า — พังก็เงียบ ๆ ไป
    // Netlify บอกประเทศของผู้เข้าชมมาให้เอง ไม่ต้องพึ่งบริการภายนอกและไม่ต้องเก็บ IP
    const cc = context?.geo?.country?.code;
    try { await ping(body?.vid, body?.path, cc); } catch { /* ไม่เป็นไร */ }
    return new Response(null, { status: 204 });
  }

  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  const s = await stats();
  // เก็บกวาดของเก่าไปด้วยตอนเปิดดู ไม่ต้องตั้งงานตามเวลาให้เปลืองอีกตัว
  context?.waitUntil?.(sweep().catch(() => {}));
  return json(s);
}

export const config = { path: "/api/live" };
