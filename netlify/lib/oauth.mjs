// เข้าสู่ระบบด้วยบัญชีภายนอก (LINE / Facebook) — ตัวกลางที่ใช้ร่วมกัน
//
//   GET /api/oauth/<เจ้า>?next=/cart/   พาไปหน้าอนุญาตของเจ้านั้น
//   GET /api/oauth/<เจ้า>/callback      เจ้านั้นส่งกลับมาพร้อม code
//
// ทุกเจ้าใช้ทางเดินเดียวกัน ต่างกันแค่ URL กับวิธีขอโปรไฟล์ (ดู PROVIDERS ล่างสุด)
//
// ความปลอดภัยที่บังคับทุกเจ้า
// - state สุ่มทุกครั้ง เก็บทั้งใน Blobs และ cookie ต้องตรงกันถึงผ่าน (กัน CSRF)
// - state ผูกกับชื่อเจ้า เอา state ของ LINE มายิง callback ของ Facebook ไม่ได้
// - ปลายทางหลังล็อกอินรับเฉพาะ path ในเว็บเรา (กัน open redirect)
// - ไม่เชื่อ token ดิบ ๆ ต้องให้เจ้าของ token ยืนยันกลับมาก่อนทุกครั้ง
import { createHmac } from "node:crypto";
import {
  LINK_COOKIE, OAUTH_COOKIE, clean, killShort, newSession, newToken,
  readCookie, redirect, safeNext, setCookie, shortCookie, store,
} from "./session.mjs";

const STATE_TTL = 10 * 60 * 1000;   // ต้องกลับมาภายใน 10 นาที

export async function handleOAuth(req, provider) {
  const url = new URL(req.url);
  const clientId = process.env[provider.envId];
  const clientSecret = process.env[provider.envSecret];
  const callback = `${url.origin}/api/oauth/${provider.id}/callback`;

  if (!clientId || !clientSecret) {
    return fail(`ร้านยังไม่ได้เปิดการเข้าสู่ระบบด้วย ${provider.label}`);
  }

  let s;
  try { s = store(); } catch { return fail("ระบบขัดข้อง ลองใหม่อีกครั้ง"); }

  // ---------- ขั้นที่ 1: พาไปหน้าอนุญาต ----------
  if (!url.pathname.endsWith("/callback")) {
    const state = newToken();
    await s.setJSON(`os/${state}`, {
      provider: provider.id,
      next: safeNext(url.searchParams.get("next")),
      at: Date.now(),
    });
    const go = provider.authorizeUrl({ clientId, callback, state });
    return redirect(go, shortCookie(OAUTH_COOKIE, state, 600));
  }

  // ---------- ขั้นที่ 2: ส่งกลับมา ----------
  // ลูกค้ากดยกเลิกที่หน้าอนุญาต — ไม่ใช่ความผิดพลาด พากลับเงียบ ๆ
  if (url.searchParams.get("error")) {
    return redirect("/account/login/", killShort(OAUTH_COOKIE));
  }

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state || state !== readCookie(req, OAUTH_COOKIE)) {
    return fail(`ลิงก์เข้าสู่ระบบไม่ถูกต้อง กดเข้าสู่ระบบด้วย ${provider.label} ใหม่อีกครั้ง`);
  }

  const saved = await s.get(`os/${state}`, { type: "json" }).catch(() => null);
  await s.delete(`os/${state}`).catch(() => {});
  if (!saved || saved.provider !== provider.id || Date.now() - (saved.at || 0) > STATE_TTL) {
    return fail("หมดเวลาเข้าสู่ระบบ กดใหม่อีกครั้งครับ");
  }
  const next = safeNext(saved.next);

  let profile;
  try {
    profile = await provider.getProfile({ code, callback, clientId, clientSecret });
    if (!profile?.id) throw new Error("no id");
    profile = {
      id: String(profile.id),
      name: clean(profile.name, 60),
      picture: String(profile.picture || "").slice(0, 300),
    };
  } catch {
    return fail(`ต่อกับ ${provider.label} ไม่สำเร็จ ลองใหม่อีกครั้ง หรือเข้าสู่ระบบด้วยเบอร์โทร`);
  }

  // เคยผูกเบอร์ไว้แล้ว → เข้าระบบได้เลย
  const phone = await findLinkedPhone(s, provider.id, profile.id);
  if (phone) {
    const u = await s.get(`u/${phone}`, { type: "json" }).catch(() => null);
    if (u) {
      // อัปเดตชื่อ/รูปให้ทันสมัย
      u.social = { ...(u.social || {}), [provider.id]: profile };
      await s.setJSON(`u/${phone}`, u);
      const token = await newSession(s, phone);
      return redirect(next, [setCookie(token, true), killShort(OAUTH_COOKIE)]);
    }
  }

  // ยังไม่เคยผูก → พักไว้ก่อน แล้วให้กรอกเบอร์ที่หน้า /account/link/
  const pending = newToken();
  await s.setJSON(`pl/${pending}`, {
    provider: provider.id,
    label: provider.label,
    ...profile,
    at: Date.now(),
  });
  return redirect("/account/link/", [
    shortCookie(LINK_COOKIE, pending, 1200),
    killShort(OAUTH_COOKIE),
  ]);
}

