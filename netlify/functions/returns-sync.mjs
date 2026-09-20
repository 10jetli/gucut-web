// ใบคืนสินค้า (ลูกค้าคืน · ReturnOrder) ZORT → คลังเงา return_orders_v2 (กุญแจ id) — งานตามเวลา **ทุก 3 ชั่วโมง** (ลดจากทุกชั่วโมง 18 ก.ย. 2569 · เหตุผลอยู่ท้ายไฟล์)
//
// 🔴 ที่มา (15 ก.ย. 2569): จอยอดขายจะหักใบคืนจาก ?list=orders (returnedAmount) ซึ่งอ่านตาราง return_orders
//    แต่ syncReturnOrders() **ไม่มีอะไรเรียกเลย** มีแต่เส้นสั่งมือ ?syncreturnorders
//    ⇒ ยอดหักคืนจะค้างเงียบ ๆ แบบสต็อกชุดที่ค้าง 187/360 ชุด (ใบด่วน t_mu1dfbz2) [[nothing-triggers-it]]
// ⚠️ แยกเป็นงานของตัวเอง — core-sync / bundle-recipe-sync มีงบเวลาตึงอยู่แล้ว [[time-budget-is-shared]]
// ⚠️ ไม่มี URL (Netlify ไม่ให้ schedule พร้อม path) · สั่งเดี๋ยวนั้น: GET /api/core?syncreturns=1
//    (commit bea658d เขียนชื่อผิดเป็น ?syncreturnorders=1 ซึ่งตกไปคำตอบหน้าแรก — แก้ 15 ก.ย. 2569)
// ⚠️ ล้มหรือไม่ครบต้องส่งเสียง — ไม่งั้นยอดหักคืนผิดโดยจอยังโชว์เลขสวย (จอเห็นได้จาก returnsSyncedAtUtc/returnsSyncComplete ด้วย)
// ⏱️ จดเวลาตัวเองลงสมุด job_run_log ทุกรอบ (19 ก.ย. 2569 · ใบ S1) — อ่านที่ /api/core?jobtiming=1
//    ⚠️ รอบนี้ทำสองร้าน (z1+z2) ⇒ จดเป็น **รอบเดียว** เพราะทั้งคู่ใช้งบเวลาก้อนเดียวกัน
import { syncReturnOrders } from "../lib/core-purchases.mjs";
import { วัดเวลางาน, ผู้เรียกจากคำขอ } from "../lib/job-timing.mjs";

