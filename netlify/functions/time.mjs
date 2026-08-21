// ลงเวลาพนักงาน — /api/time
//
//   POST {action:"clock"|"status", pin}   พนักงานกดลงเวลา (ไม่ต้องมีรหัสหลังร้าน)
//   GET  ?month=YYYY-MM                   ตารางทั้งเดือน (ต้องมีรหัสหลังร้าน)
//   POST {action:"cfg"|"edit"|"emp-save"} จัดการ (ต้องมีรหัสหลังร้าน)
//
// ⚠️ ทางของพนักงานต้องเปิดโล่งโดยตั้งใจ — ให้เขาเข้า /time/ ได้โดยไม่ต้องรู้รหัสหลังร้าน
//    ถ้าบังคับใช้รหัสหลังร้าน แปลว่าต้องแจกรหัสที่เปิดดูออเดอร์ ยอดขาย และคูปองได้ทั้งหมด
//    ให้พนักงานทุกคน ซึ่งแย่กว่ามาก
//
// ⚠️ แลกมาด้วยการที่ใคร ๆ ก็ยิงเดา PIN ได้ จึงต้องมีตัวกันเดารัวเสมอ
//    PIN 4 หลักมีแค่หมื่นแบบ ถ้าปล่อยให้ยิงฟรีก็เดาครบในไม่กี่นาที
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";
import {
  editDay, findByPin, getPhoto, monthTable, publicEmp, punch,
  readCfg, readEmp, saveEmp, thaiDate, writeCfg,
} from "../lib/attendance.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// ---------- กันเดา PIN ----------
const MAX_TRIES = 8;                  // ผิดเกินนี้ต่อ IP
const WINDOW_MS = 10 * 60 * 1000;     // ในช่วงเวลานี้ → พักไว้
const clientIp = (req) =>
  (req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0] ||
    "?").trim();

/**
 * นับครั้งที่เดาผิดต่อ IP
 * ⚠️ นับเฉพาะ "ครั้งที่ผิด" ไม่ใช่ทุกคำขอ — พนักงานกดถูกทุกวันต้องไม่โดนล็อก
 */
async function tooMany(ip) {
  const s = getStore({ name: "gucut-staff", consistency: "strong" });
  const rec = (await s.get(`fail/${ip}`, { type: "json" }).catch(() => null)) || null;
  if (!rec) return false;
  if (Date.now() - rec.at > WINDOW_MS) return false;
  return rec.n >= MAX_TRIES;
}
async function noteFail(ip) {
  const s = getStore({ name: "gucut-staff", consistency: "strong" });
  const rec = (await s.get(`fail/${ip}`, { type: "json" }).catch(() => null)) || null;
  const fresh = !rec || Date.now() - rec.at > WINDOW_MS;
  await s.setJSON(`fail/${ip}`, { n: fresh ? 1 : rec.n + 1, at: fresh ? Date.now() : rec.at })
    .catch(() => {});
}

/**
 * เตือนเข้ากลุ่ม Telegram ของร้านเมื่อมีคนมาสาย หรือกดจากนอกร้าน
 * ⚠️ เตือนเฉพาะตอน "เข้างาน" เท่านั้น ไม่เตือนตอนเลิกงาน
 *    ไม่งั้นวันหนึ่งเด้งสองครั้งต่อคน จนคนในกลุ่มเลิกอ่าน
 */
async function notifyLate(res) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("[time] ยังไม่ได้ตั้ง TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID");
    return;
  }
  const bits = [`⏰ ${res.name} ลงเวลาเข้างาน ${res.in}`];
  if (res.late > 0) bits.push(`สาย ${res.late} นาที (เข้างาน ${res.workStart})`);
  if (res.far > 0) bits.push(`📍 อยู่ห่างร้าน ~${res.far} เมตร`);
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: bits.join("\n"),
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(5000),
  }).then(async (r) => {
    // เขียน log ไว้ให้ไล่ได้จากหน้า Netlify ถ้าวันหนึ่งไม่เด้งอีก
    if (!r.ok) console.log("[time] Telegram ปฏิเสธ:", r.status, (await r.text()).slice(0, 200));
  });
}

