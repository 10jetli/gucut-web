// เชื่อมช่อง YouTube ปลายทางของระบบคัดลอกคลิป (18 ต.ค. 2569 — ท่านประธานสั่ง)
//
//   facebook.com/AJt8888  →  youtube.com/@AJT8888-o9e  (ช่อง "อ.ธง")
//
// 🔑 **ทำไมไม่ใช้ `handleOAuth` ร่วมกับปุ่มล็อกอินลูกค้า**
//    ทางนั้นจบด้วยการ "สร้างเซสชันลูกค้า" ซึ่งไม่ใช่สิ่งที่เราต้องการเลย
//    และถ้าเอามาปนกัน คนแปลกหน้าที่กดยินยอมจะได้เซสชันในเว็บเราไปด้วย
//    ⇒ แยกเป็นเส้นของตัวเอง สั้นกว่า อ่านง่ายกว่า และพลาดยากกว่า
//
// 🔐 **สามด่านความปลอดภัย — ห้ามถอดข้อไหน**
//  ① เริ่มได้เฉพาะคนที่มีรหัสหลังร้าน (`?arm=1` + `x-admin-key`)
//     ไม่มีด่านนี้ = ใครก็กดลิงก์แล้วเอา **ช่องของตัวเอง** มาทับช่องปลายทางของเรา
//     แล้วคลิปร้านจะไหลไปขึ้นช่องคนแปลกหน้าโดยไม่มีอะไรฟ้อง
//  ② state ใช้ได้ครั้งเดียวและหมดอายุใน 10 นาที (ลบทิ้งทันทีที่ใช้)
//  ③ **ยืนยันว่าเป็นช่องที่ตั้งใจจริง ๆ ก่อนเก็บกุญแจ**
//     ยินยอมด้วยบัญชี Google ผิดตัวเป็นเรื่องที่เกิดง่ายมาก (คนส่วนใหญ่ล็อกอินหลายบัญชี)
//     และกู้คืนยาก เพราะกว่าจะรู้ก็มีคลิปขึ้นช่องผิดไปแล้ว
//
// 🚫 **refresh token ไม่เคยออกจากเซิร์ฟเวอร์** — g1 ขอได้แค่ access token อายุ 1 ชม.
//    ผ่าน `?token=1` (ต้องมีรหัสหลังร้าน) ⇒ กุญแจตัวจริงหลุดจากเครื่องที่บ้านไม่ได้
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";

const CH = "@AJT8888-o9e";                     // ช่องปลายทางที่ท่านประธานระบุ 18 ต.ค. 2569
const STATE_TTL = 10 * 60 * 1000;
const SCOPE = "https://www.googleapis.com/auth/youtube.upload " +
              "https://www.googleapis.com/auth/youtube.readonly";

const store = () => getStore({ name: "gucut-coupon", consistency: "strong" });
const คีย์กุญแจ = "yt/refresh";

const json = (o, status = 200) => new Response(JSON.stringify(o, null, 1), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const หน้า = (หัว, เนื้อ, สี = "#0a7") => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
   <title>${หัว}</title>
   <body style="font-family:system-ui;max-width:34rem;margin:3rem auto;padding:0 1.2rem;line-height:1.7">
   <h1 style="color:${สี};font-size:1.3rem">${หัว}</h1><p>${เนื้อ}</p></body>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

const สุ่ม = () => [...crypto.getRandomValues(new Uint8Array(24))]
  .map((b) => b.toString(16).padStart(2, "0")).join("");

/** แลก refresh token เป็น access token — ใช้ทั้งตอนตรวจช่องและตอน g1 ขอใช้งาน */
async function ขอAccessToken(refresh) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  return { ok: r.ok, d: await r.json().catch(() => ({})) };
}

