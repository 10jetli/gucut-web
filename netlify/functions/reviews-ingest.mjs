// รับรีวิวใหม่จาก Shopee / Lazada / TikTok เข้ามาเก็บ แล้วเว็บหยิบไปแสดงตอน build ถัดไป
//
// แพทเทิร์นเดียวกับ /api/bills/upload ของหลังร้าน (พิสูจน์แล้วว่าทำงานทุกวัน):
// ตัวเก็บรีวิวจากมาร์เก็ตเพลสยิงเข้ามาที่นี่ · ฝั่งนี้กันซ้ำ + เก็บ · ไม่ต้องรู้ว่าเว็บ deploy ยังไง
//
//   POST /api/reviews-ingest   body JSON: { secret, reviews: [ {...} ] }
//     รีวิวหนึ่งรายการ: { platform, handle | sku, rating, author, text, images?, date, id? }
//     ตอบ { ok, added, dup, bad }
//   GET  /api/reviews-ingest   (ต้องมี x-admin-key) → สรุปว่ามีรีวิวรออยู่เท่าไหร่
//
// ⚠️ กันซ้ำเป็นหัวใจของงานนี้ — เจ้าของร้านสั่ง "ดึงรีวิวใหม่ ๆ แต่ไม่ซ้ำ"
//    ใช้ "หนึ่งรีวิว = หนึ่งคีย์" แล้วให้ Blobs ปฏิเสธของเดิมเอง (กติกาเดียวกับตัวนับคนเข้าเว็บ)
//    คีย์คิดจาก platform + id ถ้ามี · ไม่มี id ใช้ลายนิ้วมือ (คนเขียน+ข้อความ+วันที่)
//    ตัวเก็บจึงยิงซ้ำได้ทุกคืนโดยไม่ต้องจำอะไรเอง — ของซ้ำตกที่นี่หมด
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { adminGate } from "../lib/admin-gate.mjs";

const STORE = "gucut-reviews";
const PLATFORMS = new Set(["shopee", "lazada", "tiktok"]);

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });

/** ลายนิ้วมือรีวิว — ใช้ตอนมาร์เก็ตเพลสไม่ให้ id มา */
const fingerprint = (r) =>
  createHash("sha1")
    .update([r.platform, r.handle || r.sku || "", r.author || "", (r.text || "").slice(0, 200), r.date || ""].join("|"))
    .digest("hex")
    .slice(0, 16);

/** ตรวจ + ล้างรีวิวหนึ่งรายการ — คืน null ถ้าใช้ไม่ได้ */
function clean(r) {
  if (!r || typeof r !== "object") return null;
  const platform = String(r.platform || "").toLowerCase();
  if (!PLATFORMS.has(platform)) return null;
  const key = String(r.handle || r.sku || "").trim();
  if (!key) return null;
  const rating = Number(r.rating);
  if (!(rating >= 1 && rating <= 5)) return null;
  const text = String(r.text || "").trim().slice(0, 1000);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || "")) ? r.date : null;
  if (!date) return null;
  const images = Array.isArray(r.images)
    ? r.images.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 6)
    : [];
  return {
    platform,
    handle: key,
    rating: Math.round(rating),
    author: String(r.author || "").trim().slice(0, 80),
    text,
    images,
    date,
    id: r.id ? String(r.id).slice(0, 80) : null,
  };
}

export default async function handler(req, context) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, GET, OPTIONS",
        "access-control-allow-headers": "content-type, x-admin-key",
      },
    });
  }

  const store = getStore({ name: STORE, consistency: "strong" });

  // ── ดูสถานะ (หลังร้าน) ──
  if (req.method === "GET") {
    const gate = await adminGate(req, context);
    if (gate.deny) return gate.deny;
    if (!gate.ok) return json({ error: "unauthorized" }, 401);
    const { blobs } = await store.list({ prefix: "r/" });
    const byPlatform = {};
    for (const b of blobs) {
      const p = b.key.split("/")[1] || "?";
      byPlatform[p] = (byPlatform[p] || 0) + 1;
    }
    const meta = await store.get("meta", { type: "json" }).catch(() => null);
    return json({ pending: blobs.length, byPlatform, lastIngest: meta?.at ?? null });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // ── รับรีวิวเข้า ──
  const secret = process.env.REVIEWS_INGEST_SECRET;
  if (!secret) return json({ error: "ยังไม่ได้ตั้ง REVIEWS_INGEST_SECRET ที่ Netlify" }, 503);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "body ต้องเป็น JSON" }, 400);
  }
  if (body?.secret !== secret) return json({ error: "unauthorized" }, 401);

  const list = Array.isArray(body?.reviews) ? body.reviews.slice(0, 500) : null;
  if (!list) return json({ error: "ต้องส่ง reviews เป็น array" }, 400);

  let added = 0;
  let dup = 0;
  let bad = 0;
  const samples = [];

  for (const raw of list) {
    const r = clean(raw);
    if (!r) {
      bad++;
      continue;
    }
    const key = `r/${r.platform}/${r.id || fingerprint(r)}`;
    // มีอยู่แล้ว = รีวิวซ้ำ ข้ามไป (ไม่เขียนทับ กันข้อมูลเดิมถูกแก้)
    const exists = await store.getMetadata(key).catch(() => null);
    if (exists) {
      dup++;
      continue;
    }
    await store.setJSON(key, { ...r, ingestedAt: new Date().toISOString() });
    added++;
    if (samples.length < 3) samples.push(`${r.platform}/${r.handle} ★${r.rating}`);
  }

  if (added > 0) {
    await store.setJSON("meta", { at: new Date().toISOString(), lastAdded: added });
  }

  return json({ ok: true, added, dup, bad, samples });
}

export const config = { path: "/api/reviews-ingest" };
