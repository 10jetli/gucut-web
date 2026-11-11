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

const บัญชีที่ตั้งใจ = "ajtcut_8";   // ท่านประธานยืนยัน 20 ต.ค. 2569 ว่าเป็นบัญชีของท่านเอง
/* ชื่อที่แสดงบนหน้ายินยอม — ใช้ยืนยันเฉพาะ "ครั้งแรก" ก่อนจะมี open_id ปักไว้
   (ยืนยันด้วยตาแล้ว 11 พ.ย. 2569: หน้ายินยอมของบัญชีนี้ขึ้นคำว่า อ.ธง) */
const ชื่อที่แสดงที่ตั้งใจ = "อ.ธง";
/* ⏱️ 30 นาที — ไม่ใช่ 10 นาทีแบบ YouTube **โดยตั้งใจ**
   🔴 ของจริงวันนี้: เขียนลิงก์ยินยอมลงไฟล์ให้ท่านกดทีหลัง แล้วลิงก์หมดอายุก่อนท่านเห็น
      จนต้องตั้ง timer เติมลิงก์ใหม่ทุก 8 นาที
   เส้นนี้ CEO จะพาท่านกดสด ⇒ 30 นาทีพอดีกับการนัดกันจริง และยังสั้นพอที่ลิงก์หลุดไปก็ตายเร็ว
   ⚠️ ความปลอดภัยไม่ได้พึ่งอายุลิงก์เป็นหลัก — พึ่ง **ด่าน ③** ที่ไม่เก็บกุญแจถ้าบัญชีไม่ตรง */
const STATE_TTL = 30 * 60 * 1000;
/* 📜 **บันทึกเหตุผลของขอบเขตทั้งหมด (รวมที่เลิกขอแล้ว)** — ไม่ใช่รายการที่ขอจริง
   รายการที่ขอจริงอยู่ที่ `SCOPE` ใต้บล็อกนี้ ⇒ อ่านบล็อกนี้อย่างเดียวแล้วสรุปว่าขออะไร = ผิด
   · video.publish      = ลงคลิปขึ้นบัญชีเลย (Direct Post)
   · video.upload       = ทางถอย: ส่งเข้ากล่องร่างให้คนกดลงเอง ถ้า publish ใช้ไม่ได้
   · user.info.basic    = open_id (ใช้เป็นกุญแจระบุบัญชีในภายหลัง)
   · user.info.profile  = **username** — 🔴 **เลิกขอ 11 พ.ย. 2569 เพราะแอปไม่มีสิทธิ์นี้**
     (ข้อความเดิมเขียนว่า "ขาดตัวนี้ด่าน ③ ทำงานไม่ได้" ⇒ **ไม่จริงอีกแล้ว** ด่านย้ายไปใช้ open_id)
   · video.list         = อ่านรายชื่อคลิปที่เคยลงบนบัญชี ⇒ **กันซ้ำชั้นที่สอง**
     🔴 **เลิกขอ 11 พ.ย. 2569** — อยู่ใน Display API ซึ่งแอปยังไม่ได้เพิ่ม (ต้องยื่นรีวิวใหม่)
     🔴 เพิ่ม 26 ต.ค. 2569 — ขาดตัวนี้ `กันซ้ำtiktok.py` ตอบ `scope_not_authorized`
        ⇒ ด่านกันซ้ำไม่ผ่านตลอดกาล ⇒ ท่อ TikTok หยุดสนิทตั้งแต่ 24 ต.ค.
        โดยไม่มีอะไรฟ้องว่าสาเหตุคือขอบเขตที่ไม่ได้ขอ
     🔑 กันซ้ำด้วยบันทึกของตัวเองชั้นเดียวไม่พอ — เคยส่งคลิปซ้ำมาแล้ว
        ต้อง **ถามปลายทาง** ว่ามีอะไรอยู่แล้วบ้าง */
/* 🔴 แก้ 11 พ.ย. 2569 — ขอเฉพาะที่แอปมีจริง (วัดจากหน้าตั้งค่าแอปวันนี้)
   ที่ถอดออกและเหตุผล:
   · user.info.profile → แอปไม่มี ⇒ อ่าน username ไม่ได้ ⇒ ด่าน ③ เปลี่ยนไปยืนยันด้วย open_id แทน
   · video.list        → อยู่ใน Display API ซึ่งแอปยังไม่ได้เพิ่ม ⇒ ต้องยื่นรีวิวใหม่พร้อมวิดีโอสาธิต
     ⇒ กันซ้ำชั้นสองจึงทำไม่ได้ชั่วคราว · ตาข่ายที่เหลือคือ **ตัดด้วยวันที่** (CUTOFF)
     ซึ่งเพียงพอตราบที่ท่านประธานไม่ลง TikTok เอง (ข้อตกลง 29 ต.ค. 2569)
   🚫 ห้ามใส่สองตัวนี้กลับจนกว่าแอปจะได้สินค้านั้นจริง — ใส่แล้วหน้ายินยอมตีกลับทั้งใบ */
