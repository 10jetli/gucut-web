// เชื่อมบัญชี TikTok ปลายทางของระบบกระจายคลิป (20 ต.ค. 2569 — ท่านประธานสั่ง)
//
//   facebook.com/AJt8888  →  tiktok.com/@ajtcut_8   (บัญชีของท่านประธานเอง)
//
// 🔑 **ทำไมเป็นเส้นของตัวเอง ไม่ไปรวมกับ `/api/tiktok/callback` ที่มีอยู่**
//    เส้นนั้นเป็นของ **TikTok Shop** (Partner Center · service id · ของร้านค้า)
//    ส่วนเส้นนี้เป็นของ **TikTok for Developers** (Content Posting API · client key)
//    📏 วัดแล้ว 20 ต.ค. 2569: สองอย่างนี้เป็น **คนละแพลตฟอร์ม คนละ onboarding คนละคีย์**
//       และขอบเขตฝั่ง Shop **ไม่มี `video.publish` ให้ขอเลย** (ไม่ใช่ว่าเราไม่ได้ขอ)
//    ⇒ เอามารวมเส้นเดียวกันคือการเอาคีย์สองระบบมาปนกัน ซึ่งจะพังแบบหาสาเหตุยาก
//
// 🔐 **สามด่าน — ลอกโครงจาก `oauth-youtube.mjs` ที่พิสูจน์แล้ววันนี้ว่าใช้ได้จริง**
//  ① เริ่มได้เฉพาะคนที่มีรหัสหลังร้าน ⇒ คนแปลกหน้าเอาบัญชีตัวเองมาทับปลายทางเราไม่ได้
//  ② state ใช้ได้ครั้งเดียว และหมดอายุ (ลบทิ้งทันทีที่ใช้)
//  ③ **ยืนยันว่าเป็นบัญชีที่ตั้งใจจริง ๆ ก่อนเก็บกุญแจ**
//     🔴 ข้อ ③ คือด่านที่แพงที่สุดถ้าไม่มี — คลิปขึ้นบัญชีผิดแล้วกู้คืนยาก
//        และวันนี้ (20 ต.ค.) เราเพิ่งเสียเวลาทั้งวันกับคลิปซ้ำบนช่อง YouTube
//     ⚠️ **ต้องเทียบ `username` ไม่ใช่ `display_name`**
//        `display_name` ของบัญชีนี้คือ **"อ.ธง"** ซึ่งเป็นชื่อเดียวกับเพจ FB และช่อง YouTube
//        ⇒ ไม่ unique และเปลี่ยนได้ตลอด ⇒ เทียบชื่อที่แสดงคือด่านหลอก
//     📏 และ `username` ต้องขอ scope **`user.info.profile`** (เอกสาร TikTok · วัด 20 ต.ค.)
//        `user.info.basic` ให้แค่ `open_id` + `display_name` ⇒ **ขอ basic ตัวเดียว = ด่านนี้ทำไม่ได้**
//
// 🚫 **refresh token ไม่เคยออกจากเซิร์ฟเวอร์** — g1 ขอได้แค่ access token ผ่าน `?token=1`
//    เหตุ: บน g1 ทุก agent รันเป็นผู้ใช้เดียวกัน (`jetli`) ⇒ mode 600 ไม่กันอะไรเลย
//    (กติกาเดียวกับ YouTube ซึ่งพิสูจน์แล้ววันนี้ว่าตัวอัปทำงานได้โดยไม่ต้องถือกุญแจถาวร)
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";

const บัญชีที่ตั้งใจ = "ajtcut_8";              // ท่านประธานยืนยัน 20 ต.ค. 2569 ว่าเป็นบัญชีของท่านเอง
/* ⏱️ 30 นาที — ไม่ใช่ 10 นาทีแบบ YouTube **โดยตั้งใจ**
   🔴 ของจริงวันนี้: เขียนลิงก์ยินยอมลงไฟล์ให้ท่านกดทีหลัง แล้วลิงก์หมดอายุก่อนท่านเห็น
      จนต้องตั้ง timer เติมลิงก์ใหม่ทุก 8 นาที
   เส้นนี้ CEO จะพาท่านกดสด ⇒ 30 นาทีพอดีกับการนัดกันจริง และยังสั้นพอที่ลิงก์หลุดไปก็ตายเร็ว
   ⚠️ ความปลอดภัยไม่ได้พึ่งอายุลิงก์เป็นหลัก — พึ่ง **ด่าน ③** ที่ไม่เก็บกุญแจถ้าบัญชีไม่ตรง */
