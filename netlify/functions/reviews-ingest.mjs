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
import { r2Ready, r2Put, fetchBinary } from "../lib/r2.mjs";

const STORE = "gucut-reviews";
const PLATFORMS = new Set(["shopee", "lazada", "tiktok"]);

// คลิปใต้รีวิว — ต้องดึงไฟล์มาเก็บบน R2 ทันที ห้ามเก็บแค่ลิงก์
// ⚠️ ลิงก์คลิปของมาร์เก็ตเพลสมีลายเซ็นและหมดอายุใน 2-3 ชม. (เขียนไว้ใน src/lib/types.ts แต่เดิม)
//    เก็บลิงก์ไว้เฉย ๆ = พอถึงตอน build ลิงก์ตายแล้ว ได้กรอบดำบนหน้าสินค้า
// ⚠️ ทำได้จำกัดต่อคำขอ เพราะ Netlify ให้ฟังก์ชันรอผลได้แค่ 26 วินาที
//    เกินโควตาจะเก็บรีวิวไว้แต่ไม่มีคลิป แล้วรายงานกลับไปให้ตัวเก็บรู้ (ไม่เงียบ)
const VIDEO_MAX_PER_CALL = 6;

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
  // ⚠️ ต้องถอดรหัส URL เสมอ — handle ในเว็บเป็นภาษาไทย ("โซ่-kingkong-3623-…")
  //    แต่ที่หยิบมาจาก /products.json เป็น URL ที่เข้ารหัสไว้ (%E0%B9%82…)
  //    ไม่ถอด = จับคู่สินค้าไม่ติดสักตัว รีวิวค้างใน Blobs ตลอดกาลแบบเงียบ ๆ
  //    (เจอตอนยิงทดสอบจริงหลัง deploy 31 ส.ค. 2569 — ถ้าไม่ทดสอบคงไม่มีใครรู้)
  let key = String(r.handle || r.sku || "").trim();
  if (key.includes("%")) {
    try {
      key = decodeURIComponent(key);
    } catch {
      /* handle ที่มี % แต่ไม่ใช่รหัส URL — ใช้ค่าเดิม */
    }
  }
  if (!key) return null;
  const rating = Number(r.rating);
  if (!(rating >= 1 && rating <= 5)) return null;
  const text = String(r.text || "").trim().slice(0, 1000);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || "")) ? r.date : null;
  if (!date) return null;
  const images = Array.isArray(r.images)
    ? r.images.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 6)
    : [];
  // คลิป — รับมาเป็นลิงก์ชั่วคราว เดี๋ยวจะถูกดึงไปเก็บ R2 ทีหลัง
  let video = null;
  if (r.video && typeof r.video === "object") {
    const url = String(r.video.url || "").trim();
    if (/^https:\/\//.test(url)) {
      video = {
        url,
        poster: /^https:\/\//.test(String(r.video.poster || "")) ? String(r.video.poster) : null,
        dur: Number(r.video.dur) > 0 ? Math.round(Number(r.video.dur)) : 0,
        w: Number(r.video.w) > 0 ? Math.round(Number(r.video.w)) : 0,
        h: Number(r.video.h) > 0 ? Math.round(Number(r.video.h)) : 0,
      };
    }
  }

  return {
    platform,
    handle: key,
    rating: Math.round(rating),
    author: String(r.author || "").trim().slice(0, 80),
    text,
    images,
    date,
    id: r.id ? String(r.id).slice(0, 80) : null,
    video,
  };
}

/**
 * ดึงคลิปจากลิงก์ชั่วคราวของมาร์เก็ตเพลส มาเก็บบน R2 ถาวร
 * คืน object ที่พร้อมเก็บลงรีวิว หรือ null ถ้าทำไม่สำเร็จ (รีวิวยังถูกเก็บตามปกติ)
 */
