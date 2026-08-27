// กวาดออเดอร์ Beam ค้างจ่าย — ฟังก์ชันตามเวลา รันเองทุกครึ่งชั่วโมง
//
// ⚠️ ฟังก์ชันนี้ "ไม่มี URL" โดยตั้งใจ (Netlify ไม่ให้ฟังก์ชันมี schedule พร้อม path)
//    อยากสั่งกวาดเดี๋ยวนั้น ใช้ /api/orders?sweep=1 (ต้องมีรหัสหลังร้าน)
//
// ตัวทำงานจริง + เหตุผลที่ต้องมี อยู่ที่ netlify/lib/beam-sweep.mjs

import { getStore } from "@netlify/blobs";
import { sweepBeamOrders } from "../lib/beam-sweep.mjs";
import { syncShippingAll } from "../lib/zort-order.mjs";

export default async function handler() {
  try {
    const r = await sweepBeamOrders();
    // พ่วงกวาดสถานะส่งของจาก ZORT + แจ้ง LINE ลูกค้า (27 ส.ค. 2569)
    // ร้านใส่เลขพัสดุใน ZORT → ภายในครึ่งชั่วโมงลูกค้าได้ LINE + เว็บอัปเดตเอง
    let ship = {};
    let remind = {};
    try {
      const store = getStore({ name: "gucut-orders", consistency: "strong" });
      ship = await syncShippingAll(store);
      // ทวงตะกร้า + ทวงยอดค้างจ่าย ไปหาลูกค้า (เจ้าของร้านสั่ง 28 ส.ค. 2569
      // "ต้องมีระบบแจ้งเตือน ในตะกร้า กับ ชำระเงิน — แจ้งลูกค้า ไม่ใช่ผม")
      const { remindPendingPayments, remindStaleCarts } = await import("../lib/remind.mjs");
      remind = {
        pay: await remindPendingPayments(store).catch(() => -1),
        cart: await remindStaleCarts(store).catch(() => -1),
      };
    } catch { /* กวาดส่งของ/ทวงพลาดไม่ควรล้มตัวกวาด Beam */ }
    return new Response(JSON.stringify({ ok: true, ...r, ship, remind }), {
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
