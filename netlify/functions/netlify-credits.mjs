// เครดิต Netlify คงเหลือ — /api/netlify-credits (28 ส.ค. 2569)
//
// เจ้าของร้านสั่ง "ตรงนี้ใส่เครดิต Netlify ว่าเหลือเท่าไหร่" (หัวหน้าหลังร้าน)
// เครดิตคือเงินจริงของร้าน (Pro = 5,000 เครดิต/เดือน · deploy ละ 15 · AI อ่านบัตรก็กิน)
// เห็นตัวเลขทุกครั้งที่เปิดหลังร้าน = รู้ตัวก่อนหมด ไม่ใช่มารู้ตอนโดนหยุดใช้งาน
//
// endpoint /api/v1/<slug>/billing/credit_usage ไม่อยู่ในเอกสารทางการ —
// ได้มาจากการดักดูว่าหน้า Usage & billing ของ Netlify เองเรียกอะไร (28 ส.ค. 2569)
// เปลี่ยนรูปแบบเมื่อไหร่ช่องนี้จะขึ้น "ดูไม่ได้" เฉย ๆ ไม่พังอย่างอื่น
//
// ⚠️ ใช้ token ของบัญชี Netlify ร้าน (env NLF_CREDITS_TOKEN) — ห้ามส่ง token
//    หรือรายละเอียดบิลออกไปหน้าเว็บ ตอบแค่ตัวเลขรวมที่ต้องโชว์
// ⚠️ แคช 10 นาที — หัวหลังร้านเปิดบ่อย ไม่ควรยิง Netlify ทุกครั้ง

import { getStore } from "@netlify/blobs";
/* 📜 สัญญาของประวัติอยู่ที่ไฟล์เดียว — ตัวเก็บ (`credit-sample.mjs`) กับตัวอ่าน (ไฟล์นี้) ต้องใช้ชุดเดียวกัน
   ⚠️ เคยเขียนซ้ำสองไฟล์ ⇒ ถ้าคีย์ไม่ตรงกัน ตัวอ่านเห็นประวัติว่าง **แล้วอ่านว่า "ยังไม่พอ" โดยไม่มีอะไรฟ้อง** */
import { ประวัติKEY, เก็บกี่จุด, เกณฑ์เก่าเกินชั่วโมง, เวลาISO } from "../lib/credit-history.mjs";
import { adminGate } from "../lib/admin-gate.mjs";

const SLUG = "10jetli";
const CACHE_MS = 10 * 60 * 1000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** 📉 **อัตราการเผาเครดิต + วันที่จะหมด — คิดจากประวัติหลายจุด ไม่ใช่สองจุดติดกัน**
 *
 * 🔴 ที่มา 19 ก.ย. 2569 (บทเรียนของวันนั้นเอง): ตัวเฝ้าบน g1 คิดอัตราจาก **สองจุดวัดล่าสุด ≈ 1 ชม.**
 *    ⇒ ชั่วโมงที่ทีม deploy 12 ครั้ง ให้ "เหลือ 4.8 วัน" · พอหยุด deploy กลับเป็น "~24–45 วัน"
 *    ⇒ **ข้อมูลชุดเดียวกัน ต่างกันหลายเท่า แค่เปลี่ยนหน้าต่าง**
 * 🔑 ⇒ อัตราต้องคิดจากหน้าต่างที่ยาวพอ **และต้องบอกหน้าต่างที่ใช้ไปด้วยเสมอ**
 *    (ฝั่งจอขอข้อนี้เป็นเงื่อนไข และเขาถูก: เลข "4.8 วัน" ที่ไม่มีหน้าต่างกำกับ
 *     ทำให้ตัดสินใจผิดแรงกว่าไม่มีเลขเลย)
 *
 * ⚠️ **คิดไม่ได้ ⇒ คืน `null` ทั้งสามช่อง ห้ามคืน 0 และห้ามใส่ค่าตั้งต้น**
 *    `daysLeft: 0` จะถูกอ่านว่า "หมดวันนี้" · `daysLeft: 999` จะเขียวตลอดกาล
 *    ⇒ `null` = "ยังไม่รู้" ซึ่งเป็นคำตอบที่ถูกเมื่อยังไม่มีข้อมูลพอ [[three-states-not-two]]
 * ⚠️ ยอดใช้ **ลดลง** ได้เมื่อขึ้นรอบบิลใหม่ ⇒ ถือว่า "เริ่มรอบใหม่" ไม่ใช่ "เผาติดลบ"
 *    ⇒ ตัดจุดที่เก่ากว่าการรีเซ็ตออก ไม่งั้นได้อัตราติดลบแล้วคำนวณวันเหลือเป็นค่าเพี้ยน
 */

