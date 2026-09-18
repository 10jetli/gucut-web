// สต็อก/ราคาของสินค้าเป็นชุด ZORT → คลังเงา — **งานตามเวลาชั่วโมงละครั้ง (นาทีที่ 33)**
//
// 🔴 **ทำไมต้องแยกออกมาจาก bundle-recipe-sync** (19 ก.ย. 2569 · ฝั่งจอเป็นคนชี้)
//    เดิมงานเดียวทำสองอย่าง: `syncBundles()` (สต็อก/ราคา) + `syncBundleRecipes()` (สูตร)
//    วันที่ 18 ก.ย. ผมลดรอบงานนั้นเป็นวันละครั้งเพื่อลดเครดิต **โดยเล็งที่งานสูตร**
//    (สูตรชุดเปลี่ยนเดือนละครั้งสองครั้ง ⇒ ถาม 48 ครั้ง/วันคือเสียเปล่า)
//    ⇒ **แต่ตัวเลขสต็อกชุดถูกลากไปเป็นวันละครั้งด้วย ซึ่งผมไม่ได้ตั้งใจ**
//
// 🔴 ผลเสียที่วัดได้ ไม่ใช่เดา (19 ก.ย. 2569):
//    · ยิง `?syncbundles=1` รอบเดียว ⇒ **สต็อกเปลี่ยน 43 จาก 360 ชุด**
//      ⇒ สต็อกชุดขยับตลอดเวลา · ปล่อยให้เก่าได้ 24 ชม. = **คนขายชุดอาจขายของที่ไม่มี**
//      (วันนั้นมีชุดที่คงเหลือติดลบอยู่ 1 ชุดแล้ว)
//    · ฝั่งจอตั้งเกณฑ์เตือนไว้ 90 นาที ⇒ กับรอบวันละครั้ง **แถบแดงจะขึ้นราว 22.5 ชม./วัน ทุกวัน**
//      ⇒ คนเลิกอ่านจอสถานะ ซึ่งแย่กว่าไม่มีจอ
//
// 🔑 **เกณฑ์ที่ใช้ตัดสินว่าแยกได้: วัดต้นทุนของแต่ละส่วนก่อน ไม่ใช่เดา**
//    วัดจริงจาก production: `syncBundles()` = **4.5 วินาที/รอบ**
//    ⇒ ชั่วโมงละครั้ง = 24 รอบ/วัน ≈ **1.8 นาที/วัน** ⇒ ถูกพอที่จะคุ้มกับการไม่ขายของที่ไม่มี
//    ส่วน `syncBundleRecipes()` = ~4 วินาทีต่อ 20 ชุด × 360 ชุด ⇒ หนักกว่ามาก ⇒ **คงวันละครั้ง**
//    🚫 ห้ามยุบสองงานกลับเป็นตัวเดียวอีก — ต้นทุนกับความจำเป็นของสองอย่างนี้ต่างกันคนละระดับ
//
// ⚠️ นาทีที่ 33 — เลี่ยงงานอื่นที่ยิง ZORT พร้อมกัน:
//    beam-sweep (:00/:30) · returns-sync (:07) · core-sync (:13) · contacts-sync (:19) ·
//    backup-run (:40 ทุก 6 ชม.) · mkp-fees-sync (:47) · slips-sync (:50) · bundle-recipe-sync (03:00 UTC)
// ⚠️ **บรรทัดแรกของไฟล์นี้เป็นที่มาของช่อง `desc` ใน cron-table** ⇒ แก้ตารางแล้วต้องแก้บรรทัดนั้นด้วย
//    (คลาสนี้กัดมาแล้ว 3 ครั้งใน 19 ก.ย. — bundle-recipe-sync · backup-run · core-sync)
// ⚠️ สั่งเดี๋ยวนั้น: GET /api/core?syncbundles=1
import { syncBundles } from "../lib/core-products.mjs";

export default async function handler() {
  let stock;
  try {
    stock = await syncBundles();
  } catch (e) {
    stock = { ok: false, error: String(e?.message || e).slice(0, 300) };
  }
  /* ล้มแล้วต้องมีคนรู้ — ตัวเลขสต็อกชุดค้างเงียบคือของที่คนเอาไปขาย
     ⚠️ await ตัวแจ้งเตือน (Netlify แช่แข็งฟังก์ชันหลังตอบ ⇒ promise ลอยตายกลางทาง) */
  if (stock?.error) {
    const { TELEGRAM_BOT_TOKEN: bt, TELEGRAM_CHAT_ID: ci } = process.env;
    if (bt && ci) {
      await fetch(`https://api.telegram.org/bot${bt}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: ci,
          text:
            "⚠️ ซิงก์สต็อกสินค้าเป็นชุดล้ม — ตัวเลขคงเหลือ/พร้อมขายของชุดไม่อัปเดตรอบนี้\n" +
            `${stock.error}\n\nสั่งซ้ำ: /api/core?syncbundles=1`,
        }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
    }
  }
  return new Response(JSON.stringify({ stock }), { headers: { "content-type": "application/json" } });
}

export const config = { schedule: "33 * * * *" };