export default async function handler(req) {
  /* ⏱️ ครอบทั้งรอบ (z1+z2) ไว้ในการวัดครั้งเดียว — แต่ **try ของแต่ละร้านยังแยกกันเหมือนเดิม**
     z2 ล้มต้องไม่ลาก z1 · และเวลาที่จดต้องเป็นเวลารวมของรอบ ซึ่งคือสิ่งที่กินงบฟังก์ชันจริง */
  let r;
  let rz2;
  let จดเวลา = null;
  {
    const t = await วัดเวลางาน("returns-sync", async () => {
      let a;
      try {
        a = await syncReturnOrders({ pages: 12 });
      } catch (e) {
        a = { ok: false, error: String(e?.message || e).slice(0, 300) };
      }
      // ร้าน z2 (15 ก.ย. 2569 · ใบ t_mu2pfve9) — แยก try ของตัวเอง · ล้มไม่ลาก z1
      let b;
      try {
        b = await syncReturnOrders({ pages: 12, store: "z2" });
      } catch (e) {
        b = { ok: false, error: String(e?.message || e).slice(0, 300) };
      }
      return { z1: a, z2: b };
    }, {
      // 🔎 "รอบนี้ใครสั่ง" — อ่านจากคำขอ ห้ามเดา (ดูเหตุผลใน job-timing.mjs)
      ผู้เรียก: await ผู้เรียกจากคำขอ(req),
      // ล้มถ้าร้านใดร้านหนึ่งมี error หรือดึงมาไม่ครบ (complete === false) · skip ไม่ใช่ล้ม
      ตัดสินผล: (x) => {
        const เสีย = (o) => !!o?.error || (!o?.skip && o?.complete === false);
        return เสีย(x?.z1) || เสีย(x?.z2) ? "failed" : "ok";
      },
      /* 🔴 เดิมสมุดได้แค่ `fetched` — ส่วนเหตุของความล้ม (error · ไม่ครบ · id ชนข้ามร้าน)
         ถูกคิดไว้ด้านล่างแล้วใช้ **ส่ง Telegram เท่านั้น** ⇒ สมุดชี้ตัวไม่ได้
         🔑 "วัดได้แล้วทิ้งระหว่างทาง" (ฝั่งจอตั้งชื่อ 19 ก.ย. ค่ำ) ⇒ ต่อท่อให้ถึงสมุดด้วย */
      อธิบาย: (x) => {
        const เหตุ = (o, ชื่อ) =>
          o?.error ? `${ชื่อ} ล้ม: ${o.error}`
            : o?.skip ? null
              : o?.complete === false ? `${ชื่อ} ไม่ครบ: ได้ ${o.fetched} จาก ${o.zortTotal}` : null;
        const ปัญหา = [เหตุ(x?.z1, "z1"), เหตุ(x?.z2, "z2")].filter(Boolean);
        return `z1 fetched ${x?.z1?.fetched ?? "?"} · z2 fetched ${x?.z2?.fetched ?? "?"}` +
          (ปัญหา.length ? ` · ${ปัญหา.join(" | ").slice(0, 200)}` : "");
      },
    });
    r = t.ผลลัพธ์.z1;
    rz2 = t.ผลลัพธ์.z2;
    จดเวลา = t.จดเวลา;
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
  const problemZ2 = rz2?.error
    ? `ล้ม: ${rz2.error}`
    : rz2?.skip
      ? null
      : (rz2?.collisions ?? 0) > 0 || (r?.collisions ?? 0) > 0
        ? `id ใบคืนชนข้ามร้าน (z1 ${r?.collisions ?? 0} · z2 ${rz2?.collisions ?? 0}) — ไม่ได้เขียน ต้องเปลี่ยนกุญแจ`
        : rz2?.complete === false
          ? `ไม่ครบ: ได้ ${rz2.fetched} จาก ZORT ${rz2.zortTotal} ใบ`
          : null;
  if (problemZ2) {
    const { TELEGRAM_BOT_TOKEN: bt, TELEGRAM_CHAT_ID: ci } = process.env;
    if (bt && ci) {
      await fetch(`https://api.telegram.org/bot${bt}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: ci, text: `⚠️ ซิงก์ใบคืนสินค้าร้าน z2 จาก ZORT ${problemZ2}` }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
    }
  }
  if (จดเวลา && จดเวลา !== "ok") console.log(`⏱️ จดเวลา returns-sync ไม่ได้: ${จดเวลา}`);
  return new Response(JSON.stringify({ ...r, z2: rz2, จดเวลา }), { headers: { "content-type": "application/json" } });
}

/* นาทีที่ 7 — ไม่ชน core-sync (:13/:43) · beam-sweep (:00/:30) · bundle-recipe-sync (วันละครั้ง 03:00 UTC — เดิม :27/:57 เปลี่ยน 18 ก.ย. 2569) · backup (:40)
   ⏱️ **ลดจากทุกชั่วโมงเป็นทุก 3 ชั่วโมง** (18 ก.ย. 2569) — ฝั่งจอจับเวลาจริงตัวละ 3 รอบ
      วัดได้ ~15.7 วิ/รอบ · 24 รอบ/วัน ≈ 6 นาที/วัน และ **ทุกรอบ fetched 693 written 0**
      คือดึงมาทั้งกองแล้วไม่มีอะไรเปลี่ยน เพราะใบคืนไม่ได้เกิดทุกชั่วโมง
   🔑 เหตุผลหลักที่ลด **ไม่ใช่เครดิต Netlify** — compute เป็นแค่ 7.7% ของเครดิตที่เผา
      (deploy คือ 89%) ⇒ ลด cron ประหยัดเครดิตน้อยมาก · เหตุผลจริงคือ **ลดการยิง ZORT**
      เพราะเพิ่งพบว่า ZORT มีโควตารายการ 2,000/เดือน และเรายิงอ่านบ่อยเกินความจำเป็น
   ⚠️ สิ่งที่แลกไป: ใบคืนใหม่เข้ากระจกช้าได้ถึง 3 ชม. ⇒ ยอด "หักคืนแล้ว" บนจอยอดขายล้าได้เท่านั้น
      ถ้าวันไหนร้านคืนของบ่อยขึ้น ให้กลับเป็นทุกชั่วโมง · สั่งเดี๋ยวนั้นได้เสมอ: /api/core?syncreturns=1 */
export const config = { schedule: "7 */3 * * *" };
