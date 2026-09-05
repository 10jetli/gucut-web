// เก็บกวาดข้อมูลคนเข้าเว็บที่หมดอายุ — งานตามเวลา ตี 2 ทุกคืน
//
// ⚠️ **ทำไมต้องแยกออกมา** (5 ก.ย. 2569) — ของเดิมกวาดตอน "เปิดหน้าหลังร้าน"
//    พร้อมคอมเมนต์ว่า "ไม่ต้องตั้งงานตามเวลาให้เปลืองอีกตัว"
//    ผลคือ **คนเปิดหน้าคนแรกของวันต้องนั่งรอแทนเครื่อง 25 วินาที** (วัดจริง)
//    ครั้งถัดไปเร็ว 3 วินาที เพราะครั้งแรกกวาดหมดแล้ว ⇒ ยิ่งหาสาเหตุยาก
//    เจ้าของร้านบอกเองว่า "เสียอารมณ์เวลาเข้า"
//    ⇒ **งานบ้านห้ามไปเกาะอยู่กับการกดของคน** ต่อให้ประหยัดกว่าในกระดาษ
//       คนกดเป็นคนจ่ายเวลาให้เสมอ และคนแรกของวันจ่ายทั้งหมดคนเดียว
//
// ⚠️ ฟังก์ชันตามเวลา **ห้ามมี path** (Netlify ไม่ให้มีทั้ง schedule และ path)
//    สั่งเดี๋ยวนั้นได้ที่ GET /api/live?admin=1&sweep=1 (ต้องมี x-admin-key)
//    — ต้องมีทางสั่งเสมอ ไม่งั้นล้มเงียบทุกคืนโดยไม่มีใครรู้
//
// ⚠️ **ล้มแล้วต้องส่งเสียง** — ของที่ไม่ถูกกวาดจะสะสมจนหน้าหลังร้านช้าอีกรอบ
//    และไม่มีอะไรฟ้องจนกว่าจะมีคนบ่นว่าช้า ซึ่งกินเวลาหลายวันกว่าจะรู้

import { sweep } from "../lib/live.mjs";

export default async function handler() {
  let r = null;
  let err = null;
  try {
    r = await sweep();
  } catch (e) {
    err = String(e?.message || e).slice(0, 200);
  }

  // เหลือค้างเยอะแปลว่าเพดานต่อรอบต่ำไป — ต้องมีคนเห็น ไม่ใช่ปล่อยผ่าน
  const stuck = !err && r && r.left > 0;
  if (err || stuck) {
    try {
      const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        const text = err
          ? `⚠️ เก็บกวาดข้อมูลคนเข้าเว็บล้ม: ${err}\nปล่อยไว้จะสะสมจนหน้าหลังร้านช้า`
          : `⚠️ เก็บกวาดข้อมูลคนเข้าเว็บไม่หมด — ลบไป ${r.gone} เหลือค้าง ${r.left} (เพดานรอบละ ${r.cap})\nถ้าเหลือค้างทุกคืน ต้องเพิ่มเพดาน`;
        // ⚠️ ต้อง await — Netlify แช่แข็งฟังก์ชันทันทีที่ตอบ ปล่อยลอย = ข้อความหาย
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
          signal: AbortSignal.timeout(8000),
        });
      }
    } catch {
      // แจ้งเตือนไม่ได้ก็ไม่ควรทำให้งานทั้งรอบล้ม
    }
  }

  return new Response(JSON.stringify({ ok: !err, ...(r || {}), error: err }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/* ตี 2 เวลาไทย = 19:00 UTC — ช่วงที่คนเข้าเว็บน้อยที่สุด
   ⚠️ เปลี่ยนเวลาแล้วไม่มีผลกับจอไหน แต่ **ห้ามไปชนกับ beam-sweep ทุกครึ่งชั่วโมง** */
export const config = { schedule: "0 19 * * *" };
