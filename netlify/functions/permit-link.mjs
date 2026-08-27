// ลิงก์สั้นของหน้า /permit/ — /api/permit-link (27 ส.ค. 2569)
//
// เจ้าของร้านสั่ง "ย่อลิ้งด้วยหล่ะมันยาวไป" — ลิงก์แบบเดิมพกข้อมูลทั้งฟอร์มไว้หลัง #
// (ยาวเป็นพันตัวอักษร วางในไลน์แล้วน่ากลัว) จะย่อได้ต้องฝากข้อมูลไว้ฝั่งร้านชั่วคราว
// แล้วให้ลิงก์ถือแค่รหัสสั้น ๆ แทน
//
//   POST {payload}  → {code}     ฝากข้อมูลฟอร์ม ได้รหัส 8 ตัว
//   GET  ?c=<code>  → {payload}  คนช่วยพิมพ์เปิดลิงก์แล้วมาแลกข้อมูลกลับ
//
// ⚠️ กติกาความเป็นส่วนตัว — ชุดเดียวกับรูปสแกนบัตร (gucut-idscan)
//   - เก็บที่ Netlify Blobs store `gucut-permits` (ถังปิด) คีย์ sl/<code>
//   - เก็บ 7 วันแล้วลบอัตโนมัติ (กวาดตอนมีคนสร้างลิงก์ใหม่) — หน้าเว็บประกาศตรงกัน
//   - ห้าม log เนื้อ payload · ห้ามส่งเข้า Telegram
//   - รหัสเป็น 8 ตัวสุ่ม (~47 บิต) เดาไม่ได้ในทางปฏิบัติ + จำกัด GET กันไล่เดา
// ⚠️ พังเมื่อไหร่ฝั่งหน้าเว็บถอยกลับไปใช้ลิงก์ยาวแบบเดิมเอง — ห้ามให้ลูกค้าติดตัน

import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

const TTL = 7 * 24 * 3600 * 1000;
const store = () => getStore({ name: "gucut-permits", consistency: "strong" });

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// กันยิงรัว — อ่านมาบวกแล้วเขียนกลับพอสำหรับตัวกันรัว (พลาดนับซ้ำบ้างไม่เป็นไร
// ต่างจากข้อมูลจริงที่ห้ามใช้วิธีนี้) · สร้าง 10 ครั้ง / เปิด 60 ครั้ง ต่อ IP ต่อ 10 นาที
async function limited(s, ip, kind, max) {
  const key = `rl/${kind}/${ip}/${Math.floor(Date.now() / 600000)}`;
  const n = (await s.get(key, { type: "json" }).catch(() => null)) || 0;
  if (n >= max) return true;
  await s.setJSON(key, n + 1).catch(() => {});
  return false;
}

// เก็บกวาดลิงก์หมดอายุ + ตัวนับเก่า — เรียกแบบไม่ถ่วงคำตอบ
async function sweep(s) {
  try {
    const { blobs } = await s.list({ prefix: "sl/" });
    for (const b of blobs.slice(0, 60)) {
      const rec = await s.get(b.key, { type: "json" }).catch(() => null);
      if (!rec || (rec.at || 0) < Date.now() - TTL) await s.delete(b.key).catch(() => {});
    }
    const rl = await s.list({ prefix: "rl/" });
    const bucketNow = Math.floor(Date.now() / 600000);
    for (const b of rl.blobs.slice(0, 100)) {
      const bucket = Number(b.key.split("/").pop());
      if (!Number.isFinite(bucket) || bucket < bucketNow - 2) await s.delete(b.key).catch(() => {});
    }
  } catch { /* กวาดพลาดรอบหน้ากวาดใหม่ */ }
}

export default async function handler(req, context) {
  let s;
  try { s = store(); } catch { return json({ error: "store unavailable" }, 503); }
  const ip = req.headers.get("x-nf-client-connection-ip") || "?";

  if (req.method === "GET") {
    if (await limited(s, ip, "g", 60)) return json({ error: "เปิดถี่เกินไป พักสักครู่แล้วลองใหม่" }, 429);
    const url = new URL(req.url);
    const c = (url.searchParams.get("c") || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
    if (!c) return json({ error: "no code" }, 400);
    const rec = await s.get(`sl/${c}`, { type: "json" }).catch(() => null);
    if (!rec?.payload || (rec.at || 0) < Date.now() - TTL) {
      return json({ error: "ลิงก์นี้หมดอายุแล้ว (เก็บไว้ 7 วัน) — ขอลิงก์ใหม่จากเจ้าของเอกสารนะคะ" }, 404);
    }
    return json({ payload: rec.payload });
  }

  if (req.method === "POST") {
    if (await limited(s, ip, "p", 10)) return json({ error: "สร้างลิงก์ถี่เกินไป พักสักครู่แล้วลองใหม่" }, 429);
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const payload = body?.payload;
    if (!payload || JSON.stringify(payload).length > 8000) return json({ error: "payload ไม่ถูกต้อง" }, 400);
    const code = randomBytes(8).toString("base64url").replace(/[-_]/g, "").slice(0, 8);
    if (code.length < 8) return json({ error: "ลองใหม่อีกครั้ง" }, 500); // สุ่มได้ตัวพิเศษเยอะผิดปกติ
    // ⚠️ ต้อง await — Netlify แช่แข็งฟังก์ชันหลังตอบ promise ลอยตายกลางทาง (บทเรียน keepScan)
    await s.setJSON(`sl/${code}`, { payload, at: Date.now() });
    const sw = sweep(s);
    // ไม่มี waitUntil ก็ยอมให้รอบนี้กวาดไม่จบ — POST หน้าถัดไปกวาดต่อเอง (ปล่อยลอย-ตั้งใจ)
    if (context?.waitUntil) context.waitUntil(sw); else sw.catch(() => {});
    return json({ code });
  }

  return json({ error: "method not allowed" }, 405);
}

export const config = { path: "/api/permit-link" };