async function saveVideo(v, id) {
  const { buf, type } = await fetchBinary(v.url, 25 * 1024 * 1024, 12000);
  if (!/^video\//.test(type) && !/\.mp4/i.test(v.url)) throw new Error(`ไม่ใช่ไฟล์วิดีโอ (${type})`);
  await r2Put(`rv/${id}.mp4`, buf, "video/mp4");

  // รูปปก — ไม่มีก็ไม่เป็นไร ตัวเล่นใช้เฟรมแรกแทนได้
  let poster = false;
  if (v.poster) {
    try {
      const p = await fetchBinary(v.poster, 3 * 1024 * 1024, 8000);
      await r2Put(`rv/${id}.jpg`, p.buf, p.type || "image/jpeg");
      poster = true;
    } catch {
      /* รูปปกโหลดไม่ได้ ปล่อยผ่าน */
    }
  }
  return { id, dur: v.dur, w: v.w, h: v.h, r2: true, poster };
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
    const call = await store.get("lastcall", { type: "json" }).catch(() => null);
    return json({
      pending: blobs.length,
      byPlatform,
      lastIngest: meta?.at ?? null,
      // ⚠️ ต้องแยก "ไม่มีใครเรียก" ออกจาก "เรียกแล้วแต่ไม่มีรีวิวใหม่" ให้ได้เสมอ
      //    สองอย่างนี้หน้าตาเหมือนกันหมดถ้าดูแค่ lastIngest — แล้วตัวเก็บพังแบบเงียบ ๆ ได้
      lastCall: call?.at ?? null,
      lastCallResult: call ? { added: call.added, dup: call.dup, bad: call.bad, sent: call.sent } : null,
    });
  }

  // ── ลบรีวิวทิ้ง (หลังร้าน) — ใช้ตอนเจอรีวิวเสีย/ของทดสอบ ──
  //    DELETE /api/reviews-ingest?key=r/<platform>/<id>
  if (req.method === "DELETE") {
    const gate = await adminGate(req, context);
    if (gate.deny) return gate.deny;
    if (!gate.ok) return json({ error: "unauthorized" }, 401);
    const key = new URL(req.url).searchParams.get("key") || "";
    if (!key.startsWith("r/")) return json({ error: "ต้องส่ง key ที่ขึ้นต้นด้วย r/" }, 400);
    await store.delete(key);
    return json({ ok: true, deleted: key });
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
  let videoSaved = 0;
  let videoFailed = 0;
  let videoSkipped = 0;
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

    // ── คลิป: ดึงมาเก็บ R2 ตอนนี้เลย ลิงก์ต้นทางอีก 2-3 ชม. จะตาย ──
    // ⚠️ คลิปพังห้ามทำให้รีวิวหาย — เก็บรีวิวไว้ก่อนเสมอ คลิปเป็นของแถม
    let video = null;
    if (r.video) {
      if (!r2Ready()) {
        videoSkipped++;
      } else if (videoSaved + videoFailed >= VIDEO_MAX_PER_CALL) {
        videoSkipped++;
      } else {
        const vid = `${r.platform}-${(r.id || fingerprint(r)).replace(/[^a-zA-Z0-9_-]/g, "")}`;
        try {
          video = await saveVideo(r.video, vid);
          videoSaved++;
        } catch {
          videoFailed++;
        }
      }
    }

    const rec = { ...r, video, ingestedAt: new Date().toISOString() };
    await store.setJSON(key, rec);
    added++;
    if (samples.length < 3) samples.push(`${r.platform}/${r.handle} ★${r.rating}${video ? " 🎬" : ""}`);
  }

  if (added > 0) {
    await store.setJSON("meta", { at: new Date().toISOString(), lastAdded: added });
  }
  // จดทุกครั้งที่มีคนเรียกสำเร็จ แม้ไม่ได้รีวิวใหม่สักใบ — ใช้ตอบว่า "ตัวเก็บยังมาไหม"
  await store.setJSON("lastcall", {
    at: new Date().toISOString(),
    sent: list.length,
    added,
    dup,
    bad,
    videoSaved,
    videoFailed,
    videoSkipped,
  });

  const video = { saved: videoSaved, failed: videoFailed, skipped: videoSkipped };
  return json({
    ok: true,
    added,
    dup,
    bad,
    video,
    samples,
    // บอกตัวเก็บตรง ๆ ว่ายังมีคลิปที่ยังไม่ได้เก็บ ให้แบ่งส่งมาใหม่ อย่าปล่อยเงียบ
    ...(videoSkipped
      ? { note: `คลิป ${videoSkipped} ใบยังไม่ได้เก็บ (จำกัด ${VIDEO_MAX_PER_CALL} ใบต่อครั้ง) — ส่งรีวิวที่มีคลิปแยกก้อนเล็กลง` }
      : {}),
  });
}

export const config = { path: "/api/reviews-ingest" };
