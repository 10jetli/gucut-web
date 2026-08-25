// ลูกค้าส่งรูปใบ ลซ.๒ เข้ามา — /api/permit-doc
//
// ---------------------------------------------------------------------------
// เจ้าของร้านเสนอเอง (25 ส.ค. 2569): "พอลูกค้าได้ใบจริงมาก็ถ่ายอัพโหลดมาที่นี่"
// แก้ปัญหาที่ว่าเว็บไม่มีทางรู้ว่าลูกค้าเดินมาถึงขั้นไหนแล้ว
// เพราะใบ ลซ.๒ มาทางไปรษณีย์จากสำนักงาน ไม่ได้ผ่านเว็บเลย
//
// ⚠️ รูปที่อัปมา "ไม่ได้แทนการส่งเอกสารตัวจริง"
//    ร้านต้องเก็บ ลซ.๒ ตอนกลางตัวจริงไว้เป็นหลักฐานการจำหน่ายตามกฎหมาย
//    รูปมีไว้ให้ร้าน "รู้ล่วงหน้า" ว่าลูกค้าได้ใบแล้ว จะได้เตรียมเครื่องและแจ้งยอด
//    ⇒ ข้อความบนหน้าเว็บต้องบอกให้ชัด ห้ามปล่อยให้เข้าใจว่าอัปแล้วจบ
//
// ⚠️ ทำไมไม่เก็บที่ R2 ตามที่เจ้าของร้านบอก
//    ถัง R2 ที่มีอยู่ (gucut-video) เปิดสาธารณะ เพราะต้องเสิร์ฟคลิปที่ video.gucut.com
//    ใบ ลซ.๒ มีชื่อ · เลขบัตร · ที่อยู่ · เลขที่ใบอนุญาต ของลูกค้า
//    วางในถังสาธารณะ = ใครได้ลิงก์ไปก็เปิดดูได้ และคีย์ปัจจุบันสร้างถังใหม่ไม่ได้
//    ⇒ เก็บที่ Netlify Blobs แทน ที่เดียวกับสลิปโอนเงิน ปิดอยู่โดยปริยาย
//       ต้องผ่าน admin-gate ถึงจะเปิดดูได้ · อยากย้ายไป R2 ต้องสร้างถังใหม่แบบปิดก่อน
//
// วิธีเก็บ — แยกรูปออกจากตัวรายการ (กติกาเดียวกับออเดอร์/สลิป)
//   d/<id>       ตัวรายการ (เล็ก)  → หน้ารายการหลังร้านโหลดเร็ว
//   img/<id>/<n> รูป base64        → โหลดเฉพาะตอนกดเปิดดูใบนั้น
//
// ฝั่งลูกค้า   POST /api/permit-doc            ส่งรูป (ไม่ต้องล็อกอิน)
// ฝั่งร้าน     GET  /api/permit-doc            รายการ (ไม่รวมรูป)
//             GET  /api/permit-doc?id=xxx     เปิดใบเดียว + รูป
//             PATCH /api/permit-doc {id,status}
// ---------------------------------------------------------------------------

import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";
import { pushToAdmins } from "../lib/push.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP = 6;
const MAX_BYTES = 4 * 1024 * 1024;
// ⚠️ เกณฑ์เดียวกับตัวอ่านบัตร — เล็กกว่านี้ไม่ใช่รูปถ่ายเอกสารจริง
//    กันคนยิงรูปเปล่าเข้ามาถล่มรายการหลังร้าน
const MIN_BYTES = 12 * 1024;
const MAX_IMAGES = 2;   // ลซ.๒ มี ๒ ตอน ถ่ายมาได้สูงสุดสองรูป

const STATUSES = ["new", "got", "done"];

const nowIso = () => new Date().toISOString();

const store = () => getStore({ name: "gucut-permits", consistency: "strong" });

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
    return false;   // ตัวนับพังต้องไม่ทำให้ลูกค้าส่งเอกสารไม่ได้
  }
}

