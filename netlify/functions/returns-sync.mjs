// ใบคืนสินค้า (ลูกค้าคืน · ReturnOrder) ZORT → คลังเงา return_orders_v2 (กุญแจ id) — งานตามเวลาทุกชั่วโมง
//
// 🔴 ที่มา (15 ก.ย. 2569): จอยอดขายจะหักใบคืนจาก ?list=orders (returnedAmount) ซึ่งอ่านตาราง return_orders
//    แต่ syncReturnOrders() **ไม่มีอะไรเรียกเลย** มีแต่เส้นสั่งมือ ?syncreturnorders
//    ⇒ ยอดหักคืนจะค้างเงียบ ๆ แบบสต็อกชุดที่ค้าง 187/360 ชุด (ใบด่วน t_mu1dfbz2) [[nothing-triggers-it]]
// ⚠️ แยกเป็นงานของตัวเอง — core-sync / bundle-recipe-sync มีงบเวลาตึงอยู่แล้ว [[time-budget-is-shared]]
// ⚠️ ไม่มี URL (Netlify ไม่ให้ schedule พร้อม path) · สั่งเดี๋ยวนั้น: GET /api/core?syncreturns=1
//    (commit bea658d เขียนชื่อผิดเป็น ?syncreturnorders=1 ซึ่งตกไปคำตอบหน้าแรก — แก้ 15 ก.ย. 2569)
// ⚠️ ล้มหรือไม่ครบต้องส่งเสียง — ไม่งั้นยอดหักคืนผิดโดยจอยังโชว์เลขสวย (จอเห็นได้จาก returnsSyncedAtUtc/returnsSyncComplete ด้วย)
import { syncReturnOrders } from "../lib/core-purchases.mjs";

export default async function handler() {
  let r;
  try {
    r = await syncReturnOrders({ pages: 12 });
  } catch (e) {
    r = { ok: false, error: String(e?.message || e).slice(0, 300) };
  }
  const problem = r?.error
    ? `ล้ม: ${r.error}`
    : r?.skip
      ? null
      : r?.complete === false
        ? `ไม่ครบ: ได้ ${r.fetched} จาก ZORT ${r.zortTotal} ใบ · หน้าล้ม ${r.pagesFailed} · ชนเพดานหน้า ${r.hitPageCap}`
        : null;
  if (problem) {
    const { TELEGRAM_BOT_TOKEN: bt, TELEGRAM_CHAT_ID: ci } = process.env;
    if (bt && ci) {
      await fetch(`https://api.telegram.org/bot${bt}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: ci,
          text: `⚠️ ซิงก์ใบคืนสินค้าจาก ZORT ${problem}\nยอดขายหลังหักคืนบนจอจะไม่ครบรอบนี้\n\nสั่งซ้ำ: /api/core?syncreturns=1`,
        }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
    }
  }
  return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
}

// นาทีที่ 7 — ไม่ชน core-sync (:13/:43) · beam-sweep (:00/:30) · bundle-recipe-sync (:27/:57) · backup (:40)
export const config = { schedule: "7 * * * *" };
