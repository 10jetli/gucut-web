// สลิปใหม่จาก ZORT → ถังปิด gucut-zort-slips ทีละ ≤8 ใบต่อชั่วโมง (ร้าน z1) — ใบกระดาน t_mu2sow9d · ดู netlify/lib/slip-scan.mjs
// ⚠️ ไม่มี URL (Netlify ไม่ให้ schedule พร้อม path) · สั่งเดี๋ยวนั้น: GET /api/core?slipscan=1
// ⚠️ เตือน Telegram เฉพาะตอนทั้งรอบล้ม — error รายใบ (ZORT ตอบผิดปกติบางใบ) มีได้ทุกชั่วโมง เตือนทุกครั้ง = คนเลิกอ่าน
import { slipScanStep } from "../lib/slip-scan.mjs";

export default async function handler() {
  let r;
  try {
    r = await slipScanStep();
  } catch (e) {
    r = { ok: false, error: String(e?.message || e).slice(0, 300) };
  }
  if (r?.ok === false) {
    const { TELEGRAM_BOT_TOKEN: bt, TELEGRAM_CHAT_ID: ci } = process.env;
    if (bt && ci) {
      await fetch(`https://api.telegram.org/bot${bt}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: ci, text: `⚠️ ตัวดึงสลิปใหม่จาก ZORT ล้ม: ${r.error} — สลิปที่มาหลังจากนี้ยังไม่ถูกเก็บจนกว่าจะแก้` }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
    }
  }
  return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
}

// นาทีที่ 50 — ไม่ชน core-sync (:13/:43) · bundle-recipe (:27/:57) · contacts (:19) · returns (:07) · backup (:40) · beam (:00/:30)
export const config = { schedule: "50 * * * *" };
