// เก็บตัวอย่างยอดใช้เครดิต Netlify ลงประวัติ — **งานตามเวลาชั่วโมงละครั้ง (นาทีที่ 53)**
//
// 🔴 **ทำไมต้องมีงานนี้ (19 ก.ย. 2569) — ผมเจอข้อบกพร่องในของที่ผมเพิ่งเขียนเอง**
//    ผมเพิ่ม `burnPerDay`/`daysLeft` ให้ `/api/netlify-credits` โดยเก็บประวัติยอดใช้ไว้เอง
//    ⇒ **แต่ประวัติถูกเก็บเฉพาะตอนมีคนเปิดหลังร้าน และแคช 10 นาทีหมดอายุพอดี**
//    ⇒ **ไม่มีอะไรจุดชนวนให้เก็บ** ⇒ วันที่ไม่มีใครเปิดหลังร้าน ประวัติไม่โต
//      ⇒ อัตราเผาเป็น `null` หรือคิดจากจุดที่เก่าคร่ำ ⇒ ป้ายบนจอเชื่อถือไม่ได้
//    🔑 คลาส: **"มีตัวคิด" ไม่เท่ากับ "จะได้คิด"** — ของที่ต้องรอคนมากดคือของที่จะไม่ถูกกด
//       วันที่ต้องใช้มันที่สุดคือวันที่ทุกคนยุ่ง ซึ่งเป็นวันเดียวกับที่ไม่มีใครเปิดดู
//
// 🚫 **ไม่พ่วงเข้างานตามเวลาตัวอื่น โดยตั้งใจ** — เช้านี้เจอมาแล้วว่างานเดียวทำสองอย่าง
//    แล้วมีคนลดรอบเพราะเล็งงานหนึ่ง ⇒ **ลากอีกงานไปด้วยแบบไม่ตั้งใจ**
//    (สต็อกสินค้าชุดเก่าได้ 24 ชม. เพราะผมลดรอบโดยเล็งที่งานสูตร)
//    ⇒ งานนี้เบามาก (ยิงอ่านครั้งเดียว) แต่ **ความจำเป็นต่างจากงานอื่น** ⇒ แยกไว้
//
// ⏰ นาทีที่ 53 — เลี่ยงงานอื่น: core-sync (:13) · contacts-sync (:19) · bundle-stock-sync (:33) ·
//    mkp-fees-sync (:47) · slips-sync (:50) · beam-sweep (:00/:30)
// ⚠️ **บรรทัดแรกของไฟล์นี้เป็นที่มาของช่อง `desc` ใน cron-table** ⇒ แก้ตารางแล้วต้องแก้บรรทัดนั้นด้วย
//
// ⚠️ **ตัวนี้ไม่คิดอัตราเอง** — มันเก็บ "ยอดใช้ ณ เวลานั้น" อย่างเดียว
//    การคิดอัตราอยู่ที่ `/api/netlify-credits` ที่เดียว ⇒ **หนึ่งกติกา หนึ่งแหล่ง**
//    (ถ้าคิดสองที่ วันหนึ่งจอกับตัวเตือนจะบอกคนละเลขเรื่องเดียวกัน)
// 🔒 ห้าม log/ส่งออก token หรือรายละเอียดบิล — เก็บแค่ยอดรวมกับเวลา

import { getStore } from "@netlify/blobs";

const SLUG = "10jetli";
const ประวัติKEY = "netlify-credits-history";
const เก็บกี่จุด = 60;

export default async function handler() {
  const token = process.env.NLF_CREDITS_TOKEN;
  /* ยังไม่ได้ตั้งคีย์ = ยังไม่เปิดใช้ **ไม่ใช่ของเสีย** ⇒ ออกเงียบ ๆ ไม่ต้องส่งเสียง */
  if (!token) return new Response(JSON.stringify({ skip: "ยังไม่ได้ตั้ง NLF_CREDITS_TOKEN" }), {
    headers: { "content-type": "application/json" },
  });

  let ผล;
  try {
    const res = await fetch(`https://api.netlify.com/api/v1/${SLUG}/billing/credit_usage`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`credit_usage ${res.status}`);
    const usage = await res.json();
    const entries = Object.entries(usage || {});
    /* 🔴 **ไม่มีข้อมูลมา ≠ ใช้ไป 0** — Netlify เคยตอบ 200 พร้อม object ว่างมาแล้ว (5 ก.ย. 2569)
       ⇒ ถ้าเก็บ 0 ลงประวัติ อัตราเผาจะกลายเป็นติดลบในรอบถัดไป แล้ววันเหลือเพี้ยน
       ⇒ **ไม่เก็บอะไรเลยดีกว่าเก็บศูนย์ที่ไม่จริง** */
    if (!entries.length) throw new Error("Netlify ตอบ 200 แต่ไม่มีข้อมูลการใช้งาน — อ่านไม่ได้ ไม่ใช่ใช้ไป 0");
    let used = 0;
    for (const [, v] of entries) used += Number(v?.credits_used) || 0;

    const s = getStore({ name: "gucut-coupon", consistency: "strong" });
    let ประวัติ = await s.get(ประวัติKEY, { type: "json" }).catch(() => null);
    if (!Array.isArray(ประวัติ)) ประวัติ = [];
    ประวัติ.push({ at: Date.now(), used: Math.round(used * 10) / 10 });
    if (ประวัติ.length > เก็บกี่จุด) ประวัติ = ประวัติ.slice(-เก็บกี่จุด);
    /* ⚠️ ต้อง await — Netlify แช่แข็งฟังก์ชันทันทีที่ตอบ ⇒ promise ลอยตายกลางทาง */
    await s.setJSON(ประวัติKEY, ประวัติ);
    ผล = { ok: true, used: Math.round(used * 10) / 10, จุดในประวัติ: ประวัติ.length };
  } catch (e) {
    /* 🔇 **ล้มแล้วไม่ส่งเสียง โดยตั้งใจ** — งานนี้เก็บข้อมูลประกอบ ไม่ใช่ของที่ลูกค้าใช้
       ส่งเสียงทุกครั้งที่ Netlify งอแง = คนเลิกอ่านการแจ้งเตือนทั้งหมด
       ⚠️ แต่ **ต้องมีร่องรอย** ⇒ ปล่อยลง log ของฟังก์ชัน และปลายทาง (`/api/netlify-credits`)
          จะบอกเองว่าอัตราเป็น `null` เพราะประวัติไม่พอ ⇒ ความเงียบไม่ถูกอ่านว่าปกติ */
    ผล = { ok: false, error: String(e?.message || e).slice(0, 200) };
    console.error("[credit-sample]", ผล.error);
  }
  return new Response(JSON.stringify(ผล), { headers: { "content-type": "application/json" } });
}

export const config = { schedule: "53 * * * *" };
