// เสิร์ฟไฟล์คลิปจาก R2 พร้อมแคช — ใช้แทนลิงก์ pub-xxx.r2.dev
//
// ทำสามอย่างที่ r2.dev ไม่ทำให้
//   1. ติด Cache-Control ให้ทุกไฟล์ → Cloudflare แคชที่ขอบเครือข่ายทั่วโลก
//   2. รองรับ Range request (เบราว์เซอร์ขอวิดีโอทีละช่วง)
//   3. ใส่ CORS ให้ hls.js บน Chrome/Android ดึงเซกเมนต์ได้
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "range",
  "Access-Control-Expose-Headers": "content-length, content-range, etag",
};

// ไฟล์ HLS ไม่มีวันเปลี่ยนเนื้อหา (ชื่อผูกกับ hash ของคลิป) แคชยาวได้เลย
const CACHE = "public, max-age=31536000, immutable";

const TYPES = {
  m3u8: "application/vnd.apple.mpegurl",
  ts: "video/mp2t",
  jpg: "image/jpeg",
  mp4: "video/mp4",
};

export default {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("method not allowed", { status: 405, headers: CORS });
    }

    const url = new URL(req.url);
    const key = decodeURIComponent(url.pathname.slice(1));
    if (!key) return new Response("not found", { status: 404, headers: CORS });

    // มีในแคชแล้วก็ตอบจากแคชเลย ไม่ต้องแตะ bucket
    const cache = caches.default;
    const hit = await cache.match(req);
    if (hit) return hit;

    const range = req.headers.get("range");
    const obj = await env.VIDEO.get(key, range ? { range: req.headers } : undefined);
    if (!obj) return new Response("not found", { status: 404, headers: CORS });

    const headers = new Headers(CORS);
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    headers.set("cache-control", CACHE);
    headers.set("content-type", TYPES[key.split(".").pop()] ?? "application/octet-stream");

    if (obj.range) {
      const start = obj.range.offset ?? 0;
      const end = start + (obj.range.length ?? obj.size) - 1;
      headers.set("content-range", `bytes ${start}-${end}/${obj.size}`);
      return new Response(obj.body, { status: 206, headers });
    }

    const res = new Response(obj.body, { headers });
    // เก็บลงแคชไว้ให้คนถัดไป (ทำเบื้องหลัง ไม่หน่วงคนนี้)
    ctx.waitUntil(cache.put(req, res.clone()));
    return res;
  },
};