const STATE_TTL = 30 * 60 * 1000;
/* ขอบเขตที่ขอ — เรียงเหตุผลไว้ให้ครบ เพราะคนที่ไปสร้างแอปต้องติ๊กให้ตรงนี้เป๊ะ
   · video.publish      = ลงคลิปขึ้นบัญชีเลย (Direct Post)
   · video.upload       = ทางถอย: ส่งเข้ากล่องร่างให้คนกดลงเอง ถ้า publish ใช้ไม่ได้
   · user.info.basic    = open_id (ใช้เป็นกุญแจระบุบัญชีในภายหลัง)
   · user.info.profile  = **username** ⇒ จำเป็นต่อด่าน ③ ขาดตัวนี้ด่านทำงานไม่ได้ */
const SCOPE = "user.info.basic,user.info.profile,video.publish,video.upload";
const AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
const USERINFO = "https://open.tiktokapis.com/v2/user/info/";

const store = () => getStore({ name: "gucut-coupon", consistency: "strong" });
const คีย์กุญแจ = "tt/refresh";

const json = (o, status = 200) => new Response(JSON.stringify(o, null, 1), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
/** หน้าผลลัพธ์ — ติด **รหัสผลที่เครื่องอ่านได้** ไว้ในหัวเอกสารด้วย
 *  🔑 เหตุ: ถ้าตัวทดสอบต้องผูกกับ **ถ้อยคำไทย** บนหน้าจอ เราจะแก้คำไม่ได้อีกเลย
 *     และวันหนึ่งคำเปลี่ยนแล้วด่านแดงโดยที่พฤติกรรมไม่ได้เสีย (แดงลวง)
 *  ⇒ ถ้อยคำเป็นของคนอ่าน · `รหัสผล` เป็นของเครื่อง · สองอย่างเปลี่ยนแยกกันได้ */
const หน้า = (หัว, เนื้อ, สี = "#0a7", รหัสผล = "") => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
   ${รหัสผล ? `<meta name="gucut-ผล" content="${รหัสผล}">` : ""}
   <title>${หัว}</title>
   <body style="font-family:system-ui;max-width:34rem;margin:3rem auto;padding:0 1.2rem;line-height:1.7">
   <h1 style="color:${สี};font-size:1.3rem">${หัว}</h1><p>${เนื้อ}</p></body>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

const สุ่ม = () => [...crypto.getRandomValues(new Uint8Array(24))]
  .map((b) => b.toString(16).padStart(2, "0")).join("");

/** แลกโทเคนกับ TikTok — ใช้ทั้งตอนรับ code และตอนต่ออายุ
 *  ⚠️ TikTok ตอบ **HTTP 200 พร้อมช่อง `error`** ได้ ⇒ เช็ค `error` ไม่ใช่เช็คแต่ status
 *     (คลาสเดียวกับ Lazada ที่ทีมเก็บเป็นบทเรียนแล้ว) */
async function แลกโทเคน(พารามิเตอร์) {
  const r = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_VIDEO_CLIENT_KEY || "",
      client_secret: process.env.TIKTOK_VIDEO_CLIENT_SECRET || "",
      ...พารามิเตอร์,
    }),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok && !d.error, d };
}

/** อ่านว่าโทเคนนี้เป็นของบัญชีไหน — คืน { username, display_name, open_id } หรือ { เหตุ } */
async function บัญชีของโทเคน(at) {
  const u = `${USERINFO}?fields=open_id,union_id,username,display_name`;
  const r = await fetch(u, { headers: { authorization: `Bearer ${at}` } });
  const d = await r.json().catch(() => ({}));
  /* รูปคำตอบของ TikTok: { data: { user: {...} }, error: { code: "ok" | ... } }
     ⚠️ `error.code === "ok"` คือ "สำเร็จ" ⇒ อย่าอ่านว่า "มี error แปลว่าพัง" */
  const user = d?.data?.user;
  if (!r.ok || !user) {
    return { เหตุ: d?.error?.message || d?.error?.code || `HTTP ${r.status}` };
  }
  return user;
}

