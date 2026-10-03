// ส่วนกลางของระบบบัญชี — ใช้ร่วมกันระหว่าง /api/auth กับ /api/oauth/*
// รวมไว้ที่เดียวเพื่อไม่ให้โค้ดเรื่อง cookie/session เพี้ยนกันคนละไฟล์
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

export const COOKIE = "gu_sess";        // cookie ตัวจริงที่บอกว่าเป็นใคร
export const LINK_COOKIE = "gu_link";   // ระหว่างรอผูกบัญชี LINE กับเบอร์
export const OAUTH_COOKIE = "gu_oauth"; // กัน CSRF ตอนวิ่งไป-กลับ LINE
export const SESSION_DAYS = 90;

export const store = () => getStore({ name: "gucut-users", consistency: "strong" });

export const clean = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** 08x-xxx-xxxx / +66 → 0xxxxxxxxx */
export function normPhone(v) {
  let d = String(v ?? "").replace(/[^0-9]/g, "");
  if (d.startsWith("66")) d = "0" + d.slice(2);
  return /^0\d{8,9}$/.test(d) ? d : "";
}

export const publicUser = (u) => {
  // u.line คือรูปแบบเดิมสมัยมีแต่ LINE — ยังอ่านให้คนที่ผูกไว้ก่อนหน้า
  const all = { ...(u.line ? { line: u.line } : {}), ...(u.social || {}) };
  const social = {};
  for (const [k, v] of Object.entries(all)) {
    social[k] = { name: v?.name || "", picture: v?.picture || "" };
  }
  return {
    phone: u.phone,
    name: u.name || "",
    addr: u.addr || null,
    social,
    hasPassword: !!u.pass,
  };
};

export function readCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

// keep=true → อยู่ 90 วัน · keep=false → หายตอนปิดเบราว์เซอร์ (ไม่ใส่ Max-Age)
export const setCookie = (token, keep = true) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax` +
  (keep ? `; Max-Age=${SESSION_DAYS * 86400}` : "");
export const killCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** cookie ชั่วคราวอายุสั้น ใช้ระหว่างขั้นตอน OAuth */
export const shortCookie = (name, value, seconds) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
export const killShort = (name) =>
  `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/**
 * ตอนนี้ใครล็อกอินอยู่ — **สามสถานะ ห้ามยุบเหลือสอง**
 *
 *   { state:"user",  user, token }  อ่านได้ และมีคนล็อกอินอยู่จริง
 *   { state:"guest" }               อ่านได้ และยืนยันว่า **ไม่มีใคร**ล็อกอิน
 *   { state:"unknown", err }        **ถามไม่ได้** — ที่เก็บข้อมูลปฏิเสธการอ่าน
 *
 * 🔴 **B26 (แก้ 4 ต.ค. 2569)** — ของเดิมเขียน `.catch(() => null)` ทั้งสองบรรทัด
 *    ⇒ Blobs สะดุด = `currentUser` คืน null = **"ยืนยันว่าไม่มีใครล็อกอิน"**
 *    ⇒ ลูกค้าที่ล็อกอินอยู่ถูกจอบอกว่ายังไม่ได้ล็อกอิน · `fetchMe()` ลบของที่จำไว้
 *      ⇒ หัวเว็บเปลี่ยนเป็นคนนอกให้เห็น ๆ **โดยไม่มีอะไรฟ้องว่าอ่านไม่ได้**
 *
 * 🔑 คลาส **"ไม่รู้" ห้ามกลายเป็นคำยืนยัน** — null ที่นี่ตอบคนละคำถามกับ null ของคนนอก
 *    และจอฝั่งหน้าเว็บ **ออกแบบรับสามสถานะไว้แล้วตั้งแต่ 6 ก.ย. 2569**
 *    (`PointsView.tsx`: "ถามไม่ได้ ⇒ คืน null ห้ามคืน { user: null }")
 *    ⇒ ของที่พังคือ **ท่อยุบสามเหลือสอง** ไม่ใช่จอ
 */
export async function currentUserState(req, s) {
  const tok = readCookie(req, COOKIE);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(tok)) return { state: "guest" };

  let sess;
  try { sess = await s.get(`s/${tok}`, { type: "json" }); }
  catch (err) { return { state: "unknown", err }; }
  // อ่านได้แต่ไม่มีคีย์ = session หมดอายุ/ถูกลบจริง ⇒ เป็นคนนอกจริง
  if (!sess?.phone) return { state: "guest" };

  let u;
  try { u = await s.get(`u/${sess.phone}`, { type: "json" }); }
  catch (err) { return { state: "unknown", err }; }
  if (!u) return { state: "guest" };

  return { state: "user", user: u, token: tok };
}

/**
 * รูปเดิมที่คนเรียกทั้งหมดใช้อยู่ — คืน `{ user, token }` หรือ `null`
 *
 * ⚠️ **"อ่านไม่ได้" ถูกยุบเป็น null ตรงนี้โดยตั้งใจ** เพราะผู้เรียกที่เหลือทุกตัว
 *    ใช้ค่านี้ไป **ให้สิทธิ์น้อยลง** เท่านั้น (ไม่ผูกแต้ม · ไม่เติมชื่อผู้ซื้อ · ไม่โชว์คูปองของฉัน)
 *    ⇒ ยุบแล้วยังปลอดภัย (fail-closed) และไม่ต้องแก้ผู้เรียก 8 จุดพร้อมกัน
 *
 * 🔴 **กฎสำหรับคนเขียนโค้ดใหม่**: ถ้าจุดที่คุณเขียน **ให้สิทธิ์ · เขียนทับข้อมูล ·
 *    หรือบอกลูกค้าว่าเขาเป็นใคร** ⇒ ห้ามใช้ตัวนี้ ให้ใช้ `currentUserState` แล้วแยก
 *    `unknown` ออกมาตอบ 503 ไม่ใช่ปล่อยให้แปลว่า "ไม่ได้ล็อกอิน"
 *    (ทางที่ทำแล้ว: `GET /api/auth` — ดู `functions/auth.mjs`)
 */
export async function currentUser(req, s) {
  const r = await currentUserState(req, s);
  return r.state === "user" ? { user: r.user, token: r.token } : null;
}

export async function newSession(s, phone) {
  const token = randomBytes(24).toString("base64url");
  await s.setJSON(`s/${token}`, { phone, at: Date.now() });
  return token;
}

export const newToken = () => randomBytes(24).toString("base64url");

/** พาไปหน้าอื่น — รับ cookie ได้หลายตัว */
export function redirect(url, cookies = []) {
  const headers = new Headers({ location: url, "cache-control": "no-store" });
  for (const c of [].concat(cookies).filter(Boolean)) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
}

export function json(data, status = 200, cookies) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  for (const c of [].concat(cookies ?? []).filter(Boolean)) headers.append("set-cookie", c);
  return new Response(JSON.stringify(data), { status, headers });
}

/** ปลายทางหลังล็อกอิน — รับเฉพาะ path ในเว็บเรา กัน open redirect */
export function safeNext(v) {
  const n = String(v ?? "");
  return /^\/[A-Za-z0-9\-/_]*\/?$/.test(n) && !n.startsWith("//") ? n : "/account/";
}
