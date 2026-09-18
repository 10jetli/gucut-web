// กระจกค่าธรรมเนียม Shopee (escrow รายใบ) → ตาราง shopee_fees — งานตามเวลาทุกชั่วโมง
//
// 🔴 ที่มา (18 ก.ย. 2569): `mirrorShopeeFees()` มีแต่เส้นสั่งมือ `POST /api/core?mkpfeesync=1`
//    **ไม่มีอะไรเรียกเลย** ⇒ กระจกจะว่างตลอดกาล แล้วจอที่อ่านสรุปจะโชว์ 0 ใบแบบเงียบ ๆ
//    เป็นโรคเดียวกับใบคืนสินค้าที่ค้างมา 3 เดือน และสูตรชุดที่ค้าง 187/360 [[nothing-triggers-it]]
//    🔑 "เขียนโค้ดเสร็จ" ไม่เท่ากับ "ระบบทำงาน" — ต้องมีตัวจุดชนวนที่ไม่ใช่คน
//
// ⚠️ **Shopee เท่านั้น** — เจ้าเดียวที่สูตรถูกวัดกับของจริงแล้ว (ต่าง 1 บาทใน 6/8 ใบ)
//    Lazada/TikTok ห้ามพ่วงเข้ามาโดยไม่วัดสูตรใหม่ · เหตุผลเต็มอยู่ในหัว mkp-finance-mirror.mjs
// ⚠️ escrow ยิงได้ทีละใบ (ไม่มีเส้นแบบก้อน) ⇒ ตัวมิเรอร์มีเพดานเวลาในตัวและคืน `remaining`
//    ⇒ แยกเป็นงานของตัวเอง ไม่พ่วง beam-sweep/core-sync ที่งบเวลาตึงอยู่แล้ว [[time-budget-is-shared]]
// ⚠️ ไม่มี URL (Netlify ไม่ให้ schedule พร้อม path) · สั่งเดี๋ยวนั้น: POST /api/core?mkpfeesync=1
//
// 🧭 **ตัวจับชีพจร**: เขียน `core_meta` คีย์ `mkp_fees_sync` ทุกรอบ (สำเร็จหรือล้มก็เขียน)
//    ⇒ จอ/สถานะระบบแยกได้ว่า "ยังไม่มีใบใหม่" ต่างจาก "งานตามเวลาตายไปแล้ว"
//    ห้ามใช้ MAX(at) ของตาราง shopee_fees แทน — คืนไหนไม่มีใบใหม่ ค่านั้นจะเก่าทั้งที่งานปกติ
import { mirrorShopeeFees } from "../lib/mkp-finance-mirror.mjs";
import { coreQuery } from "../lib/coredb.mjs";

/* ทุกชั่วโมงกวาด 3 วันล่าสุด · ตี 4 กวาดกว้าง 14 วัน (เผื่อ Shopee แก้ยอดย้อนหลัง)
   ⚠️ Shopee ปฏิเสธช่วง ≥15 วัน (wallet.time_invalid) ⇒ 14 คือเพดานจริง ไม่ใช่เลขที่เลือกเอง */
const WIDE_HOUR_TH = 4;

