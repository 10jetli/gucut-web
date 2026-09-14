// สูตรสินค้าเป็นชุด ZORT → คลังเงา (bundle_items) — งานตามเวลาทุกชั่วโมง · งานกระดาน t_mu1bh4vh (14 ก.ย. 2569)
//
// ⚠️ แยกจาก core-sync โดยตั้งใจ — ลูปนั้นมี ZORT + Shopee + TikTok อยู่ในงบเวลาเดียวแล้ว [[time-budget-is-shared]]
// ⚠️ ไม่มี URL (Netlify ไม่ให้ schedule พร้อม path) · สั่งเดี๋ยวนั้น: GET /api/core?syncbundlerecipes=1[&limit=N]
// ⚠️ ล้มทั้งรอบต้องส่งเสียง — ไม่งั้นสูตรชุดหยุดอัปเดตเงียบ ๆ แล้วจอยังโชว์สูตรเดิมสวยงาม
import { syncBundleRecipes } from "../lib/core-products.mjs";

export default async function handler() {
  let r;
  try {
    r = await syncBundleRecipes();
  } catch (e) {
    r = { ok: false, error: String(e?.message || e).slice(0, 300) };
  }
  if (r?.error) {
    const { TELEGRAM_BOT_TOKEN: bt, TELEGRAM_CHAT_ID: ci } = process.env;
    if (bt && ci) {
      await fetch(`https://api.telegram.org/bot${bt}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: ci,
          text: `⚠️ ซิงก์สูตรสินค้าเป็นชุดจาก ZORT ล้ม — สูตรชุดในคลังเงาไม่อัปเดตรอบนี้\n${r.error}\n\nสั่งซ้ำ: /api/core?syncbundlerecipes=1`,
        }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
    }
  }
  return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
}

// นาทีที่ 27 — ไม่ชน core-sync (:13/:43) และ beam-sweep (:00/:30) ที่ยิง ZORT เหมือนกัน
export const config = { schedule: "27 * * * *" };
