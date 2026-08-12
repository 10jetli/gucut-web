// เข้าสู่ระบบด้วย LINE — /api/oauth/line
//
//   GET /api/oauth/line?next=/cart/     พาไปหน้าอนุญาตของ LINE
//   GET /api/oauth/line/callback        LINE ส่งกลับมาที่นี่พร้อม code
//
// ต้องตั้ง env 2 ตัวที่ Netlify → Site settings → Environment variables:
//   LINE_CHANNEL_ID       Channel ID จาก developers.line.biz (ช่อง LINE Login)
//   LINE_CHANNEL_SECRET   Channel secret ของช่องเดียวกัน
// และที่หน้า LINE Login → Callback URL ให้ใส่:
//   https://new78.com/api/oauth/line/callback
//
// ความปลอดภัย
// - state สุ่มทุกครั้ง เก็บทั้งใน Blobs และ cookie ต้องตรงกันถึงผ่าน (กัน CSRF)
// - id_token ส่งให้ LINE ตรวจลายเซ็นให้ ไม่ได้ถอดเอง (กัน token ปลอม)
// - next รับเฉพาะ path ในเว็บเรา (กันถูกพาไปเว็บหลอก)
import {
  LINK_COOKIE, OAUTH_COOKIE, clean, json, killShort, newSession, newToken,
  redirect, readCookie, safeNext, setCookie, shortCookie, store,
} from "../lib/session.mjs";

const AUTHORIZE = "https://access.line.me/oauth2/v2.1/authorize";
const TOKEN = "https://api.line.me/oauth2/v2.1/token";
const VERIFY = "https://api.line.me/oauth2/v2.1/verify";
const STATE_TTL = 10 * 60 * 1000;   // ต้องกลับมาภายใน 10 นาที

export default async function handler(req) {
  const url = new URL(req.url);
  const id = process.env.LINE_CHANNEL_ID;
  const secret = process.env.LINE_CHANNEL_SECRET;
  const callback = `${url.origin}/api/oauth/line/callback`;

  if (!id || !secret) {
    return fail("ร้านยังไม่ได้เปิดการเข้าสู่ระบบด้วย LINE", "/account/login/");
  }

  let s;
  try { s = store(); } catch { return fail("ระบบขัดข้อง ลองใหม่อีกครั้ง", "/account/login/"); }

  // ---------- ขั้นที่ 1: พาไป LINE ----------
  if (!url.pathname.endsWith("/callback")) {
    const state = newToken();
    await s.setJSON(`os/${state}`, { next: safeNext(url.searchParams.get("next")), at: Date.now() });

    const go = new URL(AUTHORIZE);
    go.searchParams.set("response_type", "code");
    go.searchParams.set("client_id", id);
    go.searchParams.set("redirect_uri", callback);
    go.searchParams.set("state", state);
    go.searchParams.set("scope", "profile openid");
    return redirect(go.toString(), shortCookie(OAUTH_COOKIE, state, 600));
  }

  // ---------- ขั้นที่ 2: LINE ส่งกลับมา ----------
  const err = url.searchParams.get("error");
  if (err) {
    // ลูกค้ากดยกเลิกที่หน้า LINE — ไม่ใช่ความผิดพลาด พากลับเงียบ ๆ
    return redirect("/account/login/", killShort(OAUTH_COOKIE));
  }

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state || state !== readCookie(req, OAUTH_COOKIE)) {
    return fail("ลิงก์เข้าสู่ระบบไม่ถูกต้อง กดเข้าสู่ระบบด้วย LINE ใหม่อีกครั้ง", "/account/login/");
  }

  const saved = await s.get(`os/${state}`, { type: "json" }).catch(() => null);
  await s.delete(`os/${state}`).catch(() => {});
  if (!saved || Date.now() - (saved.at || 0) > STATE_TTL) {
    return fail("หมดเวลาเข้าสู่ระบบ กดใหม่อีกครั้งครับ", "/account/login/");
  }
  const next = safeNext(saved.next);

  // แลก code เป็น token
  let profile;
  try {
    const tokenRes = await fetch(TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: callback,
        client_id: id,
        client_secret: secret,
      }),
    });
    const tok = await tokenRes.json();
    if (!tokenRes.ok || !tok.id_token) throw new Error(tok.error_description || "token failed");

    // ให้ LINE ตรวจลายเซ็น id_token ให้ ปลอดภัยกว่าถอดเอง
    const vRes = await fetch(VERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: tok.id_token, client_id: id }),
    });
    const v = await vRes.json();
    if (!vRes.ok || !v.sub) throw new Error(v.error_description || "verify failed");
    profile = { lineId: String(v.sub), name: clean(v.name, 60), picture: String(v.picture || "").slice(0, 300) };
  } catch {
    return fail("ต่อกับ LINE ไม่สำเร็จ ลองใหม่อีกครั้ง หรือเข้าสู่ระบบด้วยเบอร์โทร", "/account/login/");
  }

  // เคยผูกเบอร์ไว้แล้ว → เข้าระบบได้เลย
  const link = await s.get(`l/${profile.lineId}`, { type: "json" }).catch(() => null);
  if (link?.phone) {
    const u = await s.get(`u/${link.phone}`, { type: "json" }).catch(() => null);
    if (u) {
      // อัปเดตชื่อ/รูปจาก LINE ให้ทันสมัย
      u.line = { ...(u.line || {}), id: profile.lineId, name: profile.name, picture: profile.picture };
      await s.setJSON(`u/${u.phone}`, u);
      const token = await newSession(s, u.phone);
      return redirect(next, [setCookie(token, true), killShort(OAUTH_COOKIE)]);
    }
  }

  // ยังไม่เคยผูก → พักไว้ก่อน แล้วให้กรอกเบอร์ที่หน้า /account/link/
  const pending = newToken();
  await s.setJSON(`pl/${pending}`, { ...profile, at: Date.now() });
  return redirect("/account/link/", [
    shortCookie(LINK_COOKIE, pending, 1200),
    killShort(OAUTH_COOKIE),
  ]);
}

/** พากลับหน้าล็อกอินพร้อมข้อความ — หน้าเว็บอ่าน ?err= ไปแสดง */
function fail(message, path) {
  return redirect(`${path}?err=${encodeURIComponent(message)}`, killShort(OAUTH_COOKIE));
}

export const config = { path: ["/api/oauth/line", "/api/oauth/line/callback"] };
