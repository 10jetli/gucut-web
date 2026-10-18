// เชื่อมเพจ Facebook ต้นทางของระบบคัดลอกคลิป — กดลิงก์เดียวจบ แบบเดียวกับ repurpose.io
// (19 ต.ค. 2569 — ท่านประธานถาม "ทำไมเว็บนั้นเขาเชื่อมต่อง่าย ๆ"
//  คำตอบ: เขาสร้างแอป+ทำเส้นยินยอมไว้ให้แล้ว · ไฟล์นี้คือเส้นยินยอมแบบเดียวกันของเรา)
//
//   facebook.com/AJt8888 (@อ.ธง)  →  youtube.com/@chainsaw-newwave
//
// ท่าเดียวกับ oauth-youtube.mjs ทุกประการ — อ่านไฟล์นั้นก่อนแก้ไฟล์นี้
//  ① เริ่มได้เฉพาะคนมีรหัสหลังร้าน  ② state ครั้งเดียว 10 นาที
//  ③ ยืนยันว่าได้ "เพจที่ตั้งใจ" ก่อนเก็บ — ยินยอมผิดบัญชีเกิดง่ายและเงียบ
//
// 🔑 **สิ่งที่ต่างจาก YouTube: token ที่เก็บคือ Page token แบบไม่หมดอายุ**
//    ทางเดิน: code → user token (ชั่วโมง) → long-lived user token (60 วัน)
//    → **page token จาก long-lived user = ไม่มีวันหมดอายุ** (ท่าเดียวกับที่ repurpose ใช้
//    — เห็นจากหน้า connections ของจริง: Facebook เขียนว่า "ไม่มีวันหมดอายุ")
//    ⚠️ แลกจาก user token อายุสั้น = ได้ page token อายุสั้นตาม — **ห้ามข้ามขั้นกลาง**
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";

const เพจ = "AJt8888";                        // ต้นทางที่ท่านประธานระบุ 18 ต.ค. 2569
const STATE_TTL = 10 * 60 * 1000;
const SCOPE = "pages_show_list,pages_read_engagement";
const G = "https://graph.facebook.com/v21.0";

const store = () => getStore({ name: "gucut-coupon", consistency: "strong" });

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

async function กราฟ(path) {
  const r = await fetch(`${G}/${path}`);
  return { ok: r.ok, d: await r.json().catch(() => ({})) };
}

