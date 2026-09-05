// นับคนเข้าเว็บ — /api/live
//
//   POST {vid, path, src}   หน้าเว็บส่งมาทุกครั้งที่เปลี่ยนหน้า (ไม่ต้องมีรหัส)
//                           src = ช่องทางที่มา ส่งมาแค่ครั้งแรกของการเข้าเว็บรอบนั้น
//   GET                สรุปให้หน้าหลังร้าน (ต้องมีรหัสหลังร้าน)
//
// ตัว POST ต้องเบาที่สุด เพราะยิงทุกครั้งที่ลูกค้าเปลี่ยนหน้า
// ตอบ 204 ไม่มีเนื้อ ไม่ต้องให้เบราว์เซอร์รออ่านอะไร
import { adminGate } from "../lib/admin-gate.mjs";
import { identify } from "../lib/aibots.mjs";
import { ping, stats, sweep } from "../lib/live.mjs";

// เครื่องมือดูดข้อมูลที่ไม่ได้ประกาศตัวเป็นบอต — ไม่ได้อยู่ในรายชื่อ lib/aibots.mjs
// เพราะพวกนี้ไม่ใช่บอตของเจ้าใหญ่ที่เราอยากรู้ว่ามาอ่านเว็บเราไหม แค่ไม่อยากให้ปนกับคน
const HEADLESS = /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|python-requests|scrapy|node-fetch|axios|Go-http-client|curl\/|wget/i;

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async function handler(req, context) {
  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return new Response(null, { status: 204 }); }
    // -----------------------------------------------------------------------
    // ⚠️ ไม่นับบอต — ต้องกรองที่นี่ ที่เดียวที่เห็น user-agent จริง
    //
    // เคยเข้าใจผิดว่า "บอตไม่รัน JavaScript ตัวนับจึงมองไม่เห็นมันอยู่แล้ว"
    // ผิด — Googlebot · Bingbot · Applebot เปิดหน้าเว็บแล้ว "วาดจริง" เหมือนเบราว์เซอร์
    // ตัวนับจึงถูกยิงทุกหน้าที่บอตเปิด และเพราะบอตไม่เก็บ sessionStorage ข้ามหน้า
    // มันจึงได้รหัสผู้ชมใหม่ทุกครั้ง = ถูกนับเป็น "คนใหม่" ทุกหน้า
    //
    // ของจริงที่เจอ 19 ส.ค. 2569: ผู้เข้าชม 1,278 คน เป็นสหรัฐ 831 คน (65%)
    // ทั้งที่ร้านขายเลื่อยยนต์ในไทย — วันเดียวกันบอตไล่เก็บเว็บไป 1,617 หน้า
    // (ไอร์แลนด์ 8 · สวีเดน 7 ที่โผล่มาด้วยก็คือศูนย์ข้อมูลของผู้ให้บริการคลาวด์)
    //
    // ใช้รายชื่อบอตชุดเดียวกับหน้าตรวจสุขภาพ SEO จะได้ไม่ต้องดูแลสองที่
    // บอตยังถูกนับใน /api/ai-bots เหมือนเดิม แค่ไม่ปนกับตัวเลข "คนเข้าเว็บ"
    // -----------------------------------------------------------------------
    const ua = req.headers.get("user-agent") || "";
    if (identify(ua) || HEADLESS.test(ua)) return new Response(null, { status: 204 });

    // นับพลาดดีกว่าทำให้หน้าเว็บช้า — พังก็เงียบ ๆ ไป
    // Netlify บอกประเทศของผู้เข้าชมมาให้เอง ไม่ต้องพึ่งบริการภายนอกและไม่ต้องเก็บ IP
    const cc = context?.geo?.country?.code;
    // โดเมนของเราเอง ใช้กันไม่ให้นับลิงก์ภายในเว็บตัวเองเป็น "ช่องทางที่มา"
    let selfHost = "";
    try { selfHost = new URL(req.url).hostname.replace(/^www\./, ""); } catch { /* ไม่เป็นไร */ }
    try { await ping(body?.vid, body?.path, cc, body?.src, selfHost, body?.pwa === 1, body?.install === 1); } catch { /* ไม่เป็นไร */ }
    return new Response(null, { status: 204 });
  }

  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  // ⚠️ ต้องอ่าน searchParams จาก req.url — ฟังก์ชันนี้ไม่มีตัวแปร url มาก่อน
  const url = new URL(req.url);
  const s = await stats();

  /* ⚠️ **ไม่เก็บกวาดตรงนี้แล้ว** (5 ก.ย. 2569) — ย้ายไป netlify/functions/live-sweep.mjs
      ของเดิมกวาดตอนเปิดหน้า ⇒ คนเปิดคนแรกของวันรอ 25 วินาที (วัดจริง)
      **ห้ามเอากลับมาใส่ที่นี่อีก** ต่อให้ดูประหยัดกว่าเพราะไม่ต้องมีฟังก์ชันเพิ่ม
      สั่งกวาดเดี๋ยวนั้นได้ที่ GET /api/live?admin=1&sweep=1 (ต้องมี x-admin-key) */
  if (url.searchParams.get("sweep") === "1") {
    const r = await sweep().catch((e) => ({ error: String(e?.message || e).slice(0, 160) }));
    return json({ ...s, sweep: r });
  }

  return json(s);
}

export const config = { path: "/api/live" };