const หน้าต่างน้อยสุดชม = 1;    // สั้นกว่านี้ไม่คิด — สั้นเกินไปให้เลขที่หลอกตา

export function คิดอัตราเผา(ประวัติ, ล่าสุด) {
  const ว่าง = { burnPerDay: null, daysLeft: null, burnWindowHours: null };
  if (!Array.isArray(ประวัติ) || !ล่าสุด || !Number.isFinite(Number(ล่าสุด.used))) return ว่าง;
  const now = Number(ล่าสุด.at) || Date.now();
  const usedNow = Number(ล่าสุด.used);
  /* เอาเฉพาะจุดที่ยอดใช้ **ไม่มากกว่าตอนนี้** — จุดที่มากกว่าแปลว่าคร่อมการรีเซ็ตรอบบิล */
  const ใช้ได้ = ประวัติ
    .filter((x) => Number.isFinite(Number(x?.used)) && Number.isFinite(Number(x?.at)))
    .filter((x) => Number(x.used) <= usedNow)
    .sort((a, b) => Number(a.at) - Number(b.at));
  /* เลือกจุดที่เก่าที่สุดที่ยังอยู่ในประวัติ ⇒ หน้าต่างยาวที่สุดที่มี */
  const เก่าสุด = ใช้ได้[0];
  if (!เก่าสุด) return ว่าง;
  const ชม = (now - Number(เก่าสุด.at)) / 3600_000;
  if (!(ชม >= หน้าต่างน้อยสุดชม)) return { ...ว่าง, burnWindowHours: Number(ชม.toFixed(2)) };
  const เผา = usedNow - Number(เก่าสุด.used);
  if (!(เผา > 0)) return { burnPerDay: 0, daysLeft: null, burnWindowHours: Number(ชม.toFixed(2)) };
  const ต่อวัน = (เผา / ชม) * 24;
  const เหลือ = Number(ล่าสุด.left);
  return {
    burnPerDay: Math.round(ต่อวัน),
    daysLeft: Number.isFinite(เหลือ) && ต่อวัน > 0 ? Number((เหลือ / ต่อวัน).toFixed(1)) : null,
    burnWindowHours: Number(ชม.toFixed(2)),
  };
}

/** ติดช่องอัตราเผาให้คำตอบ **ณ เวลาที่ตอบ** — ใช้ทั้งทางแคชและทางสด
 *
 *  🔴 ทำไมต้องมี (ยิงของจริงเจอเอง 19 ก.ย. 2569 หลัง deploy)
 *     ของเดิมคิดอัตราเผาเฉพาะ "ทางสด" แล้วอบค่าลงก้อนแคช ⇒ ทางแคชคืนก้อนเดิมทั้งก้อน
 *     ⇒ ก้อนที่ถูกเขียนไว้ **ก่อน** deploy ไม่มีสามช่องนั้นเลย
 *     ⇒ หลัง deploy ทุกครั้ง จอจะไม่เห็นช่องพวกนี้นานถึง 10 นาที **แบบที่แยกไม่ออกจาก "ท่อยังไม่ได้ deploy"**
 *     (ผมยิงตรวจแล้วเจอเองก่อนฝั่งจอมาถาม — ถ้าไม่ยิงก็จะเชื่อว่า push แล้วจบ)
 *  🔑 แก้ด้วยการ **คิดตอนตอบ ไม่ใช่ตอนเก็บ** — ประวัติอยู่ในคีย์แยกอยู่แล้ว
 *     ⇒ คำตอบมีสามช่องนี้เสมอไม่ว่ามาทางไหน · และค่าสดเท่าประวัติ ไม่ใช่เท่าอายุแคช
 *  ⚠️ แลกด้วยการอ่าน Blobs เพิ่ม 1 ครั้งต่อคำขอ (ยอมรับได้: เส้นนี้ใช้รหัสหลังร้าน คนนอกเรียกไม่ได้)
 *  ⚠️ อ่านประวัติไม่ได้ ⇒ ส่ง `null` ทั้งสาม **ห้ามส่ง 0** (ไม่รู้ ≠ เผาช้า) */
