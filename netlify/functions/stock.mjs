// สต็อก/ราคาสดจาก ZORT — เสิร์ฟที่ /api/stock?sku=XXXX
// รหัส API อยู่ใน Environment Variables ของ Netlify เท่านั้น (ไม่อยู่ในโค้ด)
//   ZORT_STORENAME / ZORT_APIKEY / ZORT_APISECRET
// ตอบ: { found: true, st: <สต็อกพร้อมขาย>, p: <ราคาขาย> }
// cache ที่ edge 3 นาที — ลูกค้าคนถัดไปได้คำตอบทันทีไม่ต้องรอ ZORT

const ZORT = "https://open-api.zortout.com/v4/Product/GetProducts";

export default async function handler(req) {
  const url = new URL(req.url);
  const sku = (url.searchParams.get("sku") || "").trim();
  if (!sku || sku.length > 64) {
    return json({ error: "sku required" }, 400, 60);
  }

  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME || !ZORT_APIKEY || !ZORT_APISECRET) {
    // ยังไม่ได้ตั้งค่า env vars ใน Netlify
    return json({ error: "not configured" }, 503, 0);
  }

  let res;
  try {
    res = await fetch(`${ZORT}?keyword=${encodeURIComponent(sku)}&limit=25`, {
      headers: {
        storename: ZORT_STORENAME,
        apikey: ZORT_APIKEY,
        apisecret: ZORT_APISECRET,
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return json({ error: "zort unreachable" }, 502, 0);
  }
  if (!res.ok) return json({ error: "zort " + res.status }, 502, 0);

  const data = await res.json().catch(() => ({}));
  const skuLower = sku.toLowerCase();
  const exact = (arr) =>
    (arr || []).find((x) => String(x.sku || "").trim().toLowerCase() === skuLower);

  let hit = exact(data.list || data.List);

  // SKU แบบมีขีด (เช่น 00894-22T) — ZORT ค้นทั้งก้อนไม่เจอ
  // ลองใหม่ด้วยรหัสฐานก่อนขีด แล้วจับคู่ SKU เต็มแบบเป๊ะ ๆ ในผลลัพธ์
  if (!hit && sku.includes("-")) {
    const base = sku.split("-")[0];
    if (base.length >= 3) {
      try {
        const r2 = await fetch(
          `${ZORT}?keyword=${encodeURIComponent(base)}&limit=100`,
          {
            headers: {
              storename: ZORT_STORENAME,
              apikey: ZORT_APIKEY,
              apisecret: ZORT_APISECRET,
            },
            signal: AbortSignal.timeout(8000),
          }
        );
        if (r2.ok) {
          const d2 = await r2.json().catch(() => ({}));
          hit = exact(d2.list || d2.List);
        }
      } catch {
        /* ใช้ผลรอบแรกต่อ */
      }
    }
  }

  if (!hit) return json({ found: false }, 200, 300);

  const st = toNum(hit.availablestock ?? hit.stock);
  const p = toNum(hit.sellprice ?? hit.price);
  return json({ found: true, st, p }, 200, 180);
}

export const config = { path: "/api/stock" };

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function json(body, status, edgeSeconds) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (edgeSeconds > 0) {
    headers["Cache-Control"] = "public, max-age=30";
    headers["Netlify-CDN-Cache-Control"] =
      `public, s-maxage=${edgeSeconds}, stale-while-revalidate=900`;
  } else {
    headers["Cache-Control"] = "no-store";
  }
  return new Response(JSON.stringify(body), { status, headers });
}
