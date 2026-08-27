// เรื่องขอทะเบียนเลื่อยยนต์ของลูกค้าแต่ละคน — /api/permit-doc
//
// ---------------------------------------------------------------------------
// เจ้าของร้านสั่ง (25 ส.ค. 2569):
//   "ต้องล็อคอิน web เท่านั้นถึงทำการขอทะเบียนได้ ลูกค้าจะได้รู้ว่าทำถึงไหนแล้ว"
//
// ⚠️ คำสั่งนี้ "กลับทาง" กติกาเดิมที่เคยเขียนไว้ว่าห้ามบังคับล็อกอิน
//    (กติกาเดิมมาจาก "เน้นสะดวกล้วน") เจ้าของร้านเปลี่ยนใจเองพร้อมเหตุผล
//    ⇒ ห้าม "แก้กลับ" ให้ทำได้โดยไม่ล็อกอินอีก และห้ามลบคอมเมนต์นี้
//    เหตุผลคือเรื่องขอทะเบียนกินเวลาหลายสัปดาห์และมีร้านอยู่ตรงกลาง
//    ถ้าไม่รู้ว่าใครเป็นใคร ก็บอกไม่ได้ว่าเดินมาถึงขั้นไหนแล้ว
//
// หนึ่งลูกค้า = หนึ่งเรื่อง ผูกกับ "เบอร์โทรของบัญชี" เหมือนทุกอย่างในเว็บนี้
//   c/<เบอร์>       ตัวเรื่อง (เล็ก)   → หน้ารายการหลังร้านโหลดเร็ว
//   img/<เบอร์>/<n> รูปใบ ลซ.๒         → โหลดเฉพาะตอนกดเปิดดู
//
// ⚠️ เก็บที่ Netlify Blobs ห้ามเอาไป R2
//    ถัง R2 ที่มี (gucut-video) เปิดสาธารณะ เพราะต้องเสิร์ฟคลิปที่ video.gucut.com
//    ใบ ลซ.๒ มีชื่อ · เลขบัตร · ที่อยู่ · เลขที่ใบอนุญาต ของลูกค้า
//    วางในถังสาธารณะ = ใครได้ลิงก์ก็เปิดดูได้ · คีย์ปัจจุบันสร้างถังใหม่ก็ไม่ได้
//
// ⚠️ รูปที่อัปมา "ไม่แทน" การส่งเอกสารตัวจริง
//    ร้านต้องเก็บ ลซ.๒ ตอนกลางตัวจริงไว้เป็นหลักฐานการจำหน่ายตามกฎหมาย
//    สถานะจึงแยก "ลูกค้าส่งรูปมา" ออกจาก "ร้านได้ตัวจริงแล้ว" คนละขั้นกัน
//
// ฝั่งลูกค้า (ต้องล็อกอิน)
//   GET  /api/permit-doc?mine=1              เรื่องของฉัน + เดินมาถึงขั้นไหน
//   POST /api/permit-doc {stage}             ลูกค้ากดบอกเองว่าทำขั้นนั้นแล้ว
//   POST /api/permit-doc {images:[...]}      ส่งรูปใบ ลซ.๒
// ฝั่งร้าน (ต้องมีรหัสหลังร้าน)
//   GET  /api/permit-doc                     รายการทุกเรื่อง
//   GET  /api/permit-doc?phone=xxx           เปิดเรื่องเดียว + รูป
//   GET  /api/permit-doc?stat=1              นับเรื่องที่รอร้านทำ (ทำ badge)
//   PATCH /api/permit-doc {phone, stage}
// ---------------------------------------------------------------------------

import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";
import { pushToAdmins } from "../lib/push.mjs";
import { currentUser, store as usersStore } from "../lib/session.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP = 12;
const MAX_BYTES = 4 * 1024 * 1024;
// เกณฑ์เดียวกับตัวอ่านบัตร — เล็กกว่านี้ไม่ใช่รูปถ่ายเอกสารจริง
const MIN_BYTES = 12 * 1024;
const MAX_IMAGES = 2;   // ลซ.๒ มี ๒ ตอน

/**
 * ขั้นของเรื่อง — เรียงตามลำดับจริงที่เจ้าของร้านเล่าไว้
 *
 * ⚠️ ลำดับใน array นี้คือความหมาย ห้ามสลับหรือแทรกกลางโดยไม่ดูที่หน้าจอด้วย
 *    ทั้งฝั่งลูกค้าและฝั่งร้านวาดแถบความคืบหน้าจากลำดับนี้
 */
