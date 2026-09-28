// กวาดออเดอร์ Beam ค้างจ่าย — ฟังก์ชันตามเวลา รันเองทุกครึ่งชั่วโมง
//
// ⚠️ ฟังก์ชันนี้ "ไม่มี URL" โดยตั้งใจ (Netlify ไม่ให้ฟังก์ชันมี schedule พร้อม path)
//    อยากสั่งกวาดเดี๋ยวนั้น ใช้ /api/orders?sweep=1 (ต้องมีรหัสหลังร้าน)
//
// ตัวทำงานจริง + เหตุผลที่ต้องมี อยู่ที่ netlify/lib/beam-sweep.mjs

import { getStore } from "@netlify/blobs";
import { sweepBeamOrders } from "../lib/beam-sweep.mjs";
import { syncShippingAll } from "../lib/zort-order.mjs";
import { ครอบงานตามเวลา } from "../lib/job-timing.mjs";

/* 📨 **สรุปของรอบนี้ ผูกกับ Response ที่คืนออกไป** (28 ก.ย. 2569 · ข้อที่ฝั่งจอขอ)
   ฝั่งจอไล่ทางเดินแล้วพบว่า `stoppedBecause` / `elapsedMs` ของ `syncShippingAll`
   ไปจบที่ response ของฟังก์ชันนี้ **แล้วหายไปกับ Netlify** — สมุด `job_run_log` จดแค่ `HTTP <status>`
   ⇒ ค่าที่เพิ่งเติมจะกลายเป็น "ช่องที่ส่งแล้วไม่มีใครได้ยิน" รอบที่สอง (คลาสเดียวกับ `src` ของ /api/stock)
   🔑 ใช้ WeakMap ผูกกับตัว Response **ไม่ใช้ตัวแปรระดับโมดูล** — งานนี้วันนี้วิ่งทีละรอบก็จริง
      แต่ตัวแปรร่วมจะพังเงียบวันที่มีสองรอบทับกัน และไม่มีอะไรฟ้อง */
const สรุปของรอบ = new WeakMap();

/** แปลงผลของ `syncShippingAll` เป็นสิ่งที่สมุด `job_run_log` เก็บได้ — **แยกออกมาเพื่อทดสอบพฤติกรรม**
 *  🔑 ฝั่งจอเจอมาแล้ว (28 ก.ย. 2569) ว่าเทสที่ตรวจ "ข้อความนี้มีอยู่ในไฟล์ไหม"
 *     **ไม่ได้ตรวจว่าเส้นทางนั้นใช้มัน** ⇒ ตรรกะที่ตัดสินอะไรต้องอยู่ในฟังก์ชันที่เรียกได้
 *
 *  สามสถานะของ `นับ` (จอวาดคนละแบบทั้งสาม):
 *   · `{สำเร็จ, ล้ม}` = ท่อนับให้แล้ว
 *   · `null`          = **ท่อไม่ได้นับชิ้นให้รอบนี้** (กิ่งในพัง ⇒ `ship` เป็น `{}`) ⇒ จอขึ้นขีด (—)
 *   🚫 ห้ามใส่ `{สำเร็จ:0, ล้ม:0}` แทนความไม่รู้ — "ไม่มีใบให้ตรวจ" กับ "ไม่ได้ตรวจ" ต่างกันคนละเรื่อง
 */
export function สรุปรอบกวาด(ship) {
  const มีคีย์ = (k) => ship && typeof ship === "object" && k in ship;
  return {
    นับ: Number.isFinite(ship?.checked) && Number.isFinite(ship?.askFailed)
      ? { สำเร็จ: ship.checked, ล้ม: ship.askFailed }
      : null,
    note: [
      ship?.stoppedBecause ? `กวาดส่งของจบเพราะ: ${ship.stoppedBecause}` : null,
      /* `stoppedBecause === null` = ไล่ครบคิวจริง ⇒ **ต้องพูดออกมา ไม่ใช่เงียบ**
         เงียบ = จอแยกไม่ออกว่า "ครบ" หรือ "ท่อรุ่นเก่าที่ยังไม่มีคีย์นี้"
         ⇒ จึงเช็คด้วย `in` ไม่ใช่ค่าความจริง (คลาส optional-chain-doesnt-guard-right-side) */
      มีคีย์("stoppedBecause") && ship.stoppedBecause === null
        ? "กวาดส่งของ: ไล่ครบคิวแล้ว" : null,
      Number.isFinite(ship?.elapsedMs) ? `กวาดส่งของใช้ ${ship.elapsedMs} ms` : null,
      ship?.askFailReason ? `เหตุที่ถาม ZORT ไม่สำเร็จ: ${ship.askFailReason}` : null,
    ].filter(Boolean).join(" · ") || null,
  };
}

async function handler() {
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
    const res = new Response(JSON.stringify({ ok: true, ...r, ship, remind }), {
      headers: { "content-type": "application/json" },
    });
    /* ⚠️ `ship` เป็น `{}` ถ้ากิ่งในพัง ⇒ `checked`/`askFailed` เป็น undefined
       ⇒ `อ่านผลย่อย` จะคืน null เอง ⇒ จอขึ้นขีด (—) = **"ท่อไม่ได้นับชิ้นให้รอบนี้"**
          ไม่ใช่ "สำเร็จ 0 ชิ้น" (สามสถานะที่ตกลงกับฝั่งจอ — ห้ามใส่ 0 แทนความไม่รู้) */
    สรุปของรอบ.set(res, สรุปรอบกวาด(ship));
    return res;
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
/* ⏱️ จดเวลาของรอบนี้ลงสมุด `job_run_log` ทุกรอบ (19 ก.ย. 2569 · ใบ S1)
   🔑 ฝั่งจอวัดจาก cron จริงแล้วชี้ว่า ยอด 26.25 นาที/วันที่เคยรายงาน **ครอบแค่ 58% ของรอบทั้งหมด**
      (288 รอบ/วันมีสมุด · 209 รอบ/วันไม่มี) ⇒ ตัวนี้อยู่ในกองที่ยังไม่มีใครวัด
   🚫 **ห้ามยิงฟังก์ชันนี้เพื่อจับเวลา** — มันทำงานจริง (เงิน/สต็อก/กระจก) และกินเวลาที่กำลังจะวัดพอดี
   ⚠️ ผลในสมุดเป็น `ไม่ได้ตัดสิน` โดยตั้งใจ — งานนี้ตอบ 200 ได้แม้ข้างในมี error
      ⇒ เดาว่า 200 = สำเร็จ จะได้สมุดที่เต็มไปด้วย ok ปลอม (แย่กว่าไม่รู้) · ดู note = HTTP status */
export default ครอบงานตามเวลา("beam-sweep", handler, {
  /* 🔑 อ่านจากสรุปที่ handler ผูกไว้กับ Response — ไม่แกะ body (แกะแล้ว body ถูกใช้ไปแล้ว) */
  อธิบาย: (r) => สรุปของรอบ.get(r)?.note ?? null,
  นับชิ้น: (r) => สรุปของรอบ.get(r)?.นับ ?? null,
});

export const config = { schedule: "*/30 * * * *" };
