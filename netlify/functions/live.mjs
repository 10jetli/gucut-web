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

  const s = await stats();

  // เก็บกวาดของเก่าไปด้วยตอนเปิดดู ไม่ต้องตั้งงานตามเวลาให้เปลืองอีกตัว
  //
  // ⚠️ ห้ามเขียนเป็น context?.waitUntil?.(sweep()) เด็ดขาด
  //    ถ้า waitUntil ไม่มี JavaScript จะ "ข้ามการประเมิน argument ทั้งก้อน"
  //    แปลว่า sweep() ไม่เคยถูกเรียกเลยแม้แต่ครั้งเดียว — ของเก่าค้างสะสมตลอดไป
  //    และข้อความ "เก็บย้อนหลัง 30 วัน" ในหน้าหลังร้านก็จะไม่จริง
  //    (เขียนผิดแบบนี้ไว้ตั้งแต่แรก เพิ่งจับได้ 19 ส.ค. 2569 ตอนลบข้อมูลทดสอบไม่ออก)
  //    ไฟล์ chat.mjs กับ orders.mjs ใช้ท่าที่ถูกอยู่แล้ว เอามาใช้ให้ตรงกัน
  const job = sweep().catch(() => {});
  if (context?.waitUntil) context.waitUntil(job);
  else await job;          // ไม่มี waitUntil ก็รอให้เสร็จ — หน้านี้เป็นหลังร้าน ช้าอีกนิดไม่เป็นไร

  return json(s);
}

export const config = { path: "/api/live" };
