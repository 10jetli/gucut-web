// ผู้ติดต่อ ZORT → คลังเงา contacts — งานตามเวลาทุกชั่วโมง (งานกระดาน t_mu2045bl · 15 ก.ย. 2569)
//
// 🔴 ที่มา: ท่อบอก 28,250 ราย · จอ ZORT บอก 28,333 (gucut2 จับได้ตอนเก็บหน้า /Contact/list)
//    พิสูจน์แล้ว: syncContacts() **ไม่มีอะไรเรียกเลย** มีแต่เส้นสั่งมือ ?synccontacts= ⇒ กระจกค้างเงียบ ๆ
//    ซิงก์หน้า 1 หน้าเดียวเขียนรายใหม่ 84 ⇒ ตรง ZORT 28,334 [[nothing-triggers-it]]
// ⚠️ แยกงานของตัวเอง — งานตามเวลาอื่นมีงบเวลาตึงอยู่แล้ว [[time-budget-is-shared]]
// ⚠️ ไม่มี URL (Netlify ไม่ให้ schedule พร้อม path) · สั่งเดี๋ยวนั้น: GET /api/core?synccontactsnow=1
// ⚠️ ล้มต้องส่งเสียง — ไม่งั้นจอผู้ติดต่อเก่าลงเรื่อย ๆ โดยตัวเลขยังดูปกติ (จอเห็นได้จาก sync.recentAtUtc ด้วย)
// ⏱️ จดเวลาตัวเองลงสมุด job_run_log ทุกรอบ (19 ก.ย. 2569 · ใบ S1) — อ่านที่ /api/core?jobtiming=1
//    🔑 **ห้ามยิงฟังก์ชันนี้เพื่อจับเวลา** — มันเขียนกระจกผู้ติดต่อจริงและกินเวลาที่กำลังจะวัดพอดี
import { syncContactsScheduled } from "../lib/core-contacts.mjs";
import { วัดเวลางาน } from "../lib/job-timing.mjs";

export default async function handler() {
  let r;
  let จดเวลา = null;
  try {
    const t = await วัดเวลางาน("contacts-sync", syncContactsScheduled, {
      // ข้าม = ทำงานปกติ (ยังไม่ถึงรอบ) · มี errors = ล้ม · นอกนั้นถือว่าจบดี
      ตัดสินผล: (x) => (Array.isArray(x?.errors) && x.errors.length && !x?.skip ? "failed" : "ok"),
      /* 🔴 เดิมอ่าน `x.written` ที่ระดับบนสุด ซึ่ง **ไม่มี** (ของจริงอยู่ใน recent/sweep) ⇒ note = null ทุกแถว
         ⇒ ฝั่งจอชี้ว่าเหลือแต่ `outcome: ok` ที่ผู้เรียกบอกเอง ⇒ **ไม่ใช่หลักฐานว่าแตะงาน** */
      อธิบาย: (x) => {
        if (x?.skip) return `skip: ${x.skip}`;
        const r = x?.recent;
        const w = x?.sweep;
        if (!r && !w) return null;
        return `recent fetched ${r?.fetched ?? "?"} written ${r?.written ?? "?"}` +
          ` · sweep fetched ${w?.fetched ?? "?"} written ${w?.written ?? "?"}${w?.skipped ? ` (${w.skipped})` : ""}`;
      },
    });
    r = t.ผลลัพธ์;
    จดเวลา = t.จดเวลา;
  } catch (e) {
    r = { ok: false, errors: [{ stage: "throw", error: String(e?.message || e).slice(0, 300) }] };
  }
  const errs = Array.isArray(r?.errors) ? r.errors : [];
  if (!r?.skip && errs.length) {
    const { TELEGRAM_BOT_TOKEN: bt, TELEGRAM_CHAT_ID: ci } = process.env;
    if (bt && ci) {
      await fetch(`https://api.telegram.org/bot${bt}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: ci,
          text: `⚠️ ซิงก์ผู้ติดต่อจาก ZORT มีปัญหา ${errs.length} จุด: ${errs.map((e) => `${e.stage}: ${e.error}`).join(" · ").slice(0, 600)}\nจอผู้ติดต่ออาจไม่สดรอบนี้\n\nสั่งซ้ำ: /api/core?synccontactsnow=1`,
        }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
    }
  }
  if (จดเวลา && จดเวลา !== "ok") console.log(`⏱️ จดเวลา contacts-sync ไม่ได้: ${จดเวลา}`);
  return new Response(JSON.stringify({ ...r, จดเวลา }), { headers: { "content-type": "application/json" } });
}

// นาทีที่ 19 — ไม่ชน beam-sweep (:00/:30) · returns-sync (:07) · core-sync (:13/:43) · bundle-recipe-sync (วันละครั้ง 03:00 UTC — เดิม :27/:57 เปลี่ยน 18 ก.ย. 2569) · backup (:40)
export const config = { schedule: "19 * * * *" };