export default async function handler(req, context) {
  const url = new URL(req.url);

  // ค่าตั้งค่าที่หน้าพนักงานต้องรู้ก่อนกด — เปิดโล่งได้ ไม่มีอะไรเป็นความลับ
  // (ต้องรู้ล่วงหน้าว่าจะถ่ายรูปไหม เพื่อขอสิทธิ์กล้องก่อนผู้ใช้กดปุ่ม)
  if (req.method === "GET" && url.searchParams.get("public") === "1") {
    const cfg = await readCfg();
    // ⚠️ ส่งแค่ "ต้องขอสิทธิ์อะไรบ้าง" ไม่ส่งพิกัดร้านหรือรัศมีออกไป
    //    ถ้าบอกพิกัดกับรัศมี พนักงานปลอมตำแหน่งให้อยู่ในวงได้พอดีเป๊ะ
    return json({ photo: !!cfg.photo, gps: !!(cfg.gps && cfg.lat && cfg.lng), workStart: cfg.start });
  }

  let body = null;
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400); }
  }
  const action = String(body?.action || "");

  // ------------------------------------------------------------------
  // ทางของพนักงาน — ไม่ต้องมีรหัสหลังร้าน ใช้ PIN อย่างเดียว
  // ------------------------------------------------------------------
  if (action === "clock" || action === "status") {
    const ip = clientIp(req);
    if (await tooMany(ip)) {
      return json({ error: "ใส่ PIN ผิดหลายครั้งเกินไป รอสัก 10 นาทีแล้วลองใหม่" }, 429);
    }
    const emp = await findByPin(body?.pin);
    if (!emp) {
      await noteFail(ip);
      // ⚠️ ห้ามบอกว่า "ไม่มี PIN นี้" หรือ "ถูกพักงาน" แยกกัน — จะกลายเป็นเครื่องมือไล่เดา
      return json({ error: "PIN ไม่ถูกต้อง" }, 401);
    }
    const res = await punch(emp, {
      peek: action === "status",
      photo: typeof body?.photo === "string" ? body.photo : null,
      loc: body?.loc && typeof body.loc === "object"
        ? { lat: Number(body.loc.lat), lng: Number(body.loc.lng) }
        : null,
    });

    // แจ้งเตือนเข้ากลุ่มร้านเมื่อมีคนมาสายหรือกดจากนอกร้าน
    //
    // ⚠️ ปล่อยลอยเฉย ๆ ไม่ได้ — ฟังก์ชันจบแล้วงานที่ค้างอยู่จะไม่ได้ทำงานต่อ
    //    เขียนเป็น void notifyLate(...) ไว้ตอนแรก แล้วข้อความไม่เด้งเลยสักครั้ง
    //    (เจอของจริง 21 ส.ค. 2569 — กับดักตัวเดียวกับ sweep() ใน live.mjs)
    //
    // ⚠️ และห้ามเขียน context?.waitUntil?.(job) เด็ดขาด
    //    ถ้า waitUntil ไม่มี JavaScript จะข้ามการประเมิน argument ทั้งก้อน
    //    แปลว่า notifyLate() ไม่เคยถูกเรียกเลย
    if (res.kind === "in" && (res.late > 0 || res.far > 0)) {
      const job = notifyLate(res).catch(() => {});
      if (context?.waitUntil) context.waitUntil(job);
      else await job;   // ไม่มี waitUntil ก็รอ — ยิง Telegram ใช้เวลาไม่ถึงครึ่งวินาที
    }
    return json(res);
  }

  // ------------------------------------------------------------------
  // ทางของเจ้าของร้าน
  // ------------------------------------------------------------------
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  // ดูรูปตอนลงเวลา — ต้องผ่านด่านรหัสหลังร้านแล้วเท่านั้น
  if (req.method === "GET" && url.searchParams.get("photo")) {
    const [date, id, kind] = String(url.searchParams.get("photo")).split("/");
    const p = date && id && (kind === "in" || kind === "out")
      ? await getPhoto(date, id, kind)
      : null;
    if (!p) return json({ error: "ไม่พบรูป" }, 404);
    return new Response(p.data, {
      headers: {
        "content-type": p.type,
        // รูปเก่าไม่มีวันเปลี่ยน แคชในเครื่องคนดูได้ยาว ๆ แต่ห้ามให้ตัวกลางแคช
        "cache-control": "private, max-age=86400",
      },
    });
  }

  if (req.method === "GET") {
    const today = thaiDate();
    const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "")
      ? url.searchParams.get("month")
      : today.slice(0, 7);
    const [emp, cfg, days] = await Promise.all([readEmp(), readCfg(), monthTable(month)]);
    return json({ month, today, emp: publicEmp(emp), cfg, days });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    if (action === "cfg") return json({ ok: true, cfg: await writeCfg(body) });
    if (action === "emp-save") { await saveEmp(body?.emp); return json({ ok: true }); }
    if (action === "edit") { await editDay(body); return json({ ok: true }); }
  } catch (e) {
    // ข้อความจาก saveEmp/editDay เขียนเป็นไทยไว้แล้ว ส่งกลับให้หน้าเว็บโชว์ได้เลย
    return json({ error: String(e?.message || e) }, 400);
  }
  return json({ error: "ไม่รู้จักคำสั่งนี้" }, 400);
}

export const config = { path: "/api/time" };