export default async (req) => {
  const url = new URL(req.url);
  const ck = process.env.TIKTOK_VIDEO_CLIENT_KEY;
  const cs = process.env.TIKTOK_VIDEO_CLIENT_SECRET;
  /* ⚠️ ชื่อตัวแปรต้องไม่ชนกับ `TIKTOK_APP_KEY`/`TIKTOK_APP_SECRET` ของแอป Shop
     หยิบข้ามคู่ = ตอบ invalid client ซึ่ง "หลอกตามาก ดูเหมือนคีย์เสีย ทั้งที่หยิบผิดตัว"
     (คลาสเดียวกับที่ CLAUDE.md จดไว้เรื่องคีย์ Netlify AI Gateway) */
  if (!ck || !cs) {
    return json({ ok: false,
      เหตุ: "ยังไม่ได้ตั้ง TIKTOK_VIDEO_CLIENT_KEY / TIKTOK_VIDEO_CLIENT_SECRET",
      บอก: "สองตัวนี้เป็นของแอป TikTok for Developers (Content Posting API) " +
           "คนละตัวกับ TIKTOK_APP_KEY/SECRET ของ TikTok Shop — ห้ามใช้ปนกัน" }, 503);
  }
  const callback = `${url.origin}/api/oauth/tiktok-video/callback`;
  const s = store();

  // ───────── ขั้น ③ g1 ขอ access token ไปใช้อัปคลิป ─────────
  if (url.searchParams.get("token") === "1") {
    const g = await adminGate(req);
    /* ⚠️ `adminGate` คืน `deny: null` เมื่อไม่ได้ส่งรหัสมาเลย (ไม่ใช่ Response)
       เขียน `return g.deny` ตรง ๆ = คืน null ⇒ Netlify ตอบ
       "Function returned an unsupported value" **ทุกคำขอ** (บทเรียน 25 ส.ค. 2569) */
    if (!g.ok) return g.deny || json({ ok: false, เหตุ: "ต้องมีรหัสหลังร้าน (x-admin-key)" }, 401);
    const เก่า = await s.get(คีย์กุญแจ, { type: "json" }).catch(() => null);
    if (!เก่า?.refresh_token) return json({ ok: false, เหตุ: "ยังไม่ได้เชื่อมบัญชี TikTok" }, 409);
    const { ok, d } = await แลกโทเคน({
      grant_type: "refresh_token", refresh_token: เก่า.refresh_token,
    });
    if (!ok || !d.access_token) {
      return json({ ok: false, เหตุ: d.error || "ต่ออายุโทเคนไม่ได้",
                    อธิบาย: d.error_description || "",
                    แนะนำ: "ถ้าเป็น invalid_grant ⇒ กุญแจถูกถอนหรือหมดอายุ ให้เชื่อมบัญชีใหม่" }, 502);
    }
    /* 🔑 TikTok **เปลี่ยน refresh token ตัวใหม่ทุกครั้งที่ต่ออายุ** ⇒ ต้องเขียนทับเสมอ
       ไม่เขียนทับ = ใช้ได้อีกไม่กี่รอบแล้วตาย โดยตอนแรกดูเหมือนทำงานปกติ
       (คลาสเดียวกับ Lazada ที่ทีมจดไว้: refresh_token เปลี่ยนตัวทุกครั้งที่ต่อ) */
    if (d.refresh_token && d.refresh_token !== เก่า.refresh_token) {
      await s.setJSON(คีย์กุญแจ, { ...เก่า, refresh_token: d.refresh_token, ต่อเมื่อ: new Date().toISOString() });
    }
    return json({ ok: true, access_token: d.access_token, expires_in: d.expires_in,
                  open_id: เก่า.open_id || null });
  }

  // ───────── ขั้น ① ขอลิงก์ยินยอม (ต้องมีรหัสหลังร้าน) ─────────
  if (!url.pathname.endsWith("/callback")) {
    const g = await adminGate(req);
    if (!g.ok) return g.deny || json({ ok: false, เหตุ: "ต้องมีรหัสหลังร้าน (x-admin-key)" }, 401);
    const state = สุ่ม();
    await s.setJSON(`tt/state/${state}`, { at: Date.now() });
    const u = new URL(AUTH);
    u.searchParams.set("client_key", ck);
    u.searchParams.set("scope", SCOPE);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", callback);
    u.searchParams.set("state", state);
    return json({ ok: true, ลิงก์: u.toString(),
                  หมดอายุนาที: STATE_TTL / 60000,
                  บอก: `เปิดลิงก์นี้แล้วยินยอมด้วยบัญชี @${บัญชีที่ตั้งใจ} เท่านั้น — ` +
                       "บัญชีอื่นเซิร์ฟเวอร์จะไม่เก็บกุญแจและขึ้นหน้าแดง" });
  }

  // ───────── ขั้น ② TikTok ส่งกลับมา ─────────
  if (url.searchParams.get("error")) {
    return หน้า("ยกเลิกการเชื่อมบัญชี", "ไม่มีอะไรถูกบันทึก เชื่อมใหม่ได้ตลอด", "#b45309", "ผู้ใช้ยกเลิก");
  }
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state) return หน้า("ลิงก์ไม่ถูกต้อง", "ขอลิงก์ใหม่จากหลังร้าน", "#b91c1c", "ลิงก์ไม่ถูกต้อง");

  const saved = await s.get(`tt/state/${state}`, { type: "json" }).catch(() => null);
  await s.delete(`tt/state/${state}`).catch(() => {});        // ใช้ได้ครั้งเดียว
  if (!saved || Date.now() - (saved.at || 0) > STATE_TTL) {
    return หน้า("ลิงก์หมดอายุ",
      `ลิงก์ยินยอมใช้ได้ ${STATE_TTL / 60000} นาทีและใช้ได้ครั้งเดียว — ขอใหม่จากหลังร้าน`, "#b91c1c", "ลิงก์หมดอายุ");
  }

  const { ok, d } = await แลกโทเคน({
    grant_type: "authorization_code", code, redirect_uri: callback,
  });
  if (!ok || !d.access_token) {
    return หน้า("แลกกุญแจไม่สำเร็จ",
      String(d.error_description || d.error || "ไม่ทราบสาเหตุ"), "#b91c1c", "แลกกุญแจไม่สำเร็จ");
  }
  if (!d.refresh_token) {
    /* 🔴 ไม่มี refresh token = ใช้ได้ไม่กี่ชั่วโมงแล้วตาย — ห้ามเก็บแล้วบอกว่าสำเร็จ */
    return หน้า("ยังใช้ไม่ได้ — ไม่ได้ refresh token",
      "TikTok ไม่ได้ส่งกุญแจถาวรมา ⇒ ระบบจะใช้ได้ชั่วคราวแล้วตายเงียบ " +
      "ให้ถอนสิทธิ์แอปในแอป TikTok (โปรไฟล์ → ความเป็นส่วนตัว → แอปที่เชื่อมต่อ) แล้วเชื่อมใหม่", "#b91c1c", "ไม่ได้refreshtoken");
  }

  // ③ ยืนยันบัญชีก่อนเก็บ — เทียบ username ไม่ใช่ display_name
  const user = await บัญชีของโทเคน(d.access_token);
  if (user.เหตุ) {
    return หน้า("อ่านชื่อบัญชีไม่ได้ — ไม่บันทึกกุญแจ",
      `ขอโทเคนได้ แต่ถาม TikTok ว่าเป็นบัญชีไหนไม่ได้ (${user.เหตุ})<br>` +
      "ถ้าข้อความบอกว่าไม่มีสิทธิ์ ให้เพิ่มขอบเขต <b>user.info.profile</b> ในแอป " +
      "(ขอบเขตนี้คือตัวที่ทำให้อ่าน username ได้ — ขาดแล้วด่านตรวจบัญชีทำงานไม่ได้)", "#b91c1c", "อ่านบัญชีไม่ได้");
  }
  const ชื่อบัญชี = String(user.username || "").toLowerCase().replace(/^@/, "");
  if (ชื่อบัญชี !== บัญชีที่ตั้งใจ.toLowerCase()) {
    /* 🔴 ยินยอมผิดบัญชี = คลิปขึ้นบัญชีคนอื่น แล้วกู้คืนยาก ⇒ ไม่เก็บอะไรเลย */
    return หน้า("บัญชีไม่ตรง — ไม่บันทึกกุญแจ",
      `บัญชีที่กดยินยอมคือ <b>@${ชื่อบัญชี || "(อ่านไม่ได้)"}</b> ` +
      `(ชื่อที่แสดง: ${user.display_name || "—"}) ไม่ใช่ <b>@${บัญชีที่ตั้งใจ}</b><br>` +
      "ออกจากบัญชีในแอป TikTok แล้วยินยอมใหม่ด้วยบัญชีที่ถูกต้อง", "#b91c1c", "บัญชีไม่ตรง");
  }

  await s.setJSON(คีย์กุญแจ, {
    refresh_token: d.refresh_token,
    open_id: d.open_id || user.open_id || "",
    username: ชื่อบัญชี,
    scope: d.scope || SCOPE,
    เมื่อ: new Date().toISOString(),
  });
  return หน้า("เชื่อมบัญชีสำเร็จ ✅",
    `ระบบจะลงคลิปขึ้นบัญชี <b>@${ชื่อบัญชี}</b> (${user.display_name || ""})<br>` +
    "⚠️ ก่อนแอปผ่าน audit ของ TikTok <b>คลิปทุกใบจะเป็นส่วนตัวโดยบังคับ</b> " +
    "ซึ่งตรงกับข้อตกลงของเราในช่วงวิ่งคู่อยู่แล้ว", "#0a7", "สำเร็จ");
};

export const config = { path: ["/api/oauth/tiktok-video", "/api/oauth/tiktok-video/callback"] };