export default async function handler() {
  const hourTH = new Date(Date.now() + 7 * 3600e3).getUTCHours();
  const wide = hourTH === WIDE_HOUR_TH;
  let r;
  try {
    r = await mirrorShopeeFees({ days: wide ? 14 : 3, limit: wide ? 40 : 20 });
  } catch (e) {
    r = { ok: false, error: String(e?.message || e).slice(0, 300) };
  }

  /* ชีพจร — เขียนทุกรอบ ไม่ว่าผลจะเป็นอะไร
     ⚠️ ล้มตรงนี้ห้ามทำให้งานล้ม (ข้อมูลเข้ากระจกแล้ว การจดชีพจรพลาดไม่ใช่เหตุให้ทิ้งผล) */
  const note = r?.skip
    ? `skip: ${String(r.skip).slice(0, 80)}`
    : r?.error
      ? `error: ${String(r.error).slice(0, 80)}`
      : `เขียน ${r?.["เขียนแล้ว"] ?? 0} ใบ · ค้างก่อนรอบนี้ ${r?.["ค้างก่อนรอบนี้"] ?? "?"}` +
        (r?.truncatedByTime ? " · หมดเวลา ยังไม่ครบ" : "") +
        (wide ? " · รอบกวาดกว้าง 14 วัน" : "");
  await coreQuery(
    `INSERT INTO core_meta (k, v, at) VALUES ('mkp_fees_sync', ?, datetime('now'))
     ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = datetime('now')`,
    [note]
  ).catch(() => null);

  /* 🔔 ส่งเสียงเฉพาะสองเรื่องที่คนต้องรู้ — ไม่ส่งทุกรอบ ไม่งั้นคนเลิกอ่าน
     ① ยิงล้ม (ไม่ใช่ skip เพราะยังไม่เชื่อมร้าน — อันนั้นตั้งใจ)
     ② **สูตรเริ่มเพี้ยน** = สัญญากับ Shopee เปลี่ยน ⇒ ยอดโอนที่เราคำนวณจะผิดทั้งกอง
        เกณฑ์: รอบนี้มีใบที่ต่างเกิน 2 บาท ⇒ บอกจำนวนและตัวอย่าง
        ⚠️ ตาข่ายนี้จะหยุดมีความหมายวันที่ Shopee เปลี่ยนสูตรแล้วเรา "แก้ตาม" โดยไม่วัดใหม่
           ⇒ วันนั้นต้องกลับไปวัดกับใบจริงอีกรอบ ไม่ใช่ปรับตัวเลขให้ diff เป็น 0 [[nets-expire-silently]] */
  const off = Array.isArray(r?.["ใบที่สูตรต่างเกิน2บาท"]) ? r["ใบที่สูตรต่างเกิน2บาท"] : [];
  const problem = r?.error
    ? `ล้ม: ${r.error}`
    : off.length
      ? `สูตรคิดยอดโอน Shopee เริ่มไม่ตรง ${off.length} ใบในรอบนี้ (ต่างเกิน 2 บาท)\n` +
        off.slice(0, 3).map((x) => `· ${x.order_sn} ต่าง ${x["ต่าง"]} บาท`).join("\n")
      : null;
  if (problem) {
    const { TELEGRAM_BOT_TOKEN: bt, TELEGRAM_CHAT_ID: ci } = process.env;
    if (bt && ci) {
      await fetch(`https://api.telegram.org/bot${bt}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: ci,
          text: `⚠️ กระจกค่าธรรมเนียม Shopee — ${problem}\n\n` +
            `สูตรที่วัดไว้ 18 ก.ย. 2569 ต่างจาก escrow ที่ Shopee บอกไม่เกิน 1 บาทใน 6 จาก 8 ใบ\n` +
            `ถ้าเริ่มเพี้ยนเป็นกอง = Shopee เปลี่ยนช่อง ต้องวัดสูตรใหม่กับใบจริง ห้ามปรับเลขให้ต่างเป็น 0\n` +
            `สั่งซ้ำ: POST /api/core?mkpfeesync=1 · ดูสรุป: GET /api/core?mkpfeesum=1`,
        }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
    }
  }
  return new Response(JSON.stringify({ ...r, wideSweep: wide, pulseNote: note }), {
    headers: { "content-type": "application/json" },
  });
}

// นาทีที่ 47 — ไม่ชน beam-sweep (:00/:30) · core-sync (:13/:43) · backup (:40) · slips (:50)
//   stock-push shopee (:05/:20/:35/:50) · tiktok (:10/:25/:40/:55) · returns (:07) · contacts (:19)
export const config = { schedule: "47 * * * *" };
