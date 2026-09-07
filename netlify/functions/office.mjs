// ห้องทำงาน AI — /api/office (7 ก.ย. 2569)
//
// เจ้าของร้านสั่ง: "อยากได้ live จริง ๆ และเป็นแบบ online" แล้วเลือกเอง
// ว่าให้ไปอยู่ที่ admin.gucut.com ⇒ ท่อสร้างฝั่งนี้ตามกติกา (UI อยู่ gucut-next ที่เดียว)
//
// ปัญหาที่แก้: โควตา AI อยู่ในเครื่อง Mac เท่านั้น ไม่มีบนอินเทอร์เน็ต
//   ⇒ ตัวส่งในเครื่อง (~/claude-shared/office-push.py) ยิง POST เข้ามาทุกนาที
//   ⇒ จอ admin.gucut.com ดึง GET ⇒ ได้ค่าสดจากที่ไหนก็ได้ ไม่ต้องอยู่หน้าเครื่อง
//
//   POST {agent, five, week, ctx, model, cost, commits}  → บันทึก (ต้องมีรหัสหลังร้าน)
//   GET                                                  → { now, agents: [...] }
//
// 🔴 **หนึ่งบัญชี = หนึ่งคีย์** (`a/<ชื่อ>`) ห้ามเก็บรวมก้อนเดียวเด็ดขาด
//    ก้อนเดียว = ใครเขียนทีหลังชนะ แล้วจอจะโชว์เลขของ "ใครสักคน" ซึ่ง**ดูถูกเสมอ**
//    เพราะมันเป็นเลขจริงของคนใดคนหนึ่ง ไม่มีอะไรฟ้องเลย — เจอของจริงกับ
//    statusline-last.json เมื่อ 7 ก.ย. 2569 (ฝั่งจอเป็นคนจับได้)
//    กติกาเดียวกับตัวนับคนเข้าเว็บ · ยอดวิว · ลงเวลาพนักงาน
//
// 🔴 **ไม่มีข่าวจากใคร = ไม่ส่งแถวของคนนั้น ห้ามส่ง 0**
//    0% แปลว่า "ยังไม่ได้ใช้เลย" ซึ่งตรงข้ามกับ "ไม่รู้" · จอต้องเขียนว่า "ไม่รู้"
//    (กติกาสามสถานะ: กำลังโหลด ≠ ดึงไม่สำเร็จ ≠ ไม่มีข้อมูลจริง)
//
// 🔴 **ส่ง `at` ดิบ + `now` ของเซิร์ฟเวอร์ ห้ามคิด "เก่ากี่นาที" ที่นี่**
//    ค่าที่คิดจากเวลาปัจจุบันจะเก่าเงียบ ๆ ทันทีที่ถูกแคช — จอคิดเองจากสองเลขนี้
//    และไม่ต้องเชื่อนาฬิกาเครื่องคนดูด้วย
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";

const store = () => getStore({ name: "gucut-coupon", consistency: "strong" });
const PREFIX = "office/a/";

// รายชื่อที่รับ — กันคนยิงชื่อมั่วมาสร้างโต๊ะปลอมเต็มห้อง
const KNOWN = new Set(["gucut", "gucut2", "codex"]);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** เลข % ที่เชื่อได้ หรือ null — **ห้ามแปลงค่าที่อ่านไม่ได้เป็น 0** */
const pct = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
};

const text = (v, max = 60) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export default async function handler(req, context) {
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

    const agent = text(body?.agent, 20);
    if (!agent || !KNOWN.has(agent)) return json({ error: "unknown agent" }, 400);

    // เวลาบันทึกใช้นาฬิกาเซิร์ฟเวอร์เสมอ ห้ามเชื่อเวลาที่เครื่องผู้ส่งบอกมา
    // (กติกาเดียวกับลงเวลาพนักงาน — ปรับนาฬิกาเครื่องตัวเองก็ปลอมได้)
    const row = {
      agent,
      five: pct(body?.five),
      week: pct(body?.week),
      ctx: pct(body?.ctx),
      model: text(body?.model, 40),
      cost: Number.isFinite(Number(body?.cost)) ? Number(body.cost) : null,
      commits: Number.isFinite(Number(body?.commits)) ? Math.max(0, Math.round(Number(body.commits))) : null,
      note: text(body?.note, 120),
      at: Date.now(),
    };
    await store().setJSON(PREFIX + agent, row);
    return json({ ok: true, agent, at: row.at });
  }

  if (req.method === "GET") {
    const s = store();
    // อ่านทีละคีย์ตามรายชื่อที่รู้จัก — ไม่ใช้ list() เพราะรายชื่อคงที่และสั้น
    const agents = [];
    await Promise.all(
      [...KNOWN].map(async (name) => {
        const row = await s.get(PREFIX + name, { type: "json" }).catch(() => null);
        if (row && typeof row === "object") agents.push(row);
      })
    );
    agents.sort((a, b) => [...KNOWN].indexOf(a.agent) - [...KNOWN].indexOf(b.agent));
    // ⚠️ คนที่ยังไม่เคยส่งข่าวจะ **ไม่มีแถว** — จอต้องขึ้น "ไม่รู้" ไม่ใช่ 0
    return json({ now: Date.now(), agents });
  }

  return json({ error: "method not allowed" }, 405);
}

export const config = { path: "/api/office" };
