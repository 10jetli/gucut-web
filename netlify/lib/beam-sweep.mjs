// กวาดออเดอร์ Beam ที่ค้าง "รอชำระ" ไปถาม Beam เองว่าจ่ายหรือยัง — ตาข่ายชั้นที่ 3
//
// ---------------------------------------------------------------------------
// ทำไมต้องมี (เจอของจริง 26 ส.ค. 2569 — ออเดอร์เงินเข้าใบแรกของร้าน)
//   ลูกค้าจ่าย QR ตอน ~09:00 แต่ร้านเพิ่งรู้ตอน 16:09 เพราะ
//   1. webhook ของ Beam ไม่ยิงเข้ามา (ตอนนั้นติ๊ก event ไว้ผิดตัว —
//      ติ๊ก purchase.succeeded แต่เว็บใช้ Charge API ต้องเป็น charge.succeeded)
//   2. หน้าจอลูกค้าที่ poll ถาม (?id=..&t=..) ก็ช่วยไม่ได้ เพราะลูกค้าปิดหน้าไปแล้ว
//   ร้านไม่รู้ว่ามีเงินเข้า = ไม่ได้ส่งของ ซึ่งแย่กว่ารับเงินไม่ได้เสียอีก
//
// ตาข่ายจึงมี 3 ชั้น — ชั้นไหนพังชั้นถัดไปรับ:
//   ชั้น 1 webhook (เร็วสุด วินาทีเดียว) · ชั้น 2 หน้าจอลูกค้า poll ตอนเปิดค้าง
//   ชั้น 3 ตัวนี้ — ช้าสุดครึ่งชั่วโมง แต่ไม่พึ่งใครเลย
//
// ⚠️ กวาดเฉพาะออเดอร์ 3 วันล่าสุด — QR ของ Beam หมดอายุใน 30 นาที
//    ออเดอร์เก่ากว่านั้นที่ยังไม่จ่ายคือไม่จ่ายแน่แล้ว ถามซ้ำก็เปลืองเปล่า ๆ
//    และกันงานนี้โตตามจำนวนออเดอร์สะสมจนอ่าน Blobs ทั้งถังทุกครึ่งชั่วโมง
// ⚠️ ห้ามโยน error ออกไป — พลาดหนึ่งรอบไม่เป็นไร อีกครึ่งชั่วโมงรันใหม่
// ---------------------------------------------------------------------------

import { getStore } from "@netlify/blobs";
import { chargePaid, getCharge } from "./beam.mjs";

const SWEEP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * @returns {Promise<{checked:number, paid:string[]}>}
 *   paid = เลขออเดอร์ที่เพิ่งรู้ว่าจ่ายแล้วในรอบนี้
 */
export async function sweepBeamOrders() {
  // import แบบเลื่อนเวลา กันวงกลม (orders.mjs ↔ ไฟล์นี้ ผ่าน markOrderPaid)
  const { markOrderPaid } = await import("../functions/orders.mjs");

  const store = getStore({ name: "gucut-orders", consistency: "strong" });
  const { blobs } = await store.list({ prefix: "o/" });
  const cutoff = Date.now() - SWEEP_WINDOW_MS;

  let checked = 0;
  const paid = [];
  const recovered = [];
  const repaired = [];   // ใบเก่าที่ปลดธงย้อนหลังให้ส่งซ้ำ
  for (const b of blobs) {
    const o = await store.get(b.key, { type: "json" }).catch(() => null);
    if (!o || o.status === "cancelled") continue;
    if ((o.at || 0) < cutoff) continue;

    /* 🔴 **ใบที่ "จ่ายแล้วแต่ยังไม่ done" ต้องกวาดด้วย** (แก้ 14 ก.ย. 2569 · t_mtxys7hn)
        เดิม `if (o.paid) continue` ⇒ ใบที่ฟังก์ชันตายหลังบันทึก paid ไม่มีชั้นไหนเก็บเลย
        ไม่ต้องถาม Beam ซ้ำ (รู้แล้วว่าจ่าย) · finalizeOrder จำขั้นที่ทำแล้ว ไม่ส่ง ZORT ซ้ำ */
    if (o.paid) {
      /* 🔴 **ใบที่ ZORT ปฏิเสธ ต้องถูกหยิบมาส่งซ้ำเอง** (18 ก.ย. 2569)
         ท่านประธานสั่ง: *"ต้องทำให้มันออโต้ ห้ามมีคนกดอะไร"*
         เดิมโค้ดติดธง `steps.zort = true` **แม้ส่งไม่สำเร็จ** แล้วตั้ง `done = true` ต่อ
         ⇒ บรรทัด `if (o.done) continue` ข้ามใบนั้นตลอดกาล **ไม่มีใครกลับมาส่งซ้ำ**
         ⇒ Telegram บอกให้ "กดส่งซ้ำในหน้าออเดอร์" = ต้องมีคนกด ซึ่งผิดคำสั่ง

         🔑 **เกณฑ์คือ `ok === false` ไม่ใช่ `id` ว่างหรือไม่** — วัดของจริงแล้ว 18 ก.ย.:
            ออเดอร์จ่ายแล้ว 5 ใบเก็บ `id:null` ทั้งหมด **แต่ค้นในกระจก ZORT เจอครบ 5 ใบ
            สถานะ Success** เพราะ ZORT ใช้เลขออเดอร์เว็บเราเป็นเลขเอกสาร ไม่ได้คืนมาในฟิลด์นั้น
            ⇒ ถ้าเอา `id` เป็นเกณฑ์ ตัวกวาดจะส่งซ้ำทั้ง 5 ใบ = **เอกสารซ้ำ พนักงานแพ็กสองรอบ**
         `skipped` (ยังไม่ตั้งค่า ZORT) กับ `zortFailed` (ครบเพดานแล้ว) ไม่ต้องวน */
      const zortRejected = o.zort && o.zort.ok === false && !o.zort.skipped && !o.zortFailed;
      if (o.done && !zortRejected) continue;
      if (o.done && zortRejected) {
        o.done = false;
        o.steps = { ...(o.steps || {}), zort: false, notified: true };  // notified:true = ห้ามเด้งแจ้งเตือนซ้ำ
        repaired.push(o.id);
      }
      checked++;
      try {
        await markOrderPaid(o, store, null, null);
        recovered.push(o.id);
      } catch { /* รอบหน้าเอาใหม่ */ }
      continue;
    }
    if (!o.beam?.chargeId) continue;

    checked++;
    try {
      const c = await getCharge(o.beam.chargeId);
      if (chargePaid(c)) {
        // ไม่มี req/context ในงานตามเวลา — markOrderPaid รับ null ได้
        // (currentUser หาคนไม่เจอก็แค่ไม่ผูกแต้มให้ ยอดเงิน/ZORT/Telegram ครบปกติ)
        await markOrderPaid(o, store, null, null);
        paid.push(o.id);
      }
    } catch {
      /* ถาม Beam ไม่ได้ตอนนี้ — รอบหน้าเอาใหม่ */
    }
  }
  // recovered = ใบที่จ่ายแล้วแต่งานหลังรับเงินค้าง แล้วรอบนี้เดินต่อให้ (ควรเป็นว่างเกือบตลอด — มีเลขเมื่อไหร่ให้ดูว่าอะไรทำฟังก์ชันตาย)
  return { checked, paid, recovered, repaired };
}
