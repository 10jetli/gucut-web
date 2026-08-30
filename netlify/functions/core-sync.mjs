// คลังเงา GUCUT Core — งานตามเวลา รันเองทุกครึ่งชั่วโมง (เหลื่อมจาก beam-sweep 13 นาที)
//
// ⚠️ ฟังก์ชันนี้ไม่มี URL โดยตั้งใจ (Netlify ไม่ให้ schedule พร้อม path)
//    สั่งเดี๋ยวนั้น/ย้อนหลัง ใช้ /api/core?sync=1 (ต้องมีรหัสหลังร้าน)
//
// ทุกรอบ: กระจกออเดอร์ 3 วันล่าสุด · รอบตี 1 (เวลาไทย): เทียบยอดเมื่อวาน + ถ่ายสต็อก
import { syncOrders, reconYesterday, snapshotStock } from "../lib/core-sync.mjs";

export default async function handler() {
  try {
    const sync = await syncOrders(3);

    // ตี 1 เวลาไทย (18:00-18:29 UTC) — งานรายวัน
    let daily = null;
    const utcH = new Date().getUTCHours();
    const utcM = new Date().getUTCMinutes();
    if (utcH === 18 && utcM < 30) {
      daily = {
        recon: await reconYesterday().catch((e) => ({ error: String(e?.message || e) })),
        stock: await snapshotStock().catch((e) => ({ error: String(e?.message || e) })),
      };
    }

    return new Response(JSON.stringify({ ok: true, sync, daily }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    // ห้ามโยน error — คลังเงาพลาดรอบนี้ อีกครึ่งชั่วโมงมาใหม่ ของจริง (ZORT) ไม่กระทบ
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}

// เหลื่อมจาก beam-sweep (:00/:30) ไป :13/:43 — ไม่แย่ง ZORT พร้อมกัน
export const config = { schedule: "13,43 * * * *" };
