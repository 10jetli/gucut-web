// ตามเตือนลูกค้าเรื่องขอทะเบียน — ฟังก์ชันตามเวลา รันเองวันละครั้ง
//
// ⚠️ ฟังก์ชันนี้ "ไม่มี URL" โดยตั้งใจ
//    Netlify ไม่ให้ฟังก์ชันที่มี schedule เรียกผ่าน HTTP ในโปรดักชัน
//    อยากสั่งให้ตามเดี๋ยวนั้น ใช้ /api/permit-doc?remind=1 (ต้องมีรหัสหลังร้าน)
//
// ตัวทำงานจริงอยู่ที่ netlify/lib/permit-remind.mjs — เหตุผลอยู่ในหัวไฟล์นั้น

import { runReminders } from "../lib/permit-remind.mjs";

export default async function handler() {
  try {
    const r = await runReminders();
    return new Response(JSON.stringify({ ok: true, ...r }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    // ⚠️ ห้ามโยน error ออกไป Netlify จะนับว่าฟังก์ชันตามเวลาล้มแล้วรบกวนเจ้าของร้าน
    //    งานตามเตือนพลาดหนึ่งรอบไม่ใช่เรื่องคอขาดบาดตาย พรุ่งนี้รันใหม่ได้
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}

// ตี ๙ ครึ่งเวลาไทย (02:30 UTC) — เช้าพอที่ลูกค้าตื่นแล้ว ไม่ดึกจนรบกวน
export const config = { schedule: "30 2 * * *" };
