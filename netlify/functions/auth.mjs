// บัญชีลูกค้า — /api/auth
// สมัคร/เข้าสู่ระบบด้วย เบอร์โทร + รหัสผ่าน  เก็บที่ Netlify Blobs (ของ Netlify เอง ไม่มีค่าใช้จ่าย)
//
//   GET  /api/auth                                  ฉันเป็นใคร (อ่านจาก cookie)
//   POST /api/auth {action:"register",phone,name,password,remember}
//   POST /api/auth {action:"login",phone,password,remember}   remember:false = ปิดเบราว์เซอร์แล้วหลุด
//   POST /api/auth {action:"logout"}
//   POST /api/auth {action:"profile",name,addr}     แก้ชื่อ / ที่อยู่จัดส่ง
//   POST /api/auth {action:"password",old,next}     เปลี่ยนรหัสผ่าน
//
// รหัสผ่านไม่ถูกเก็บเป็นตัวหนังสือ — เก็บเป็น scrypt hash + salt สุ่มรายคน
// ถึงใครหลุดเข้ามาดูฐานข้อมูลก็อ่านรหัสลูกค้าไม่ได้
import { getStore } from "@netlify/blobs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const COOKIE = "gu_sess";
const SESSION_DAYS = 90;
const MAX_FAILS = 8;              // ใส่รหัสผิดเกินนี้ พักไว้ 15 นาที
const LOCK_MS = 15 * 60 * 1000;

const store = () => getStore({ name: "gucut-users", consistency: "strong" });

const clean = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** 08x-xxx-xxxx / +66 → 0xxxxxxxxx */
function normPhone(v) {
  let d = String(v ?? "").replace(/[^0-9]/g, "");
  if (d.startsWith("66")) d = "0" + d.slice(2);
  return /^0\d{8,9}$/.test(d) ? d : "";
}

function hashPw(pw, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(pw, salt, 64).toString("hex") };
}
function checkPw(pw, rec) {
  if (!rec?.salt || !rec?.hash) return false;
  const a = Buffer.from(rec.hash, "hex");
  const b = scryptSync(pw, rec.salt, a.length);
  return a.length === b.length && timingSafeEqual(a, b);
}

const publicUser = (u) => ({ phone: u.phone, name: u.name || "", addr: u.addr || null });

function readCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

// keep=true → อยู่ 90 วัน · keep=false → หายตอนปิดเบราว์เซอร์ (ไม่ใส่ Max-Age)
const setCookie = (token, keep = true) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax` +
  (keep ? `; Max-Age=${SESSION_DAYS * 86400}` : "");
const killCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

async function currentUser(req, s) {
  const tok = readCookie(req, COOKIE);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(tok)) return null;
  const sess = await s.get(`s/${tok}`, { type: "json" }).catch(() => null);
  if (!sess?.phone) return null;
  const u = await s.get(`u/${sess.phone}`, { type: "json" }).catch(() => null);
  return u ? { user: u, token: tok } : null;
}

export default async function handler(req) {
  let s;
  try { s = store(); } catch { return json({ error: "store unavailable" }, 503); }

  if (req.method === "GET") {
    const me = await currentUser(req, s);
    return json({ user: me ? publicUser(me.user) : null });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const action = String(body.action || "");

  // ---------- ออกจากระบบ ----------
  if (action === "logout") {
    const tok = readCookie(req, COOKIE);
    if (tok) await s.delete(`s/${tok}`).catch(() => {});
    return json({ ok: true }, 200, killCookie());
  }

  // ---------- สมัครสมาชิก ----------
  if (action === "register") {
    const phone = normPhone(body.phone);
    const name = clean(body.name, 60);
    const pw = String(body.password ?? "");
    if (!phone) return json({ error: "เบอร์โทรไม่ถูกต้อง" }, 400);
    if (!name) return json({ error: "กรอกชื่อด้วยครับ" }, 400);
    if (pw.length < 8) return json({ error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัว" }, 400);
    if (pw.length > 128) return json({ error: "รหัสผ่านยาวเกินไป" }, 400);

    const exists = await s.get(`u/${phone}`, { type: "json" }).catch(() => null);
    if (exists) return json({ error: "เบอร์นี้สมัครไว้แล้ว — กดเข้าสู่ระบบได้เลย" }, 409);

    const u = { phone, name, pass: hashPw(pw), created: Date.now(), addr: null };
    await s.setJSON(`u/${phone}`, u);
    const token = await newSession(s, phone);
    return json({ ok: true, user: publicUser(u) }, 200, setCookie(token, body.remember !== false));
  }

  // ---------- เข้าสู่ระบบ ----------
  if (action === "login") {
    const phone = normPhone(body.phone);
    const pw = String(body.password ?? "");
    if (!phone || !pw) return json({ error: "กรอกเบอร์และรหัสผ่านให้ครบ" }, 400);

    // กันเดารหัสรัว ๆ
    const rl = (await s.get(`rl/${phone}`, { type: "json" }).catch(() => null)) || { fails: 0, until: 0 };
    if (rl.until > Date.now()) {
      const min = Math.ceil((rl.until - Date.now()) / 60000);
      return json({ error: `ใส่รหัสผิดหลายครั้งเกินไป ลองใหม่ในอีก ${min} นาที` }, 429);
    }

    const u = await s.get(`u/${phone}`, { type: "json" }).catch(() => null);
    // ข้อความเดียวกันทั้งกรณีไม่มีเบอร์นี้และรหัสผิด — ไม่บอกคนนอกว่าเบอร์ไหนเป็นสมาชิก
    if (!u || !checkPw(pw, u.pass)) {
      const fails = rl.fails + 1;
      await s.setJSON(`rl/${phone}`, {
        fails: fails >= MAX_FAILS ? 0 : fails,
        until: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0,
      });
      return json({ error: "เบอร์หรือรหัสผ่านไม่ถูกต้อง" }, 401);
    }
    await s.delete(`rl/${phone}`).catch(() => {});
    const token = await newSession(s, phone);
    return json({ ok: true, user: publicUser(u) }, 200, setCookie(token, body.remember !== false));
  }

  // ---------- ที่เหลือต้องล็อกอินก่อน ----------
  const me = await currentUser(req, s);
  if (!me) return json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, 401);

  if (action === "profile") {
    const u = me.user;
    if (body.name !== undefined) u.name = clean(body.name, 60) || u.name;
    if (body.addr !== undefined) {
      const a = body.addr || {};
      u.addr = {
        name: clean(a.name, 60),
        phone: normPhone(a.phone) || clean(a.phone, 20),
        address: clean(a.address, 300),
        province: clean(a.province, 60),
        zip: clean(a.zip, 5),
      };
    }
    await s.setJSON(`u/${u.phone}`, u);
    return json({ ok: true, user: publicUser(u) });
  }

  if (action === "password") {
    const u = me.user;
    const next = String(body.next ?? "");
    if (!checkPw(String(body.old ?? ""), u.pass)) return json({ error: "รหัสผ่านเดิมไม่ถูกต้อง" }, 401);
    if (next.length < 8) return json({ error: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัว" }, 400);
    u.pass = hashPw(next);
    await s.setJSON(`u/${u.phone}`, u);
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
}

async function newSession(s, phone) {
  const token = randomBytes(24).toString("base64url");
  await s.setJSON(`s/${token}`, { phone, at: Date.now() });
  return token;
}

function json(data, status = 200, cookie) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

export const config = { path: "/api/auth" };
