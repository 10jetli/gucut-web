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
import { adminGate } from "../lib/admin-gate.mjs";

const SLUG = "10jetli";
const CACHE_MS = 10 * 60 * 1000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default async function handler(req, context) {
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  const token = process.env.NLF_CREDITS_TOKEN;
  if (!token) return json({ off: true });

  const s = getStore({ name: "gucut-coupon", consistency: "strong" });
  const cached = await s.get("netlify-credits", { type: "json" }).catch(() => null);
  if (cached && Date.now() - cached.at < CACHE_MS) return json(cached);

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

    const plan = Number(acc?.plan_credits) || 5000;
    const out = {
      at: Date.now(),
      plan,
      used: Math.round(used * 10) / 10,
      left: Math.round((plan - used) * 10) / 10,
      periodEnd: acc?.next_usage_period_start || null,
      top: parts.slice(0, 4),
    };
    await s.setJSON("netlify-credits", out);
    return json(out);
  } catch (e) {
    if (cached) return json(cached);   // ของเก่าดีกว่าไม่มี
    return json({ error: String(e?.message || e).slice(0, 100) }, 502);
  }
}

export const config = { path: "/api/netlify-credits" };
