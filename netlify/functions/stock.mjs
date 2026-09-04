// สต็อก/ราคาสดจาก ZORT — เสิร์ฟที่ /api/stock?sku=XXXX
// รหัส API อยู่ใน Environment Variables ของ Netlify เท่านั้น (ไม่อยู่ในโค้ด)
//   ZORT_STORENAME / ZORT_APIKEY / ZORT_APISECRET
// ตอบ: { found: true, st: <สต็อกพร้อมขาย>, p: <ราคาขาย> }
//      สินค้าเป็นชุด (โซ่ตัดขาย) ตอบ { found: true, st, kind: "bundle", priceFrom: "web" }
//      **ไม่มี p โดยตั้งใจ** — ราคาเว็บกับ ZORT ยังไม่ตรงกัน 100 รหัส รอเจ้าของร้านตัดสิน
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

  /* ── ยังไม่เจอ: ลองในสินค้าเป็นชุด (Bundle) ── (5 ก.ย. 2569)
      ⚠️ **โซ่ตัดขายทุกความยาวอยู่ใน Bundle ไม่ได้อยู่ใน Product** — 148 รหัส
         ZORT คิดจำนวนที่ขายได้ให้เองจากม้วนแม่ (00369 ม้วน 5,911 ÷ 25 ⇒ 00369-25T ได้ 236)
         ตัวนี้เลยเคยตอบ found:false กับสินค้ากลุ่มนี้มาตลอด แล้วหน้าเว็บต้องคำนวณเอง

      🛑 **ห้ามคืนราคาจาก Bundle เด็ดขาด** — ฝั่งจอตรวจแล้ว 5 ก.ย. 2569
         ราคาบนเว็บกับราคาใน ZORT **ต่างกัน 100 จาก 146 รหัส** (00369-25T เว็บ 380 · ZORT 450)
         และ `orders.mjs` มีท่อน `if (zp > 0 && zp !== i.price) i.price = zp`
         ⇒ ถ้าส่งราคาไปด้วย **ลูกค้าที่เห็น 380 จะถูกเรียกเก็บ 450 ทันที โดยไม่มีอะไรบอกเขา**
         ยังไม่มีใครรู้ว่าฝั่งไหนถูก ⇒ **เป็นเรื่องที่เจ้าของร้านต้องตัดสิน ไม่ใช่เรา**
      ⇒ คืนแต่ `st` · ไม่มี `p` ⇒ หน้าเว็บใช้ราคาเดิมของตัวเอง และตัวตรวจราคาไม่ทำงานกับกลุ่มนี้
         (เหมือนเดิมทุกประการ — เปลี่ยนแค่ "รู้จำนวน" ไม่เปลี่ยน "รู้ราคา") */
  if (!hit) {
    try {
      const rb = await fetch(
        `https://open-api.zortout.com/v4/Bundle/GetBundles?keyword=${encodeURIComponent(sku)}&limit=25`,
        {
          headers: {
            storename: ZORT_STORENAME,
            apikey: ZORT_APIKEY,
            apisecret: ZORT_APISECRET,
          },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (rb.ok) {
        const db = await rb.json().catch(() => ({}));
        const b = exact(db.list || db.List);
        if (b) {
          // ⚠️ ไม่มี p โดยตั้งใจ — ดูเหตุผลด้านบน ห้ามเติมกลับโดยไม่ถามเจ้าของร้าน
          return json(
            { found: true, st: toNum(b.availablestock ?? b.stock), kind: "bundle", priceFrom: "web" },
            200,
            180
          );
        }
      }
    } catch {
      /* ถามชุดไม่ได้ก็ตอบ not found เหมือนเดิม — ห้ามล้ม */
    }
    return json({ found: false }, 200, 300);
  }

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