async function ติดอัตราเผา(s, out) {
  let ประวัติ = await s.get(ประวัติKEY, { type: "json" }).catch(() => null);
  if (!Array.isArray(ประวัติ)) ประวัติ = [];
  /* ตัดจุดที่เป็นรอบนี้เองออก (เวลาเท่ากัน) ไม่งั้นหน้าต่างจะเป็น 0 ชม. */
  const ก่อนหน้า = ประวัติ.filter((x) => Number(x?.at) < Number(out.at));
  /* 🔔 **เวลาของจุดล่าสุดในประวัติ — ส่งเป็น timestamp ดิบ ห้ามส่งเป็น "อายุกี่ชั่วโมง"**
     ค่าที่คิดจากเวลาปัจจุบันจะเก่าเงียบ ๆ ทันทีที่คำตอบถูกแคช ⇒ ให้จอคิดอายุเอง
     🔴 ทำไมจอต้องมีช่องนี้ (ฝั่งจอเป็นคนชี้ 19 ก.ย. 2569 และเหตุผลเขาหนักกว่าที่ผมคิด):
        ถ้างานตามเวลา `credit-sample` ตายเงียบ ⇒ ประวัติไม่โต ⇒ `burnPerDay` เป็น `null`
        ⇒ ป้ายกลับไปโชว์แค่ used/plan ซึ่ง **หน้าตาเหมือนตอนที่ยังไม่มีฟีเจอร์นี้เลย**
        ⇒ **ของหายโดยจอกลับไปเขียวแบบเดิม ไม่ใช่ขึ้นแดง** ⇒ ไม่มีใครรู้
     🔑 กติกาทั่วไป: **ฟีเจอร์ที่หายแล้วจอกลับไปหน้าตาเดิม ต้องมีตัวจับอายุข้อมูลเสมอ**
     ⚠️ `null` = ไม่มีประวัติเลย (ยังไม่เคยเก็บ) ต่างจาก "เก็บแล้วแต่เก่า" ⇒ จอต้องแยกสองอย่างนี้ */
  const จุดล่าสุด = ประวัติ.reduce(
    (m, x) => (Number.isFinite(Number(x?.at)) && Number(x.at) > m ? Number(x.at) : m), 0);
  return Object.assign(out, คิดอัตราเผา(ก่อนหน้า, out), {
    /* ชื่อช่องตามที่ฝั่งจอขอ (19 ก.ย. 2569) — ISO พร้อมโซน · `null` = ยังไม่มีตัวอย่างเลย
       🚫 ไม่มีตัวอย่าง **ห้ามส่งเวลาปัจจุบันแทน** จอจะเห็นว่าสดตลอดกาล (ฝั่งจอกำชับ) */
    "ตัวอย่างล่าสุดเมื่อ": เวลาISO(จุดล่าสุด),
    /* 🔑 **ส่งเกณฑ์มาด้วย ไม่ให้จอฝังเลขเอง** — ฝั่งจอขอเอง: "ถ้าผมฝัง 3 ไว้ในจอ
       เราจะได้เลขเกณฑ์สองที่อีกรอบ" ⇒ เกณฑ์นี้คิดจาก **รอบเก็บจริง** × จำนวนรอบที่ยอมให้พลาด
       ⇒ วันไหนท่อเปลี่ยนรอบเก็บ เกณฑ์เปลี่ยนตามเองทั้งสองฝั่ง */
    "ตัวอย่างเก่าเกินชั่วโมง": เกณฑ์เก่าเกินชั่วโมง,
    burnSamples: ประวัติ.length,
    "📉 อ่านอัตราเผายังไง": คำอธิบายอัตรา,
  });
}