/** แจ้งเข้ากลุ่ม Telegram เดิมของร้าน — ไม่ต้องตั้งอะไรเพิ่ม */
async function tell(text) {
  const { TELEGRAM_BOT_TOKEN: tok, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!tok || !chat) return;
  await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

export default async function handler(req, context) {
  const s = store();

  // ------------------------------------------------------------ ลูกค้าส่งเข้ามา
  if (req.method === "POST") {
    const ip = req.headers.get("x-nf-client-connection-ip") || "unknown";
    if (await overLimit(s, ip)) {
      return json({ error: "ส่งถี่เกินไป พักสัก 10 นาทีแล้วลองใหม่" }, 429);
    }

    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

    const name = clean(body?.name, 120);
    const phone = clean(body?.phone, 20).replace(/[^\d+]/g, "");
    if (!name || phone.replace(/\D/g, "").length < 9) {
      return json({ error: "ต้องกรอกชื่อและเบอร์โทรที่ติดต่อได้" }, 400);
    }

    const raw = Array.isArray(body?.images) ? body.images.slice(0, MAX_IMAGES) : [];
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

    const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const rec = {
      id,
      at: nowIso(),
      name,
      phone,
      saw: clean(body?.saw, 80),
      province: clean(body?.province, 40),
      note: clean(body?.note, 300),
      images: images.length,
      status: "new",
    };

    // ⚠️ เขียนรูปแยกคีย์ละใบ ห้ามยัดรวมลงตัวรายการ
    //    หน้ารายการหลังร้านอ่านทุกใบ จะกลายเป็นโหลดรูปเป็นสิบเมกทุกครั้งที่เปิดหน้า
    //    (กติกาเดียวกับรูปลงเวลาพนักงานและสลิปโอนเงิน)
    await Promise.all(images.map((img, i) => s.set(`img/${id}/${i}`, img)));
    await s.setJSON(`d/${id}`, rec);

    // ⚠️ ห้าม await ตัวแจ้งเตือน ลูกค้ายืนรอหน้าจออยู่
    void tell(
      `📄 <b>ลูกค้าส่งใบ ลซ.๒ เข้ามา</b>\n` +
      `${rec.name} · ${rec.phone}\n` +
      (rec.saw ? `เลื่อย: ${rec.saw}\n` : "") +
      (rec.province ? `ยื่นที่: ${rec.province}\n` : "") +
      (rec.note ? `หมายเหตุ: ${rec.note}\n` : "") +
      `รูป ${rec.images} ใบ — เปิดดูที่หลังร้าน → ใบ ลซ.๒`,
    );
    void pushToAdmins({
      title: "ลูกค้าส่งใบ ลซ.๒",
      body: `${rec.name} · ${rec.phone}`,
      url: "/admin/permits/",
    }).catch(() => {});

    return json({ ok: true, id });
  }

  // ------------------------------------------------------------ ฝั่งร้าน
  //
  // ⚠️ adminGate คืน { wants, ok, deny } ไม่ใช่ Response — ต้องเช็คสองชั้น
  //    เขียน `if (gate) return gate` ไม่ได้ เพราะ object เป็น truthy เสมอ
  //    Netlify จะพังทันทีด้วย "Function returned an unsupported value"
  //    ทั้งกับคนนอกและกับร้านเอง = หน้าหลังร้านใช้ไม่ได้เลยสักครั้ง
  //    เจอตอนยิงทดสอบจริงหลัง deploy (25 ส.ค. 2569) ไม่ใช่ตอน build — tsc/build มองไม่เห็น
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (id) {
      const rec = await s.get(`d/${id}`, { type: "json" }).catch(() => null);
      if (!rec) return json({ error: "ไม่พบรายการนี้" }, 404);
      const imgs = [];
      for (let i = 0; i < (rec.images || 0); i++) {
        const one = await s.get(`img/${id}/${i}`).catch(() => null);
        if (one) imgs.push(one);
      }
      return json({ ...rec, imageData: imgs });
    }

    if (url.searchParams.get("stat")) {
      const { blobs } = await s.list({ prefix: "d/" }).catch(() => ({ blobs: [] }));
      let n = 0;
      for (const b of blobs) {
        const rec = await s.get(b.key, { type: "json" }).catch(() => null);
        if (rec?.status === "new") n++;
      }
      return json({ waiting: n });
    }

    const { blobs } = await s.list({ prefix: "d/" }).catch(() => ({ blobs: [] }));
    const items = [];
    for (const b of blobs) {
      const rec = await s.get(b.key, { type: "json" }).catch(() => null);
      if (rec) items.push(rec);
    }
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return json({ items });
  }

  if (req.method === "PATCH") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const id = clean(body?.id, 40);
    const status = clean(body?.status, 16);
    if (!STATUSES.includes(status)) return json({ error: "สถานะไม่ถูกต้อง" }, 400);
    const rec = await s.get(`d/${id}`, { type: "json" }).catch(() => null);
    if (!rec) return json({ error: "ไม่พบรายการนี้" }, 404);
    rec.status = status;
    rec.updatedAt = nowIso();
    await s.setJSON(`d/${id}`, rec);
    return json({ ok: true, item: rec });
  }

  return json({ error: "method not allowed" }, 405);
}

export const config = { path: "/api/permit-doc" };