export default async (req) => {
  const url = new URL(req.url);
  const cid = process.env.GOOGLE_CLIENT_ID;
  const cs = process.env.GOOGLE_CLIENT_SECRET;
  if (!cid || !cs) return json({ ok: false, เหตุ: "ยังไม่ได้ตั้ง GOOGLE_CLIENT_ID/SECRET" }, 503);
  const callback = `${url.origin}/api/oauth/youtube/callback`;
  const s = store();

  // ───────── ขั้น ③ g1 ขอ access token ไปใช้อัปคลิป ─────────
  if (url.searchParams.get("token") === "1") {
    const g = await adminGate(req);
    /* ⚠️ `adminGate` คืน `deny: null` เมื่อ **ไม่ได้ส่งรหัสมาเลย** (ไม่ใช่ Response)
       เขียน `return g.deny` ตรง ๆ = คืน null ⇒ Netlify ตอบ
       "Function returned an unsupported value" ทุกคำขอ รวมทั้งของร้านเอง
       (บทเรียนเดิม 25 ส.ค. 2569 ที่เขียนไว้ใน CLAUDE.md แล้ว — และ `node --check` ไม่จับ) */
    if (!g.ok) return g.deny || json({ ok: false, เหตุ: "ต้องมีรหัสหลังร้าน (x-admin-key)" }, 401);
    const refresh = await s.get(คีย์กุญแจ, { type: "text" }).catch(() => null);
    if (!refresh) return json({ ok: false, เหตุ: "ยังไม่ได้เชื่อมช่อง YouTube" }, 409);
    const { ok, d } = await ขอAccessToken(refresh);
    if (!ok || !d.access_token) {
      /* 🔴 invalid_grant = กุญแจตาย (เคสแอปค้างสถานะ Testing 7 วัน)
         ต้องบอกเหตุตรง ๆ ห้ามตอบ 500 เปล่า ๆ ไม่งั้นคนไล่ผิดทางทั้งวัน */
      return json({ ok: false, เหตุ: d.error || "แลก token ไม่ได้",
                    อธิบาย: d.error_description || "",
                    แนะนำ: d.error === "invalid_grant"
                      ? "กุญแจหมดอายุ/ถูกถอน — ถ้าแอปใน Google Console ยังเป็น Testing ให้กด PUBLISH APP แล้วเชื่อมช่องใหม่"
                      : "" }, 502);
    }
    return json({ ok: true, access_token: d.access_token, expires_in: d.expires_in });
  }

  // ───────── ขั้น ① ขอลิงก์ยินยอม (ต้องมีรหัสหลังร้าน) ─────────
  if (!url.pathname.endsWith("/callback")) {
    const g = await adminGate(req);
    /* ⚠️ `adminGate` คืน `deny: null` เมื่อ **ไม่ได้ส่งรหัสมาเลย** (ไม่ใช่ Response)
       เขียน `return g.deny` ตรง ๆ = คืน null ⇒ Netlify ตอบ
       "Function returned an unsupported value" ทุกคำขอ รวมทั้งของร้านเอง
       (บทเรียนเดิม 25 ส.ค. 2569 ที่เขียนไว้ใน CLAUDE.md แล้ว — และ `node --check` ไม่จับ) */
    if (!g.ok) return g.deny || json({ ok: false, เหตุ: "ต้องมีรหัสหลังร้าน (x-admin-key)" }, 401);
    const state = สุ่ม();
    await s.setJSON(`yt/state/${state}`, { at: Date.now() });
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", cid);
    u.searchParams.set("redirect_uri", callback);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", SCOPE);
    /* 🔑 สองตัวนี้ขาดไม่ได้ ไม่งั้นจะได้แต่ access token อายุ 1 ชม. **ไม่มี refresh token**
       แล้วระบบจะใช้ได้ชั่วโมงเดียวแล้วตาย โดยตอนเชื่อมดูเหมือนสำเร็จทุกประการ
       `prompt=consent` ต้องมีด้วย เพราะ Google ส่ง refresh token ให้เฉพาะครั้งแรก
       ⇒ เชื่อมซ้ำรอบสองจะไม่ได้ refresh token ถ้าไม่บังคับถามใหม่ */
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
    u.searchParams.set("state", state);
    return json({ ok: true, ลิงก์: u.toString(),
                  บอก: `เปิดลิงก์นี้แล้วยินยอมด้วยบัญชีที่เป็นเจ้าของช่อง ${CH}` });
  }

  // ───────── ขั้น ② Google ส่งกลับมา ─────────
  if (url.searchParams.get("error")) {
    return หน้า("ยกเลิกการเชื่อมช่อง", "ไม่มีอะไรถูกบันทึก เชื่อมใหม่ได้ตลอด", "#b45309");
  }
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state) return หน้า("ลิงก์ไม่ถูกต้อง", "ขอลิงก์ใหม่จากหลังร้าน", "#b91c1c");

  const saved = await s.get(`yt/state/${state}`, { type: "json" }).catch(() => null);
  await s.delete(`yt/state/${state}`).catch(() => {});      // ใช้ได้ครั้งเดียว
  if (!saved || Date.now() - (saved.at || 0) > STATE_TTL) {
    return หน้า("ลิงก์หมดอายุ", "ลิงก์ยินยอมใช้ได้ 10 นาทีและใช้ได้ครั้งเดียว — ขอใหม่จากหลังร้าน", "#b91c1c");
  }

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cid, client_secret: cs, code, redirect_uri: callback,
      grant_type: "authorization_code",
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    return หน้า("แลกกุญแจไม่สำเร็จ", String(d.error_description || d.error || "ไม่ทราบสาเหตุ"), "#b91c1c");
  }
  if (!d.refresh_token) {
    /* 🔴 ไม่มี refresh token = ใช้ได้ชั่วโมงเดียวแล้วตาย — ห้ามเก็บแล้วบอกว่าสำเร็จ */
    return หน้า("ยังใช้ไม่ได้ — ไม่ได้ refresh token",
      "Google ส่งกุญแจถาวรมาเฉพาะการยินยอมครั้งแรก ถ้าเคยยินยอมแอปนี้ไว้แล้ว " +
      "ให้ไปถอนที่ myaccount.google.com/permissions แล้วกดเชื่อมใหม่", "#b91c1c");
  }

  // ③ ยืนยันช่องก่อนเก็บ — ยินยอมผิดบัญชีเป็นเรื่องที่เกิดง่ายและกู้ยาก
  const ch = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { authorization: `Bearer ${d.access_token}` } }).then((x) => x.json()).catch(() => null);
  const it = ch?.items?.[0];
  if (!it) {
    return หน้า("อ่านรายชื่อช่องไม่ได้",
      "บัญชีนี้อาจไม่มีช่อง YouTube — ยินยอมด้วยบัญชีที่เป็นเจ้าของช่อง " + CH, "#b91c1c");
  }
  const handle = String(it.snippet?.customUrl || "").toLowerCase().replace(/^@/, "");
  if (handle && handle !== CH.toLowerCase().replace(/^@/, "")) {
    return หน้า("ช่องไม่ตรง — ไม่บันทึกกุญแจ",
      `บัญชีนี้เป็นเจ้าของช่อง <b>@${handle}</b> (${it.snippet?.title || ""}) ` +
      `ไม่ใช่ <b>${CH}</b><br>ออกจากบัญชี Google แล้วยินยอมใหม่ด้วยบัญชีที่ถูกต้อง`, "#b91c1c");
  }

  await s.set(คีย์กุญแจ, d.refresh_token);
  await s.setJSON("yt/ช่อง", {
    handle: it.snippet?.customUrl || "", ชื่อ: it.snippet?.title || "",
    channelId: it.id || "", เมื่อ: new Date().toISOString(),
  });
  return หน้า("เชื่อมช่องสำเร็จ ✅",
    `ระบบจะอัปคลิปขึ้นช่อง <b>${it.snippet?.title || CH}</b> (${it.snippet?.customUrl || CH})<br>` +
    `คลิปทุกใบจะขึ้นเป็น <b>ส่วนตัว (private)</b> จนกว่าจะสั่งเปลี่ยน`);
};

export const config = { path: ["/api/oauth/youtube", "/api/oauth/youtube/callback"] };