const STAGES = ["printed", "submitted", "gotlz2", "lz2", "got", "shipped", "done"];
/** ขั้นที่ "ร้าน" เป็นคนกด ลูกค้ากดเองไม่ได้ */
const SHOP_STAGES = new Set(["got", "shipped"]);

const nowIso = () => new Date().toISOString();
const store = () => getStore({ name: "gucut-permits", consistency: "strong" });
const clean = (v, max) => String(v ?? "").trim().slice(0, max);

async function overLimit(s, ip) {
  try {
    const key = `rl/${ip}`;
    const now = Date.now();
    const hits = ((await s.get(key, { type: "json" }).catch(() => null)) || [])
      .filter((t) => now - t < WINDOW_MS);
    if (hits.length >= MAX_PER_IP) return true;
    hits.push(now);
    await s.setJSON(key, hits).catch(() => {});
    return false;
  } catch {
    return false;   // ตัวนับพังต้องไม่ทำให้ลูกค้าใช้งานไม่ได้
  }
}

async function tell(text) {
  const { TELEGRAM_BOT_TOKEN: tok, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!tok || !chat) return;
  await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

const blank = (phone, name) => ({
  phone, name,
  at: nowIso(),
  stage: "",          // ยังไม่ได้ทำอะไรเลย
  history: {},        // ขั้นไหนทำเมื่อไหร่
  images: 0,
  saw: "", province: "", note: "",
});

/** ⚠️ ขั้นเดินหน้าอย่างเดียว ห้ามถอยหลังเพราะลูกค้ากดผิด — ร้านแก้ให้ได้ทาง PATCH */
function advance(rec, stage) {
  const cur = STAGES.indexOf(rec.stage);
  const next = STAGES.indexOf(stage);
  if (next > cur) rec.stage = stage;
  rec.history = rec.history || {};
  if (!rec.history[stage]) rec.history[stage] = nowIso();
  return rec;
}

export default async function handler(req, context) {
  // แจ้งเตือนต้องรอดข้ามการแช่แข็งของ Netlify — ฝาก waitUntil ถ้ามี ไม่มีก็ await
  // (ช้าขึ้นไม่กี่ร้อย ms แลกกับแจ้งเตือนไม่หายเงียบ — เดิมใช้ void แล้วตายกลางทาง
  //  ตัวตรวจ check-floating จับได้ 28 ส.ค. 2569)
  const park = async (p) => {
    const j = Promise.resolve(p).catch(() => {});
    if (context?.waitUntil) context.waitUntil(j);
    else await j;
  };
  const s = store();
  const url = new URL(req.url);

  // ---------------------------------------------------------------- ฝั่งลูกค้า
  const mine = url.searchParams.get("mine");
  if (req.method === "POST" || mine) {
    let me = null;
    try { me = await currentUser(req, usersStore()); } catch { /* ถือว่าไม่ได้ล็อกอิน */ }
    // ⚠️ ไม่ล็อกอิน = 401 เสมอ ห้ามปล่อยผ่านแบบไม่ระบุตัวตน
    //    เจ้าของร้านสั่งไว้ว่าต้องล็อกอินถึงทำเรื่องได้
    if (!me?.user?.phone) return json({ error: "ต้องเข้าสู่ระบบก่อน", needLogin: true }, 401);

    const phone = me.user.phone;
    const key = `c/${phone}`;
    let rec = await s.get(key, { type: "json" }).catch(() => null);
    if (!rec) rec = blank(phone, me.user.name || "");

    if (mine) return json({ item: rec });

    const ip = req.headers.get("x-nf-client-connection-ip") || "unknown";
    if (await overLimit(s, ip)) {
      return json({ error: "ทำรายการถี่เกินไป พักสัก 10 นาทีแล้วลองใหม่" }, 429);
    }

    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

    // ลูกค้าเติมข้อมูลประกอบได้ (ไม่บังคับ) — ช่วยร้านจับคู่กับออเดอร์
    if (body?.saw !== undefined) rec.saw = clean(body.saw, 80);
    if (body?.province !== undefined) rec.province = clean(body.province, 40);
    if (body?.note !== undefined) rec.note = clean(body.note, 300);
    if (me.user.name) rec.name = me.user.name;

    // ---- ส่งรูปใบ ลซ.๒
    const raw = Array.isArray(body?.images) ? body.images.slice(0, MAX_IMAGES) : [];
    if (raw.length) {
      const images = [];
      for (const one of raw) {
        const b64 = String(one || "").replace(/^data:image\/\w+;base64,/, "");
        if (!b64) continue;
        const bytes = b64.length * 0.75;
        if (bytes > MAX_BYTES) return json({ error: "รูปใหญ่เกินไป" }, 413);
        if (bytes < MIN_BYTES) {
          return json({ error: "รูปไม่ชัด ถ่ายใหม่ให้เห็นตัวหนังสือบนใบชัด ๆ" }, 422);
        }
        images.push(String(one));
      }
      if (!images.length) return json({ error: "ยังไม่ได้แนบรูปใบ ลซ.๒" }, 400);

      // ⚠️ เขียนรูปแยกคีย์ละใบ ห้ามยัดรวมลงตัวเรื่อง
      //    หน้ารายการหลังร้านอ่านทุกเรื่อง จะกลายเป็นโหลดรูปเป็นสิบเมกทุกครั้งที่เปิดหน้า
      await Promise.all(images.map((img, i) => s.set(`img/${phone}/${i}`, img)));
      rec.images = images.length;
      advance(rec, "lz2");
      await s.setJSON(key, rec);

      await park(tell(
        `📄 <b>ลูกค้าส่งใบ ลซ.๒ เข้ามา</b>\n` +
        `${rec.name || "-"} · ${phone}\n` +
        (rec.saw ? `เลื่อย: ${rec.saw}\n` : "") +
        (rec.province ? `ยื่นที่: ${rec.province}\n` : "") +
        `รูป ${rec.images} ใบ — เปิดดูที่หลังร้าน → ขอทะเบียนเลื่อยยนต์`,
      ));
      await park(pushToAdmins({
        title: "ลูกค้าส่งใบ ลซ.๒",
        body: `${rec.name || ""} · ${phone}`,
        url: "/admin/permits/",
      }));

      return json({ ok: true, item: rec });
    }

    // ---- ลูกค้าขอเริ่มเรื่องใหม่ทั้งหมด
    //
    // ⚠️ ลบได้เฉพาะ "เรื่องของตัวเอง" เท่านั้น
    //    เบอร์มาจาก session ไม่ได้มาจากสิ่งที่ลูกค้าส่งมา จึงยัดเบอร์คนอื่นไม่ได้
    // ⚠️ ต้องลบรูปที่อัปไว้ด้วย ไม่ใช่ลบแค่ตัวเรื่อง
    //    เหลือรูปค้างไว้ = ข้อมูลเอกสารราชการของคนที่ขอให้ลบไปแล้วยังอยู่ในระบบ
    //    และรอบหน้าที่เขาอัปใหม่ รูปเก่าจะปนกับรูปใหม่เพราะคีย์ซ้ำกัน
    if (body?.reset) {
      const n = rec.images || 0;
      await Promise.all(
        Array.from({ length: Math.max(n, MAX_IMAGES) }, (_, i) =>
          s.delete(`img/${phone}/${i}`).catch(() => {}),
        ),
      );
      await s.delete(key).catch(() => {});
      return json({ ok: true, item: blank(phone, me.user.name || "") });
    }

    // ---- ลูกค้ากดบอกว่าทำขั้นนั้นแล้ว
    const stage = clean(body?.stage, 16);
    if (stage) {
      if (!STAGES.includes(stage)) return json({ error: "ขั้นไม่ถูกต้อง" }, 400);
      // ⚠️ ลูกค้ากดขั้นของร้านเองไม่ได้ ไม่งั้นกด "ส่งเครื่องแล้ว" ให้ตัวเองได้
      if (SHOP_STAGES.has(stage)) return json({ error: "ขั้นนี้ทางร้านเป็นคนอัปเดต" }, 403);
      advance(rec, stage);
      await s.setJSON(key, rec);
      if (stage === "submitted") {
        await park(tell(`📮 <b>ลูกค้ายื่นเรื่องที่สำนักงานแล้ว</b>\n${rec.name || "-"} · ${phone}`));
      }
      // ⚠️ ขั้นนี้ร้านต้องรู้ทันที — ลูกค้าถือใบ ลซ.๒ อยู่ในมือแล้ว
      //    เป็นสัญญาณให้ร้านเตรียมเครื่องและแจ้งยอด ไม่ต้องรอซองมาถึง
      if (stage === "gotlz2") {
        await park(tell(
          `📨 <b>ลูกค้าได้ใบ ลซ.๒ มาแล้ว กำลังจะส่งมาที่ร้าน</b>\n` +
          `${rec.name || "-"} · ${phone}` +
          (rec.saw ? `\nเลื่อย: ${rec.saw}` : ""),
        ));
        await park(pushToAdmins({
          title: "ลูกค้าได้ใบ ลซ.๒ แล้ว",
          body: `${rec.name || ""} · ${phone}`,
          url: "/admin/permits/",
        }));
      }
      return json({ ok: true, item: rec });
    }

    // แค่บันทึกข้อมูลประกอบ
    await s.setJSON(key, rec);
    return json({ ok: true, item: rec });
  }

  // ---------------------------------------------------------------- ฝั่งร้าน
  //
  // ⚠️ adminGate คืน { wants, ok, deny } ไม่ใช่ Response — ต้องเช็คสองชั้น
  //    เขียน `if (gate) return gate` ไม่ได้ เพราะ object เป็น truthy เสมอ
  //    Netlify จะพังด้วย "Function returned an unsupported value" ทุกคำขอ
  //    รวมทั้งของร้านเอง = หน้าหลังร้านใช้ไม่ได้เลย (เจอของจริง 25 ส.ค. 2569)
  //    tsc กับ build มองไม่เห็น เพราะ .mjs ไม่มีชนิดข้อมูล
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  const readAll = async () => {
    const { blobs } = await s.list({ prefix: "c/" }).catch(() => ({ blobs: [] }));
    const items = [];
    for (const b of blobs) {
      const rec = await s.get(b.key, { type: "json" }).catch(() => null);
      if (rec) items.push(rec);
    }
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return items;
  };

  // ⚠️ สั่งตามเตือนเดี๋ยวนั้น — ต้องมีรหัสหลังร้าน (ผ่าน adminGate มาแล้วด้านบน)
  //    ฟังก์ชันตามเวลาเรียกผ่าน HTTP ไม่ได้ ทางนี้จึงเป็นทางเดียวที่ร้านสั่งเองได้
  if (url.searchParams.get("remind")) {
    const { runReminders } = await import("../lib/permit-remind.mjs");
    try {
      return json({ ok: true, ...(await runReminders()) });
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    }
  }

  if (req.method === "GET") {
    const phone = url.searchParams.get("phone");
    if (phone) {
      const rec = await s.get(`c/${phone}`, { type: "json" }).catch(() => null);
      if (!rec) return json({ error: "ไม่พบเรื่องนี้" }, 404);
      const imgs = [];
      for (let i = 0; i < (rec.images || 0); i++) {
        const one = await s.get(`img/${phone}/${i}`).catch(() => null);
        if (one) imgs.push(one);
      }
      return json({ ...rec, imageData: imgs });
    }

    if (url.searchParams.get("stat")) {
      // รอร้านทำ = ลูกค้าส่งรูปมาแล้วแต่ร้านยังไม่ได้กดว่าได้ตัวจริง
      const items = await readAll();
      return json({ waiting: items.filter((x) => x.stage === "lz2").length });
    }

    return json({ items: await readAll() });
  }

  if (req.method === "PATCH") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const phone = clean(body?.phone, 20);
    const stage = clean(body?.stage, 16);
    if (!STAGES.includes(stage)) return json({ error: "ขั้นไม่ถูกต้อง" }, 400);
    const rec = await s.get(`c/${phone}`, { type: "json" }).catch(() => null);
    if (!rec) return json({ error: "ไม่พบเรื่องนี้" }, 404);
    // ร้านตั้งขั้นได้อิสระ (รวมถอยหลัง) เพราะเป็นคนแก้ให้ตอนลูกค้ากดผิด
    rec.stage = stage;
    rec.history = rec.history || {};
    rec.history[stage] = nowIso();
    rec.updatedAt = nowIso();
    await s.setJSON(`c/${phone}`, rec);
    return json({ ok: true, item: rec });
  }

  return json({ error: "method not allowed" }, 405);
}

export const config = { path: "/api/permit-doc" };
