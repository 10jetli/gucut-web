// สินค้าเป็นชุด ZORT → คลังเงา — งานตามเวลาทุกครึ่งชั่วโมง
//   ① สต็อก/ราคาของชุด (bundles) — ใบด่วน t_mu1dfbz2 (14 ก.ย. 2569)
//   ② สูตรชุด (bundle_items) — งานกระดาน t_mu1bh4vh (14 ก.ย. 2569)
//
// 🔴 ต้นเหตุใบด่วน: syncBundles() **ไม่มีอะไรเรียกเลย** มีแต่เส้นสั่งมือ ?syncbundles
//    ⇒ ท่านประธานเทียบจอเอง 21:5x: ชุด 00073-11.8-NW ของเราคงเหลือ 41 พร้อมขาย 23 · ZORT คงเหลือ 18 พร้อมขาย -10
//    สั่งซิงก์มือ 22:03 ⇒ ตัวเลขเก่า 187 จาก 360 ชุด [[nothing-triggers-it]]
//
// ⚠️ แยกจาก core-sync โดยตั้งใจ — ลูปนั้นมี ZORT + Shopee + TikTok อยู่ในงบเวลาเดียวแล้ว [[time-budget-is-shared]]
//    งบของไฟล์นี้: สต็อกชุด ~4 วิ (วัดจริง 22:03) + สูตรชุดไม่เกิน 12 วิ ⇒ รวมอยู่ใต้ 26 วิ
// ⚠️ ไม่มี URL (Netlify ไม่ให้ schedule พร้อม path) · สั่งเดี๋ยวนั้น: ?syncbundles=1 · ?syncbundlerecipes=1
// ⚠️ ล้มต้องส่งเสียง — ไม่งั้นตัวเลขหยุดอัปเดตเงียบ ๆ แล้วจอยังโชว์เลขเดิมสวยงาม (คือสิ่งที่เพิ่งเกิด)
import { syncBundles, syncBundleRecipes } from "../lib/core-products.mjs";

const safe = async (fn) => {
  try {
    return await fn();
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 300) };
  }
};

export default async function handler() {
  const stock = await safe(() => syncBundles());
  const recipes = await safe(() => syncBundleRecipes({ deadlineMs: 12000 }));
  const problems = [
    stock?.error ? `สต็อกชุด: ${stock.error}` : null,
    recipes?.error ? `สูตรชุด: ${recipes.error}` : null,
  ].filter(Boolean);
  if (problems.length) {
    const { TELEGRAM_BOT_TOKEN: bt, TELEGRAM_CHAT_ID: ci } = process.env;
    if (bt && ci) {
      await fetch(`https://api.telegram.org/bot${bt}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: ci,
          text: `⚠️ ซิงก์สินค้าเป็นชุดจาก ZORT ล้ม — ตัวเลขในคลังเงาไม่อัปเดตรอบนี้\n${problems.join("\n")}\n\nสั่งซ้ำ: /api/core?syncbundles=1 · /api/core?syncbundlerecipes=1`,
        }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
    }
  }
  return new Response(JSON.stringify({ stock, recipes }), { headers: { "content-type": "application/json" } });
}

// นาทีที่ 27 และ 57 — ไม่ชน core-sync (:13/:43) และ beam-sweep (:00/:30) ที่ยิง ZORT เหมือนกัน
export const config = { schedule: "27,57 * * * *" };
