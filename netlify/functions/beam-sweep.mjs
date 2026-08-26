// กวาดออเดอร์ Beam ค้างจ่าย — ฟังก์ชันตามเวลา รันเองทุกครึ่งชั่วโมง
//
// ⚠️ ฟังก์ชันนี้ "ไม่มี URL" โดยตั้งใจ (Netlify ไม่ให้ฟังก์ชันมี schedule พร้อม path)
//    อยากสั่งกวาดเดี๋ยวนั้น ใช้ /api/orders?sweep=1 (ต้องมีรหัสหลังร้าน)
//
// ตัวทำงานจริง + เหตุผลที่ต้องมี อยู่ที่ netlify/lib/beam-sweep.mjs

import { sweepBeamOrders } from "../lib/beam-sweep.mjs";

export default async function handler() {
  try {
    const r = await sweepBeamOrders();
    return new Response(JSON.stringify({ ok: true, ...r }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    // ⚠️ ห้ามโยน error — Netlify จะนับว่างานตามเวลาล้มแล้วรบกวนเจ้าของร้าน
    //    รอบนี้พลาดอีกครึ่งชั่วโมงก็มาใหม่ (และยังมี webhook เป็นชั้นแรกอยู่)
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}

// ทุกครึ่งชั่วโมง — QR หมดอายุใน 30 นาที ช่องที่รู้ช้าสุดจึงพอ ๆ กับอายุ QR หนึ่งใบ
export const config = { schedule: "*/30 * * * *" };