export default async (req) => {
  const url = new URL(req.url);
  // ⚠️ ใช้แอปใหม่ (FB_REPOST_APP_ID) ไม่ใช่ FACEBOOK_APP_ID ของปุ่มล็อกอินลูกค้า
  //    แอปนั้นไม่มี use case เพจ และไม่อยากเอาของที่ลูกค้าใช้ล็อกอินมาเสี่ยงกับงานนี้
  const cid = process.env.FB_REPOST_APP_ID;
  const cs = process.env.FB_REPOST_APP_SECRET;
  if (!cid || !cs) {
    return json({ ok: false, เหตุ: "ยังไม่ได้ตั้ง FB_REPOST_APP_ID/SECRET — สร้างแอป Meta ก่อนแล้วเอาค่ามาใส่ที่ Netlify" }, 503);
  }
  const callback = `${url.origin}/api/oauth/fbpage/callback`;
  const s = store();

  // ───── g1 ขอ Page token ไปใช้งาน (ต้องมีรหัสหลังร้าน) ─────
  if (url.searchParams.get("token") === "1") {
    const g = await adminGate(req);
    if (!g.ok) return g.deny || json({ ok: false, เหตุ: "ต้องมีรหัสหลังร้าน (x-admin-key)" }, 401);
    const t = await s.get("fb/pagetoken", { type: "json" }).catch(() => null);
    if (!t?.token) return json({ ok: false, เหตุ: "ยังไม่ได้เชื่อมเพจ" }, 409);
    return json({ ok: true, page_id: t.id, page_token: t.token, เพจ: t.ชื่อ });
  }

  // ───── ขั้น ① ขอลิงก์ยินยอม (ต้องมีรหัสหลังร้าน) ─────
  if (!url.pathname.endsWith("/callback")) {
    const g = await adminGate(req);
    if (!g.ok) return g.deny || json({ ok: false, เหตุ: "ต้องมีรหัสหลังร้าน (x-admin-key)" }, 401);
    const state = สุ่ม();
    await s.setJSON(`fb/state/${state}`, { at: Date.now() });
    const u = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    u.searchParams.set("client_id", cid);
    u.searchParams.set("redirect_uri", callback);
    u.searchParams.set("scope", SCOPE);
    u.searchParams.set("state", state);
    return json({ ok: true, ลิงก์: u.toString(),
                  บอก: `เปิดลิงก์นี้ด้วยบัญชีที่เป็นแอดมินเพจ ${เพจ} (@Sun Day) แล้วกดยินยอม` });
  }

  // ───── ขั้น ② Facebook ส่งกลับมา ─────
  if (url.searchParams.get("error")) {
    return หน้า("ยกเลิกการเชื่อมเพจ", "ไม่มีอะไรถูกบันทึก เชื่อมใหม่ได้ตลอด", "#b45309");
  }
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state) return หน้า("ลิงก์ไม่ถูกต้อง", "ขอลิงก์ใหม่จากหลังร้าน", "#b91c1c");
  const saved = await s.get(`fb/state/${state}`, { type: "json" }).catch(() => null);
  await s.delete(`fb/state/${state}`).catch(() => {});
  if (!saved || Date.now() - (saved.at || 0) > STATE_TTL) {
    return หน้า("ลิงก์หมดอายุ", "ลิงก์ใช้ได้ 10 นาทีครั้งเดียว — ขอใหม่จากหลังร้าน", "#b91c1c");
  }

  // code → user token (อายุสั้น)
  const r1 = await กราฟ(`oauth/access_token?client_id=${cid}&client_secret=${cs}` +
    `&redirect_uri=${encodeURIComponent(callback)}&code=${encodeURIComponent(code)}`);
  if (!r1.d.access_token) {
    return หน้า("แลกกุญแจไม่สำเร็จ", String(r1.d.error?.message || "?"), "#b91c1c");
  }
  // → long-lived user token (60 วัน) — **ข้ามขั้นนี้ = page token อายุสั้นตาม**
  const r2 = await กราฟ(`oauth/access_token?grant_type=fb_exchange_token&client_id=${cid}` +
    `&client_secret=${cs}&fb_exchange_token=${encodeURIComponent(r1.d.access_token)}`);
  const userTok = r2.d.access_token || r1.d.access_token;

  // → รายชื่อเพจที่บัญชีนี้ดูแล + page token ไม่หมดอายุ
  const r3 = await กราฟ(`me/accounts?fields=id,name,username,access_token&limit=50` +
    `&access_token=${encodeURIComponent(userTok)}`);
  const ทุกเพจ = Array.isArray(r3.d.data) ? r3.d.data : [];
  if (!ทุกเพจ.length) {
    return หน้า("บัญชีนี้ไม่มีเพจ", `ยินยอมด้วยบัญชีที่เป็นแอดมินเพจ ${เพจ} (@Sun Day)`, "#b91c1c");
  }
  // ③ เอาเฉพาะเพจที่ตั้งใจ — บัญชีเดียวดูแลหลายเพจได้ เก็บผิดเพจ = คลิปร้านอื่นไหลขึ้นช่อง
  const เป้า = ทุกเพจ.find((p) =>
    String(p.username || "").toLowerCase() === เพจ.toLowerCase());
  if (!เป้า) {
    return หน้า("ไม่พบเพจที่ตั้งใจ — ไม่บันทึก",
      `บัญชีนี้ดูแล: ${ทุกเพจ.map((p) => p.name).join(" · ")}<br>` +
      `แต่ระบบต้องการเพจ <b>${เพจ}</b> — ยินยอมด้วยบัญชีที่เป็นแอดมินเพจนั้น`, "#b91c1c");
  }

  await s.setJSON("fb/pagetoken", {
    id: เป้า.id, ชื่อ: เป้า.name, username: เป้า.username,
    token: เป้า.access_token, เมื่อ: new Date().toISOString(),
  });
  return หน้า("เชื่อมเพจสำเร็จ ✅",
    `ระบบจะอ่านคลิปใหม่จากเพจ <b>${เป้า.name}</b> แล้วลง YouTube เป็น<b>ส่วนตัว</b>ทุกใบ` +
    `<br>จนกว่าท่านจะสั่งเปลี่ยน`);
};

export const config = { path: ["/api/oauth/fbpage", "/api/oauth/fbpage/callback"] };