const SCOPE = "user.info.basic,video.publish,video.upload";
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
  /* ⚠️ ขอ username ไม่ได้แล้ว — ต้องใช้ขอบเขต user.info.profile ซึ่งแอปไม่มี
     ขอไปจะได้ error ทั้งคำขอ ⇒ ขอเฉพาะที่ user.info.basic ให้ */
  const u = `${USERINFO}?fields=open_id,union_id,display_name,avatar_url`;
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

  /* ③ ยืนยันบัญชีก่อนเก็บ — เทียบ open_id (ครั้งแรกเทียบชื่อที่แสดง)
     เดิมเทียบ username แต่ต้องใช้ขอบเขต user.info.profile ซึ่งแอปไม่มี — ดูด่านข้างล่าง */
  const user = await บัญชีของโทเคน(d.access_token);
  if (user.เหตุ) {
    return หน้า("อ่านชื่อบัญชีไม่ได้ — ไม่บันทึกกุญแจ",
      `ขอโทเคนได้ แต่ถาม TikTok ว่าเป็นบัญชีไหนไม่ได้ (${user.เหตุ})<br>` +
      "ด่านนี้ใช้ <b>user.info.basic</b> เท่านั้น (open_id + ชื่อที่แสดง) ซึ่งแอปมีอยู่แล้ว " +
      "⇒ ถ้าตรงนี้ล้ม แปลว่าโทเคนใช้ไม่ได้หรือ TikTok ตอบผิดรูป ไม่ใช่เรื่องขอบเขต", "#b91c1c", "อ่านบัญชีไม่ได้");
  }
  /* 🔑 ด่าน ③ เปลี่ยนวิธียืนยัน 11 พ.ย. 2569 — จาก username เป็น open_id + ชื่อที่แสดง
     เหตุ: อ่าน username ไม่ได้แล้ว (ต้องใช้ user.info.profile ซึ่งแอปไม่มี)
     ⇒ ไม่ได้ **ถอด** ด่าน แต่เปลี่ยนหลักฐานที่ใช้:
       ครั้งแรก  : ยังไม่เคยมี open_id ที่ปักไว้ ⇒ ตรวจ "ชื่อที่แสดง" ต้องตรงกับที่ตั้งใจ แล้วปัก open_id ไว้
       ครั้งถัดไป: open_id ต้องตรงกับที่ปักไว้เป๊ะ ⇒ บัญชีอื่นเข้ามาแทนไม่ได้แม้ชื่อซ้ำ
     ⚠️ ชื่อที่แสดงเปลี่ยนได้ (ต่างจาก username) ⇒ ใช้ได้เฉพาะรอบแรกที่มีคนดูอยู่ตรงนั้น
        หลังจากนั้น open_id คือหลักฐานตัวจริง */
  const ชื่อแสดง = String(user.display_name || "").trim();
  const เก่าปัก = await s.get(คีย์กุญแจ, { type: "json" }).catch(() => null);
  const openId = String(d.open_id || user.open_id || "");

  if (!openId) {
    return หน้า("ไม่ได้ open_id — ไม่บันทึกกุญแจ",
      "TikTok ไม่ส่ง open_id กลับมา ⇒ ยืนยันบัญชีไม่ได้ ⇒ ไม่เก็บอะไรเลย",
      "#b91c1c", "ยืนยันบัญชีไม่ได้");
  }

  /* 🔴 **หมุดเทียบได้เฉพาะภายในแอปเดียวกัน** (วัดเจอของจริง 11 พ.ย. 2569)
     `open_id` ของ TikTok ผูกกับ client key ⇒ บัญชีเดียวกันแต่คนละแอป ได้ open_id คนละตัว
     ของจริงวันนี้: หมุดเก่าเป็นของแอป sandbox เดิม พอย้ายมาคีย์ production
     ด่านจึงตีกลับว่า "บัญชีไม่ตรง" ทั้งที่เป็นบัญชี อ.ธง คนเดียวกันและถูกต้องทุกอย่าง
     ⇒ หน้าจอบอกเหตุผิด ⇒ คนอ่านจะไปไล่หาบัญชีปลอมที่ไม่มีอยู่
     🔑 คลาส: **ค่าที่เทียบกันได้เฉพาะในบริบทหนึ่ง ต้องเก็บบริบทไว้ข้างกัน**
        ไม่เก็บ = วันหนึ่งบริบทเปลี่ยน แล้วการเทียบให้คำตอบที่ผิดอย่างมั่นใจ */
  const หมุดแอปเดียวกัน = เก่าปัก?.open_id && เก่าปัก?.client_key === ck;
  if (หมุดแอปเดียวกัน) {
    if (เก่าปัก.open_id !== openId) {
      return หน้า("บัญชีไม่ตรงกับที่ปักไว้ — ไม่บันทึกกุญแจ",
        `บัญชีที่กดยินยอม (ชื่อที่แสดง: <b>${ชื่อแสดง || "—"}</b>) ` +
        "ไม่ใช่บัญชีเดิมที่ระบบผูกไว้<br>" +
        "ถ้าตั้งใจเปลี่ยนบัญชีจริง ให้ลบกุญแจเดิมก่อนแล้วค่อยยินยอมใหม่",
        "#b91c1c", "บัญชีไม่ตรง");
    }
  } else if (ชื่อแสดง !== ชื่อที่แสดงที่ตั้งใจ) {
    /* ไม่มีหมุดของแอปนี้ ⇒ ตรวจชื่อที่แสดง (เส้นนี้เริ่มได้เฉพาะคนถือรหัสหลังร้าน) */
    return หน้า("ชื่อบัญชีไม่ตรง — ไม่บันทึกกุญแจ",
      `บัญชีที่กดยินยอมมีชื่อที่แสดงว่า <b>${ชื่อแสดง || "(อ่านไม่ได้)"}</b> ` +
      `ไม่ใช่ <b>${ชื่อที่แสดงที่ตั้งใจ}</b> (@${บัญชีที่ตั้งใจ})<br>` +
      "สลับบัญชีในแอป TikTok แล้วยินยอมใหม่", "#b91c1c", "บัญชีไม่ตรง");
  }
  const ชื่อบัญชี = เก่าปัก?.username || บัญชีที่ตั้งใจ;

  await s.setJSON(คีย์กุญแจ, {
    /* 🔑 เก็บ client_key ไว้ **เสมอ** — นี่คือบริบทที่ทำให้ open_id เทียบได้
       ระเบียนเก่าที่ไม่มีช่องนี้ ⇒ ถือว่าเทียบไม่ได้ (ไม่ใช่ "ตรง" และไม่ใช่ "ไม่ตรง") */
    client_key: ck,
    ทับหมุดของแอป: หมุดแอปเดียวกัน ? undefined : (เก่าปัก?.client_key || (เก่าปัก ? "ไม่ได้จดไว้" : undefined)),
    refresh_token: d.refresh_token,
    open_id: d.open_id || user.open_id || "",
    username: ชื่อบัญชี,
    scope: d.scope || SCOPE,
    เมื่อ: new Date().toISOString(),
  });
  return หน้า("เชื่อมบัญชีสำเร็จ ✅",
    `ระบบจะลงคลิปขึ้นบัญชี <b>@${ชื่อบัญชี}</b> (${user.display_name || ""})<br>` +
    /* 🔴 ข้อความเดิมเขียนว่า "คลิปทุกใบจะเป็นส่วนตัวโดยบังคับ" — **ไม่จริง** (วัด 11 พ.ย. 2569)
       ของจริง: แอปที่ยังไม่ผ่าน audit **โพสต์ตรงไม่ได้เลย** TikTok ตีกลับ HTTP 403
       `unaudited_client_can_only_post_to_private_accounts` ⇒ ไม่ใช่ "ลงแบบส่วนตัว"
       แต่เป็น "ลงไม่ได้" ⇒ ท่อจึงถอยไปส่งเข้า **กล่องร่าง** ให้กดลงเองในแอป
       ⚠️ และ `creator_info.privacy_level_options` **มี PUBLIC_TO_EVERYONE ครบ**
          ⇒ ฟิลด์นั้นตอบว่า "บัญชี" ลงอะไรได้ ไม่ได้ตอบว่า "แอปที่ยังไม่ผ่านตรวจ" ทำอะไรได้
          ห้ามใช้มันตัดสินว่าจะโพสต์ตรงได้ไหม — เสียเวลาไปกับการเข้าใจผิดนี้มาแล้ว */
    "คลิปใหม่จากเพจจะถูกส่งเข้า <b>กล่องร่างของแอป TikTok</b> ให้กดลงเอง " +
    "(แอปยังไม่ผ่าน audit ของ TikTok ⇒ โพสต์ตรงถูกตีกลับ 403 ไม่ใช่เรื่องการตั้งค่า)<br>" +
    "ท่อลอง <b>โพสต์ตรง</b> ก่อนทุกใบ แล้วถอยเองเมื่อถูกตีกลับ ⇒ วันที่แอปผ่าน audit " +
    "คลิปจะขึ้นสาธารณะเองทันที ไม่ต้องมีใครมาแก้ค่า", "#0a7", "สำเร็จ");
};

export const config = { path: ["/api/oauth/tiktok-video", "/api/oauth/tiktok-video/callback"] };