const คำอธิบายอัตรา =
  "`burnPerDay`/`daysLeft` คิดจากประวัติยอดใช้จริงหลายจุด · " +
  "🔑 **ต้องอ่านคู่กับ `burnWindowHours` เสมอ** — อัตราจากหน้าต่างสั้นให้เลขที่หลอกตา " +
  "(19 ก.ย. 2569: หน้าต่าง 1 ชม. ที่ทีม deploy 12 ครั้ง ให้ \"เหลือ 4.8 วัน\" " +
  "พอหยุด deploy วัดใหม่หนึ่งชั่วโมงเต็มได้ 3.0 เครดิต/ชม. — ข้อมูลชุดเดียวกัน) · " +
  "🚫 `null` = **ยังไม่รู้** (ประวัติไม่พอ) ไม่ใช่ \"เผาช้า\" — ห้ามอ่านเป็นเขียว · " +
  "🔔 `burnSampleAt` = เวลาจุดล่าสุดในประวัติ (ms ดิบ · จอคิดอายุเอง) — **เก่าเกิน 3 ชม. = ตัวเก็บน่าจะตาย** " +
  "ให้ขึ้นเตือน ไม่ใช่ซ่อนอัตราเงียบ ๆ เพราะจอที่กลับไปหน้าตาเดิมคือของที่หายแบบไม่มีใครรู้";

