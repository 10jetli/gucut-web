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

export async function currentUser(req, s) {
  const tok = readCookie(req, COOKIE);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(tok)) return null;
  const sess = await s.get(`s/${tok}`, { type: "json" }).catch(() => null);
  if (!sess?.phone) return null;
  const u = await s.get(`u/${sess.phone}`, { type: "json" }).catch(() => null);
  return u ? { user: u, token: tok } : null;
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
