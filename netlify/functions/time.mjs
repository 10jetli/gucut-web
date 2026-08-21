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
  editDay, findByPin, monthTable, publicEmp, punch,
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

export default async function handler(req, context) {
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
    return json(await punch(emp, { peek: action === "status" }));
  }

  // ------------------------------------------------------------------
  // ทางของเจ้าของร้าน
  // ------------------------------------------------------------------
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  if (req.method === "GET") {
    const url = new URL(req.url);
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
