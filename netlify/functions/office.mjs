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

    /* ── กระดานงานของเจ้าของร้าน (สั่ง 8 ก.ย. 2569: "ใส่งานที่ผมต้องทำลงด้วย") ──
       เก็บที่เซิร์ฟเวอร์เพื่อให้ **AI เป็นคนเพิ่ม/ติ๊กจบตามเหตุการณ์จริง** ไม่ใช่
       รายการที่พิมพ์ตายไว้ในจอ — รายการแบบนั้นจะค้างเก่าเงียบ ๆ ทันทีที่โลกขยับ
       (คลาสเดียวกับ [[stale-state-comments]] — สภาพปัจจุบันที่เขียนตายจะโกหกเสมอ)
       ⚠️ งานที่จบแล้ว **ติ๊ก done ไม่ลบแถว** — เจ้าของร้านต้องเห็นว่าอะไรเพิ่งเสร็จไป
          จอค่อยตัดสินใจเองว่าโชว์ของเสร็จกี่วันแล้วค่อยซ่อน */
    if (body?.taskAdd || body?.taskDone || body?.taskDrop || body?.taskUndo || body?.taskReady) {
      const s = store();
      const KEY = "office/tasks";
      const cur = (await s.get(KEY, { type: "json" }).catch(() => null)) || [];
      const list = Array.isArray(cur) ? cur : [];
      if (body.taskAdd) {
        const t = text(body.taskAdd, 200);
        if (!t) return json({ error: "งานว่างเปล่า" }, 400);
        // กันเพิ่มซ้ำ — งานเดิมยังไม่จบ ห้ามงอกแถวใหม่ (ยิงซ้ำได้ ไม่เบิ้ล)
        const dup = list.find((x) => !x.done && x.text === t);
        if (dup) return json({ ok: true, duplicate: true, id: dup.id });
        const id = `t_${Date.now().toString(36)}`;
        list.push({ id, text: t, note: text(body.note, 300), done: false, at: Date.now() });
        await s.setJSON(KEY, list);
        return json({ ok: true, id });
      }
      const id = text(body.taskDone || body.taskDrop || body.taskUndo || body.taskReady, 40);
      const row = list.find((x) => x.id === id);
      if (!row) return json({ error: `ไม่พบงาน ${id}` }, 404);
      if (body.taskDone) { row.done = true; row.doneAt = Date.now(); }
      else if (body.taskUndo) {
        /* ถอนติ๊ก — เกิดจากเหตุจริง 8 ก.ย. 2569: เจ้าของร้านมือลั่นติ๊กผิด 2 ข้อบนมือถือ
           แล้ว**ไม่มีทางย้อนเองเลย** ต้องเรียก AI มาแก้ข้อมูลให้ · ปุ่มติ๊กที่ย้อนไม่ได้
           บนจอสัมผัส = ระเบิดเวลา ⇒ ทุกการติ๊กต้องถอนได้เสมอ */
        row.done = false;
        delete row.doneAt;
      } else if (body.taskReady) {
        /* "พร้อมทำ — เรียก AI" (เจ้าของร้านขอเอง 8 ก.ย. 2569)
           กดแล้ว: ติดธง ready + เด้ง Telegram เข้ากลุ่มร้าน ⇒ AI/ทีมเห็นทันทีว่า
           เจ้าของร้านว่างและกำลังจะทำข้อไหน จะได้เตรียมพากดหรือเตรียมของรอ
           ⚠️ กดซ้ำไม่เด้งซ้ำ (กันมือลั่นยิงสแปมใส่กลุ่ม) — ถอนธงด้วย taskUndo ได้ */
        if (!row.ready) {
          row.ready = true;
          row.readyAt = Date.now();
          const tk = process.env.TELEGRAM_BOT_TOKEN;
          const chat = process.env.TELEGRAM_CHAT_ID;
          if (tk && chat) {
            // ต้อง await — Netlify แช่แข็งฟังก์ชันหลังตอบ ปล่อยลอย = แจ้งเตือนหายเงียบ
            await fetch(`https://api.telegram.org/bot${tk}/sendMessage`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                chat_id: chat,
                text: `🙋 เจ้าของร้านกด "พร้อมทำ" งาน:\n${row.text}${row.note ? `\n(${row.note})` : ""}\n→ AI เตรียมพาทำได้เลย`,
              }),
            }).catch(() => {});
          }
        }
      }
      else list.splice(list.indexOf(row), 1);   // taskDrop = งานที่ใส่ผิด/ไม่ต้องทำแล้ว
      await s.setJSON(KEY, list);
      return json({ ok: true, ...(row && !body.taskDrop ? { task: row } : {}) });
    }

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
    const tasks = (await s.get("office/tasks", { type: "json" }).catch(() => null)) || [];
    // ⚠️ คนที่ยังไม่เคยส่งข่าวจะ **ไม่มีแถว** — จอต้องขึ้น "ไม่รู้" ไม่ใช่ 0
    return json({ now: Date.now(), agents, tasks: Array.isArray(tasks) ? tasks : [] });
  }

  return json({ error: "method not allowed" }, 405);
}

export const config = { path: "/api/office" };
