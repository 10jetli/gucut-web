// ดึงรีวิวจาก Shopee ผ่าน Open API แล้วส่งเข้า /api/reviews-ingest
//
// มาแทน "ตัวเก็บแบบเปิดเบราว์เซอร์" เฉพาะฝั่ง Shopee (Lazada/TikTok ยังใช้ตัวเดิม)
// ข้อได้เปรียบ: **ได้ URL รูปในรีวิวมาตรง ๆ** (Seller Centre ซ่อนรูปจากการอ่านด้วยโค้ด
// พิสูจน์แล้ว 31 ส.ค. 2569) และไม่พึ่ง Chrome เปิดค้าง
//
// ⚠️ ยิงเข้าท่อ /api/reviews-ingest เหมือนตัวเก็บทุกตัว — กันซ้ำ/เก็บคลิปลง R2 อยู่ที่นั่น
//    ห้ามเขียนลง store ตรง ๆ เอง เดี๋ยวกติกาแตกกันคนละทาง
// ⚠️ item_id ของ Shopee ต้องแปลงเป็น SKU ก่อน (get_item_base_info)
//    แล้วปลายทางแปลง SKU → handle ต่อให้เอง
import { validToken, shopCall } from "./shopee.mjs";

const PAGES = 3; // หน้าละ 50 = กวาดล่าสุด ~150 ใบต่อคืน (กันซ้ำอยู่ปลายทาง ยิงซ้ำได้)

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

/** วันแบบไทย (UTC+7) จาก epoch วินาที — กติกาเดียวกับทุกระบบในโปรเจกต์ */
function thaiDate(epoch) {
  const d = new Date((Number(epoch) || 0) * 1000 + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export async function pullShopeeReviews(origin) {
  const t = await validToken();
  if (!t) return { error: "ยังไม่ได้เชื่อมร้าน Shopee" };
  const secret = process.env.REVIEWS_INGEST_SECRET;
  if (!secret) return { error: "ยังไม่ได้ตั้ง REVIEWS_INGEST_SECRET" };

  // 1) กวาดรีวิวหน้าล่าสุด
  const comments = [];
  let cursor = "";
  for (let p = 0; p < PAGES; p++) {
    const data = await shopCall("/api/v2/product/get_comment", {
      page_size: "50",
      ...(cursor ? { cursor } : {}),
    });
    const list = data?.response?.item_comment_list ?? [];
    comments.push(...list);
    if (!data?.response?.more) break;
    cursor = String(data?.response?.next_cursor ?? "");
    if (!cursor) break;
  }
  if (!comments.length) return { pulled: 0 };

  // 2) แปลง item_id → SKU (ปลายทางแปลง SKU → handle ให้เองอีกต่อ)
  const ids = [...new Set(comments.map((c) => c.item_id).filter(Boolean))];
  const skuById = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const info = await shopCall("/api/v2/product/get_item_base_info", {
        item_id_list: chunk.join(","),
      });
      for (const it of info?.response?.item_list ?? []) {
        // ใช้ SKU ระดับสินค้า ถ้าไม่มีค่อยถอยไปใช้ชื่อสินค้า (ตารางเทียบชื่อฝั่ง build รับต่อ)
        skuById.set(it.item_id, it.item_sku || it.item_name || "");
      }
    } catch {
      /* หมวดนี้พังไม่ต้องล้มทั้งรอบ — ใบที่ไม่มี SKU จะตกเป็น bad ที่ปลายทาง */
    }
  }

  // 3) ประกอบเป็นรีวิวตามรูปแบบของ /api/reviews-ingest
  const reviews = comments
    .map((c) => {
      const handle = skuById.get(c.item_id) || "";
      if (!handle) return null;
      const vids = c.media?.video_url_list ?? [];
      return {
        platform: "shopee",
        handle,
        rating: c.rating_star,
        author: c.buyer_username || "",
        text: c.comment || "",
        images: (c.media?.image_url_list ?? []).slice(0, 6),
        date: thaiDate(c.comment_time || c.create_time),
        id: String(c.comment_id || ""),
        // คลิปส่งเป็นลิงก์ ปลายทางดึงไปเก็บ R2 เอง (ลิงก์ Shopee หมดอายุได้ ต้องเก็บคืนนั้นเลย)
        ...(vids.length ? { video: { url: vids[0] } } : {}),
      };
    })
    .filter(Boolean);

  // 4) ยิงเข้าท่อกลาง — แยกใบมีคลิปเป็นก้อนละ 6 (เพดานเก็บคลิปต่อคำขอของปลายทาง)
  const withVideo = reviews.filter((r) => r.video);
  const noVideo = reviews.filter((r) => !r.video);
  const batches = [];
  if (noVideo.length) batches.push(noVideo);
  for (let i = 0; i < withVideo.length; i += 6) batches.push(withVideo.slice(i, i + 6));

  const total = { sent: 0, added: 0, dup: 0, bad: 0, videoSaved: 0, videoFailed: 0 };
  for (const batch of batches) {
    const res = await fetch(`${origin}/api/reviews-ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, reviews: batch }),
      signal: AbortSignal.timeout(25000),
    });
    const r = await res.json().catch(() => ({}));
    total.sent += batch.length;
    total.added += r.added || 0;
    total.dup += r.dup || 0;
    total.bad += r.bad || 0;
    total.videoSaved += r.video?.saved || 0;
    total.videoFailed += r.video?.failed || 0;
  }
  return { pulled: comments.length, noSku: comments.length - reviews.length, ...total };
}

