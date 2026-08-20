// ลงเวลาเข้า-ออกงานพนักงาน — /api/time
//
// พนักงาน (ไม่ต้องมีรหัสหลังร้าน — ใช้ PIN ของตัวเอง):
//   POST {action:"clock",  pin}   กดลงเวลา — ครั้งแรกของวัน = เข้างาน, ครั้งถัดไป = เลิกงาน
//   POST {action:"status", pin}   ดูสถานะวันนี้ของตัวเอง (ไม่บันทึกอะไร)
//
// ร้าน (ต้องมีรหัสหลังร้านผ่าน adminGate):
//   GET  ?month=YYYY-MM           พนักงานทั้งหมด + เวลาเข้าออกทั้งเดือน
//   POST {action:"emp-save", emp:{id?, name, pin, active}}   เพิ่ม/แก้พนักงาน
//   POST {action:"cfg", start, end}                          ตั้งเวลาเข้า-เลิกงานของร้าน
//   POST {action:"edit", date, id, in, out}                  แก้เวลาย้อนหลัง ("HH:MM" หรือ "" = ลบ)
//
// เก็บที่ Netlify Blobs store `gucut-time`
//   emp            รายชื่อพนักงาน [{id, name, pin, active}]
//   cfg            { start:"09:00", end:"18:00" }
//   d/<วัน>/<id>   บันทึกรายวัน { name, in, out, late }  (หนึ่งคน = หนึ่งคีย์ กันเขียนทับกัน)
//   rl/<ip>        กันเดา PIN รัว ๆ
//
// เวลาไทยทั้งไฟล์ — เก็บเป็น timestamp (ms) แต่คิด "วัน" และ "สาย" ตาม UTC+7
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";

const MAX_FAILS = 10;                 // ใส่ PIN ผิดเกินนี้ พัก 15 นาที (นับตาม IP)
const LOCK_MS = 15 * 60 * 1000;
const TH = 7 * 3600 * 1000;

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

const store = () => getStore({ name: "gucut-time", consistency: "strong" });

/** วันนี้ตามเวลาไทย เช่น "2026-08-20" */
const thDay = (ms = Date.now()) => new Date(ms + TH).toISOString().slice(0, 10);
/** "HH:MM" ตามเวลาไทย */
const thHM = (ms) => new Date(ms + TH).toISOString().slice(11, 16);
/** แปลง "HH:MM" ของวันไทยวันนั้นกลับเป็น timestamp */
const fromHM = (day, hm) => new Date(`${day}T${hm}:00+07:00`).getTime();

const readEmp = async (s) => (await s.get("emp", { type: "json" }).catch(() => null)) || [];
const readCfg = async (s) =>
  (await s.get("cfg", { type: "json" }).catch(() => null)) || { start: "09:00", end: "18:00" };

/** กี่นาทีหลังเวลาเข้างาน (ติดลบ = มาก่อนเวลา) */
const lateMin = (ts, cfg) => Math.round((ts - fromHM(thDay(ts), cfg.start)) / 60000);

const ipOf = (req, context) =>
  context?.ip ||
  req.headers.get("x-nf-client-connection-ip") ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

/** ส่งแจ้งเตือนเข้ากลุ่ม Telegram เดิมของร้าน — ใช้ env ชุดเดียวกับออเดอร์/แชท */
function notify(context, text) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const p = fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  }).catch(() => {});
  if (context?.waitUntil) context.waitUntil(p);
}

