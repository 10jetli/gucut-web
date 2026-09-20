// สลิปใหม่จาก ZORT → ถังปิด gucut-zort-slips ทีละ ≤8 ใบต่อชั่วโมง (ร้าน z1) — ใบกระดาน t_mu2sow9d · ดู netlify/lib/slip-scan.mjs
// ⚠️ ไม่มี URL (Netlify ไม่ให้ schedule พร้อม path) · สั่งเดี๋ยวนั้น: GET /api/core?slipscan=1
// ⚠️ เตือน Telegram เฉพาะตอนทั้งรอบล้ม — error รายใบ (ZORT ตอบผิดปกติบางใบ) มีได้ทุกชั่วโมง เตือนทุกครั้ง = คนเลิกอ่าน
// ⏱️ จดเวลาตัวเองลงสมุด `job_run_log` ทุกรอบ (19 ก.ย. 2569 · ใบ S1) — อ่านที่ /api/core?jobtiming=1
//    🔑 **ห้ามยิงฟังก์ชันนี้เพื่อจับเวลา** — มันเขียนข้อมูลจริงและกินเวลาฟังก์ชันที่กำลังจะวัดพอดี
import { slipScanStep } from "../lib/slip-scan.mjs";
import { วัดเวลางาน, ผู้เรียกจากคำขอ } from "../lib/job-timing.mjs";

export default async function handler(req) {
  let r;
  let จดเวลา = null;
  try {
    const t = await วัดเวลางาน("slips-sync", slipScanStep, {
      // 🔎 "รอบนี้ใครสั่ง" — อ่านจากคำขอ ห้ามเดา (ดูเหตุผลใน job-timing.mjs)
      ผู้เรียก: await ผู้เรียกจากคำขอ(req),
      // ตัวงานบอก ok มาตรง ๆ · ไม่มีคีย์ ok = ไม่ได้ตัดสิน (ห้ามเดาว่าสำเร็จ)
      ตัดสินผล: (x) => (x?.ok === false ? "failed" : x?.ok === true ? "ok" : null),
      /* 🔴 **note ต้องเป็นหลักฐานว่าแตะงานจริง ไม่ใช่ null** (แก้ 19 ก.ย. เย็น · ฝั่งจอชี้)
         เดิมผมอ่านช่อง `saved` ซึ่ง **ไม่มีอยู่ในคำตอบของ slipScanStep เลย** ⇒ note เป็น null ทุกแถว
         ⇒ เหลือแต่ `outcome: ok` ซึ่ง **ผู้เรียกเป็นคนบอก** ⇒ ไม่ใช่หลักฐานว่างานเกิดขึ้นจริง
         🔑 ตัววัดต้องพิสูจน์ว่าแตะงานจริง — ช่องจริงคือ scanned/stored/errors */
      อธิบาย: (x) =>
        x?.skip ? `skip: ${x.skip}`
          : x && (x.scanned != null || x.stored != null)
            ? `scanned ${x.scanned ?? "?"} · stored ${x.stored ?? "?"} · errors ${x.errors ?? "?"}${x.wrapped ? " · วนครบรอบ" : ""}`
            /* 🔴 **ห้ามคืน `null`** (แก้ 20 ก.ย. 2569 · ฝั่งจอยิงสมุดแล้วเจอ)
               เดิมรูปไม่ตรงที่คาด ⇒ `null` ⇒ **`note` ว่าง** ⇒ สมุดบอก `ok` โดยไม่มีหลักฐานว่าแตะงาน
               ⇒ ⇒ `slips-sync` วิ่ง **24 รอบ/วัน** ⇒ 24 รอบที่ **แยกไม่ออกว่า "ทำงานแล้ว"
                  หรือ "รันแล้วไม่เจอของ"** — และกองนี้เราเอาไปคิดต้นทุน
               🔑 `0 รายการ` เป็นหลักฐาน · **ไม่มี note ไม่ใช่หลักฐาน** ⇒ คนละเรื่องกันเลย */
            : `รูปคำตอบไม่ตรงที่คาด ⇒ คีย์ที่ได้: ${
                x === null ? "null" : x && typeof x === "object" ? Object.keys(x).slice(0, 8).join(",") || "(ว่าง)" : typeof x
              }`,
    });
    r = t.ผลลัพธ์;
    จดเวลา = t.จดเวลา;
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
  // จดเวลาไม่สำเร็จต้องไม่เงียบ — งานยังทำจบตามปกติ แต่รอบนี้จะไม่โผล่ใน ?jobtiming=1
  if (จดเวลา && จดเวลา !== "ok") console.log(`⏱️ จดเวลา slips-sync ไม่ได้: ${จดเวลา}`);
  return new Response(JSON.stringify({ ...r, จดเวลา }), { headers: { "content-type": "application/json" } });
}

// นาทีที่ 50 — ไม่ชน core-sync (:13/:43) · bundle-recipe (:27/:57) · contacts (:19) · returns (:07) · backup (:40) · beam (:00/:30)
export const config = { schedule: "50 * * * *" };
