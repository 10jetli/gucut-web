// ปลุกตัวกวาดดันสต็อก **shopee** ตามเวลา — เพิ่ม 17 ก.ย. 2569 (gucut2 · ท่านประธานสั่ง "ทำให้ครบ")
// แยกฟังก์ชันต่อเจ้า: คิดแผนหนึ่งเจ้าก็ ~10–14 วิ ⇒ รวมสามเจ้าในรอบเดียวเกินเพดาน ~30 วิของฟังก์ชันตามเวลา
// ⏰ นาที 5,20,35,50 — เหลื่อมกับ Lazada (*/15) ไม่ให้สามเจ้าวิ่งพร้อมกัน และไม่ชนกุญแจ push_sweep_log.at
// ⛔ **ค่าเริ่มต้นคือซ้อม** — ยิงจริงเฉพาะ env `STOCK_PUSH_AUTO_SHOPEE=1` (ไม่ใช่ STOCK_PUSH_AUTO ของ Lazada ที่เปิดอยู่แล้ว)
//    โหมดซ้อมยังเขียนสมุดสถานะครบ ⇒ จอเห็นช่องทางนี้ได้ และรอบกวาดยืนยันของที่สั่งยิงมือได้
// สั่งกวาดเดี๋ยวนั้น: POST /api/core?pushsweep=1 body {"platform":"shopee"}

export default async function handler() {
  try {
    const { กวาดดันสต็อก } = await import("../lib/stock-push-sweep.mjs");
    const r = await กวาดดันสต็อก({ platform: "shopee" });
    console.log("[กวาดดันสต็อก shopee]", JSON.stringify(r));
  } catch (e) {
    console.error("[กวาดดันสต็อก shopee] ล้มเหลว:", e?.message || e);
  }
}

export const config = { schedule: "5,20,35,50 * * * *" };