export default async function handler(req, context) {
  let s;
  try { s = store(); } catch { return json({ error: "ระบบเก็บข้อมูลยังไม่พร้อม" }, 503); }

  // ---------- ร้านดูรายงาน ----------
  if (req.method === "GET") {
    const gate = await adminGate(req, context);
    if (gate.deny) return gate.deny;
    if (!gate.ok) return json({ error: "unauthorized" }, 401);

    const month = /^\d{4}-\d{2}$/.test(new URL(req.url).searchParams.get("month") || "")
      ? new URL(req.url).searchParams.get("month")
      : thDay().slice(0, 7);

    const emp = await readEmp(s);
    const cfg = await readCfg(s);
    let blobs = [];
    try { ({ blobs } = await s.list({ prefix: `d/${month}` })); } catch { /* ยังไม่มีข้อมูลเดือนนี้ */ }

    // d/<วัน>/<id> → days["<วัน>"]["<id>"] = record
    const days = {};
    await Promise.all(
      blobs.map(async (b) => {
        const [, day, id] = b.key.split("/");
        if (!day || !id) return;
        const rec = await s.get(b.key, { type: "json" }).catch(() => null);
        if (!rec) return;
        (days[day] = days[day] || {})[id] = rec;
      }),
    );
    return json({ month, today: thDay(), emp, cfg, days });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  // ---------- พนักงานลงเวลา (ใช้ PIN) ----------
  if (body.action === "clock" || body.action === "status") {
    const ip = ipOf(req, context);
    const rl = (await s.get(`rl/${ip}`, { type: "json" }).catch(() => null)) || { fails: 0, until: 0 };
    if (rl.until > Date.now()) {
      const min = Math.ceil((rl.until - Date.now()) / 60000);
      return json({ error: `ใส่ PIN ผิดหลายครั้งเกินไป ลองใหม่ในอีก ${min} นาที` }, 429);
    }

    const pin = String(body.pin || "").trim();
    const emp = await readEmp(s);
    const me = /^\d{4,6}$/.test(pin) ? emp.find((e) => e.active !== false && e.pin === pin) : null;
    if (!me) {
      const fails = rl.fails + 1;
      await s.setJSON(`rl/${ip}`, {
        fails: fails >= MAX_FAILS ? 0 : fails,
        until: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0,
      }).catch(() => {});
      return json({ error: "PIN ไม่ถูกต้อง" }, 401);
    }
    await s.delete(`rl/${ip}`).catch(() => {});

    const cfg = await readCfg(s);
    const day = thDay();
    const key = `d/${day}/${me.id}`;
    let rec = await s.get(key, { type: "json" }).catch(() => null);

    if (body.action === "clock") {
      const now = Date.now();
      if (!rec?.in) {
        // ครั้งแรกของวัน = เข้างาน
        const late = lateMin(now, cfg);
        rec = { name: me.name, in: now, out: null, late: late > 0 ? late : 0 };
        await s.setJSON(key, rec);
        notify(context, `🕘 ${me.name} เข้างาน ${thHM(now)}` + (rec.late ? ` ⚠️ สาย ${rec.late} นาที` : ""));
      } else {
        // กดซ้ำ = เลิกงาน (กดอีกก็อัปเดตเวลาเลิกล่าสุด — เผื่อกดก่อนเวลาแล้วกลับมาทำงานต่อ)
        rec.out = now;
        await s.setJSON(key, rec);
        notify(context, `🏠 ${me.name} เลิกงาน ${thHM(now)}`);
      }
    }

    return json({
      ok: true,
      name: me.name,
      day,
      in: rec?.in ? thHM(rec.in) : null,
      out: rec?.out ? thHM(rec.out) : null,
      late: rec?.late || 0,
      workStart: cfg.start,
    });
  }

  // ---------- คำสั่งฝั่งร้าน ----------
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  if (body.action === "emp-save") {
    const e = body.emp || {};
    const name = String(e.name || "").trim().slice(0, 60);
    const pin = String(e.pin || "").trim();
    if (!name) return json({ error: "ต้องมีชื่อพนักงาน" }, 400);
    if (!/^\d{4,6}$/.test(pin)) return json({ error: "PIN ต้องเป็นตัวเลข 4-6 หลัก" }, 400);

    const emp = await readEmp(s);
    const id = e.id || "e" + Date.now().toString(36);
    if (emp.some((x) => x.id !== id && x.active !== false && x.pin === pin)) {
      return json({ error: "PIN นี้มีคนใช้แล้ว — ตั้งเลขอื่น" }, 400);
    }
    const cur = emp.find((x) => x.id === id);
    if (cur) Object.assign(cur, { name, pin, active: e.active !== false });
    else emp.push({ id, name, pin, active: true });
    await s.setJSON("emp", emp);
    return json({ ok: true, emp });
  }

  if (body.action === "cfg") {
    const hm = (v, fb) => (/^\d{2}:\d{2}$/.test(String(v || "")) ? v : fb);
    const cfg = { start: hm(body.start, "09:00"), end: hm(body.end, "18:00") };
    await s.setJSON("cfg", cfg);
    return json({ ok: true, cfg });
  }

  if (body.action === "edit") {
    const day = String(body.date || "");
    const id = String(body.id || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !id) return json({ error: "ข้อมูลไม่ครบ" }, 400);
    const emp = await readEmp(s);
    const who = emp.find((x) => x.id === id);
    if (!who) return json({ error: "ไม่พบพนักงานคนนี้" }, 404);

    const key = `d/${day}/${id}`;
    const hm = (v) => (/^\d{2}:\d{2}$/.test(String(v || "")) ? v : null);
    const tIn = hm(body.in);
    const tOut = hm(body.out);
    if (!tIn) {
      // ไม่มีเวลาเข้า = ลบทั้งวัน (ลงเวลาผิดคน/ผิดวัน)
      await s.delete(key).catch(() => {});
      return json({ ok: true, removed: true });
    }
    const cfg = await readCfg(s);
    const inTs = fromHM(day, tIn);
    const late = lateMin(inTs, cfg);
    const rec = {
      name: who.name,
      in: inTs,
      out: tOut ? fromHM(day, tOut) : null,
      late: late > 0 ? late : 0,
      edited: true,          // ธงว่าร้านแก้มือ — โชว์ในรายงานให้รู้ว่าไม่ใช่เวลากดจริง
    };
    await s.setJSON(key, rec);
    return json({ ok: true, rec });
  }

  return json({ error: "ไม่รู้จักคำสั่งนี้" }, 400);
}

export const config = { path: "/api/time" };