/**
 * หาเบอร์ที่ผูกกับบัญชีภายนอกนี้
 * `l/<id>` คือรูปแบบเดิมสมัยมีแต่ LINE — ยังอ่านต่อให้คนที่ผูกไว้แล้วเข้าได้เหมือนเดิม
 */
export async function findLinkedPhone(s, providerId, externalId) {
  const cur = await s.get(`oa/${providerId}/${externalId}`, { type: "json" }).catch(() => null);
  if (cur?.phone) return cur.phone;
  if (providerId === "line") {
    const old = await s.get(`l/${externalId}`, { type: "json" }).catch(() => null);
    if (old?.phone) return old.phone;
  }
  return null;
}

/** พากลับหน้าล็อกอินพร้อมข้อความ — หน้าเว็บอ่าน ?err= ไปแสดง */
function fail(message) {
  return redirect(`/account/login/?err=${encodeURIComponent(message)}`, killShort(OAUTH_COOKIE));
}

const form = (obj) => new URLSearchParams(obj);
async function postForm(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.error?.message || "request failed");
  return d;
}
async function getJson(url) {
  const r = await fetch(url);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || d.error_description || "request failed");
  return d;
}

/* ==================== แต่ละเจ้า ==================== */

export const LINE = {
  id: "line",
  label: "LINE",
  envId: "LINE_CHANNEL_ID",
  envSecret: "LINE_CHANNEL_SECRET",

  authorizeUrl({ clientId, callback, state }) {
    const u = new URL("https://access.line.me/oauth2/v2.1/authorize");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", clientId);
    u.searchParams.set("redirect_uri", callback);
    u.searchParams.set("state", state);
    u.searchParams.set("scope", "profile openid");
    return u.toString();
  },

  async getProfile({ code, callback, clientId, clientSecret }) {
    const tok = await postForm("https://api.line.me/oauth2/v2.1/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: callback,
      client_id: clientId,
      client_secret: clientSecret,
    });
    if (!tok.id_token) throw new Error("no id_token");
    // ให้ LINE ตรวจลายเซ็น id_token ให้ ปลอดภัยกว่าถอดเอง
    const v = await postForm("https://api.line.me/oauth2/v2.1/verify", {
      id_token: tok.id_token,
      client_id: clientId,
    });
    return { id: v.sub, name: v.name, picture: v.picture };
  },
};

export const FACEBOOK = {
  id: "facebook",
  label: "Facebook",
  envId: "FACEBOOK_APP_ID",
  envSecret: "FACEBOOK_APP_SECRET",

  authorizeUrl({ clientId, callback, state }) {
    const u = new URL(`https://www.facebook.com/${fbVersion()}/dialog/oauth`);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", clientId);
    u.searchParams.set("redirect_uri", callback);
    u.searchParams.set("state", state);
    u.searchParams.set("scope", "public_profile");   // ขอแค่ชื่อกับรูป ไม่ขออย่างอื่น
    return u.toString();
  },

  async getProfile({ code, callback, clientId, clientSecret }) {
    const t = new URL(`https://graph.facebook.com/${fbVersion()}/oauth/access_token`);
    t.searchParams.set("client_id", clientId);
    t.searchParams.set("client_secret", clientSecret);
    t.searchParams.set("redirect_uri", callback);
    t.searchParams.set("code", code);
    const tok = await getJson(t.toString());
    if (!tok.access_token) throw new Error("no access_token");

    // appsecret_proof = ลายเซ็นที่พิสูจน์ว่า token นี้ถูกใช้จากเซิร์ฟเวอร์เราจริง
    // ถึง token หลุดออกไป คนอื่นก็เอาไปเรียกแทนเราไม่ได้
    const proof = createHmac("sha256", clientSecret).update(tok.access_token).digest("hex");

    const me = new URL(`https://graph.facebook.com/${fbVersion()}/me`);
    me.searchParams.set("fields", "id,name,picture.width(200)");
    me.searchParams.set("access_token", tok.access_token);
    me.searchParams.set("appsecret_proof", proof);
    const p = await getJson(me.toString());
    return { id: p.id, name: p.name, picture: p.picture?.data?.url };
  },
};

// Facebook เลิกใช้เวอร์ชันเก่าเป็นรอบ ๆ เปลี่ยนที่ env ได้ไม่ต้องแก้โค้ด
const fbVersion = () => process.env.FACEBOOK_API_VERSION || "v23.0";
