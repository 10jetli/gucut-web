// งานตามเวลา: ดึงรีวิว Shopee ผ่าน API ทุกคืน 00:20 ไทย (17:20 UTC)
//
// ⚠️ ฟังก์ชันนี้ไม่มี URL โดยตั้งใจ (Netlify ไม่ให้ schedule พร้อม path)
//    สั่งเดี๋ยวนั้นใช้ /api/shopee/pull (ต้องมีรหัสหลังร้าน)
// วิ่งหลังตัวเก็บเดิม (00:00) — ของซ้ำตกที่ปลายทาง ไม่มีอะไรพัง โดยตั้งใจ
import { shopeeReady, isTest } from "../lib/shopee.mjs";
import { pullShopeeReviews } from "../lib/shopee-reviews.mjs";

export default async function handler() {
  try {
    if (!shopeeReady() || isTest()) return new Response("skip");
    const r = await pullShopeeReviews("https://gucut.com");
    console.log("shopee-reviews-pull:", JSON.stringify(r));
    return new Response("ok");
  } catch (e) {
    console.log("shopee-reviews-pull error:", String(e?.message || e));
    return new Response("error");
  }
}

export const config = { schedule: "20 17 * * *" };