export default async function handler(req, context) {
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  const token = process.env.NLF_CREDITS_TOKEN;
  if (!token) return json({ off: true });

  const s = getStore({ name: "gucut-coupon", consistency: "strong" });
  const cached = await s.get("netlify-credits", { type: "json" }).catch(() => null);
  /* ⚠️ **ต้องติดช่องอัตราเผาก่อนตอบ** — ห้ามคืนก้อนแคชดิบ (ดูเหตุผลที่ `ติดอัตราเผา`) */
  if (cached && Date.now() - cached.at < CACHE_MS) return json(await ติดอัตราเผา(s, { ...cached }));

  try {
    const headers = { Authorization: `Bearer ${token}` };
    const [usageRes, accRes] = await Promise.all([
      fetch(`https://api.netlify.com/api/v1/${SLUG}/billing/credit_usage`, { headers, signal: AbortSignal.timeout(8000) }),
      fetch(`https://api.netlify.com/api/v1/accounts/${SLUG}`, { headers, signal: AbortSignal.timeout(8000) }),
    ]);
    if (!usageRes.ok) throw new Error(`credit_usage ${usageRes.status}`);
    const usage = await usageRes.json();
    const acc = accRes.ok ? await accRes.json() : {};

    /* ⚠️ **"ไม่มีข้อมูลมา" กับ "ใช้ไป 0" คนละเรื่องกัน** (เจอของจริง 5 ก.ย. 2569 คืน)
        Netlify ตอบ 200 พร้อม object ว่าง ⇒ ของเดิมบวกได้ 0 แล้วรายงานว่า
        **"ใช้ไป 0 เหลือ 15,000"** อย่างมั่นใจ ทั้งที่ชั่วโมงก่อนหน้าเพิ่งอ่านได้ 7,099
        ⇒ ถ้าเชื่อ จะเข้าใจว่าเครดิตรีเซ็ตแล้ว deploy ได้ตามสบาย ซึ่งตรงข้ามกับความจริง
        ⚠️ และของเดิม **เขียนทับแคชด้วยศูนย์** ⇒ ค่าดี ๆ ที่เคยอ่านได้หายไปด้วย
        ⇒ ไม่มีคีย์เลย = อ่านไม่ได้ · มีคีย์แต่เป็นศูนย์ = ใช้ไป 0 จริง (ต้นรอบบิล) */
    const entries = Object.entries(usage || {});
    if (!entries.length) {
      if (cached) return json({ ...cached, stale: true, note: "Netlify ไม่ส่งข้อมูลการใช้งานมา — นี่คือค่าที่อ่านได้ครั้งล่าสุด ไม่ใช่ค่าสด" });
      return json({ unknown: true, note: "Netlify ตอบ 200 แต่ไม่มีข้อมูลการใช้งาน — อ่านไม่ได้ ไม่ใช่ใช้ไป 0" }, 502);
    }

    let used = 0;
    const parts = [];
    for (const [k, v] of entries) {
      const c = Number(v?.credits_used) || 0;
      used += c;
      if (c > 0) parts.push([k, Math.round(c * 10) / 10]);
    }
    parts.sort((a, b) => b[1] - a[1]);

    /* 🔴 **ค่าตั้งต้นที่ผิด อันตรายกว่าไม่มีค่าตั้งต้น** (ฝั่งจอทัก 18 ก.ย. 2569)
        เดิม `|| 5000` ⇒ ถ้า Netlify ไม่ส่ง `plan_credits` มา จอจะคิด % จากตัวหารที่ผิด **3 เท่า**
        (ใช้จริง 4,000 จาก 15,000 = 27% แต่จอคิดเป็น 80% แล้วขึ้นเตือน) และไม่มีอะไรบอกว่าตัวหารมาจากไหน
        ⇒ แยกสามสถานะ: ค่าที่ Netlify ยืนยัน · ค่าที่เคยอ่านได้ (แคช) · ค่าที่เราเติมให้
        ⇒ `planConfirmed` เป็นธงให้จอรู้ว่าจะโชว์ % ได้เต็มปากหรือต้องติดดอกจัน
        📏 เพดานจริงที่วัดจากหน้า Billing 18 ก.ย. 2569: **Pro = 15,000 เครดิต/เดือน** (มีผล 31 ส.ค.)
        ⚠️ ค่านี้เป็น "ค่าที่เคยเห็น" ไม่ใช่สัญญา — วันที่ร้านเปลี่ยนแพ็กเกจ มันจะผิดทันทีและเงียบ
           ⇒ ใช้ได้เฉพาะเป็นทางถอยสุดท้าย และต้องประกาศตัวว่าเป็นทางถอย [[fallbacks-must-announce]] */
    const PLAN_FALLBACK = 15000;
    const planFromNetlify = Number(acc?.plan_credits) || 0;
    const planFromCache = Number(cached?.planConfirmed ? cached.plan : 0) || 0;
    const plan = planFromNetlify || planFromCache || PLAN_FALLBACK;
    const planSource = planFromNetlify ? "netlify" : planFromCache ? "cache" : "fallback";
    const out = {
      at: Date.now(),
      plan,
      /* จอใช้ธงนี้ตัดสินว่าจะโชว์ % เต็มปากไหม — false ⇒ ติดเครื่องหมายข้างตัวเลข (ไม่ใช่แค่ใน tooltip) */
      planConfirmed: planSource !== "fallback",
      planSource,
      planFallback: PLAN_FALLBACK,
      used: Math.round(used * 10) / 10,
      left: Math.round((plan - used) * 10) / 10,
      periodEnd: acc?.next_usage_period_start || null,
      top: parts.slice(0, 4),
    };
    /* 📉 ต่อประวัติหนึ่งจุด แล้วให้ตัวช่วยตัวเดียวกันคิด — **กติกาไม่แตกสองที่** */
    let ประวัติ = await s.get(ประวัติKEY, { type: "json" }).catch(() => null);
    if (!Array.isArray(ประวัติ)) ประวัติ = [];
    ประวัติ.push({ at: out.at, used: out.used });
    if (ประวัติ.length > เก็บกี่จุด) ประวัติ = ประวัติ.slice(-เก็บกี่จุด);
    await s.setJSON(ประวัติKEY, ประวัติ);
    /* ⚠️ เก็บก้อนแคช **ก่อน** ติดช่องอัตรา — ไม่งั้นค่าอัตราจะถูกอบค้างไว้ในแคช
       แล้วรอบต่อ ๆ ไปที่มาทางแคชจะเห็นอัตราเก่า ทั้งที่เราคิดใหม่ให้ได้ */
    await s.setJSON("netlify-credits", out);
    return json(await ติดอัตราเผา(s, out));
  } catch (e) {
    if (cached) return json(cached);   // ของเก่าดีกว่าไม่มี
    return json({ error: String(e?.message || e).slice(0, 100) }, 502);
  }
}

export const config = { path: "/api/netlify-credits" };
