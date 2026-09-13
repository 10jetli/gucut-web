// รายงานเช้า: ออเดอร์จ่ายแล้วยังไม่ส่ง ⇒ รหัสที่ต้องให้พนักงานนับ — ฟังก์ชันตามเวลา รันเองวันละครั้ง
//
// ⚠️ ฟังก์ชันนี้ "ไม่มี URL" โดยตั้งใจ (Netlify ไม่ให้ฟังก์ชันที่มี schedule เรียกผ่าน HTTP)
//    ดูตัวอย่างโดยไม่ส่ง Telegram: GET /api/core?shipreport=1 (ต้องมีรหัสหลังร้าน)
// ตัวทำงานจริงอยู่ที่ netlify/lib/ship-report.mjs — เหตุผลเรื่องสัญญาณและการแยกอายุอยู่หัวไฟล์นั้น

import { shipReport } from "../lib/ship-report.mjs";

export default async function handler() {
  try {
    const r = await shipReport({ send: true });
    return new Response(JSON.stringify({ ok: true, counts: r.counts, sent: r.sent, skip: r.skip }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    // ⚠️ ห้ามโยน error ออกไป — รายงานพลาดหนึ่งเช้า พรุ่งนี้รันใหม่ได้
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}

// 07:10 เวลาไทย (00:10 UTC) — ช้ากว่า 07:00 สิบนาทีเพราะโควตา D1 รีเซ็ตตอน 07:00
export const config = { schedule: "10 0 * * *" };
