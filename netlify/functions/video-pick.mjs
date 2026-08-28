// เลือกคลิปที่ขึ้นหน้าวิดีโอ — /api/video-pick (28 ส.ค. 2569)
//
// เดิมหน้าเลือกคลิปเก็บตัวเลือกใน localStorage ของเครื่องแอดมิน ซึ่ง "ไม่มีใครอ่าน"
// = กดเลือกไปก็ไม่มีผลกับเว็บจริงมาตลอด ตอนย้ายหน้ามาหลังร้านหลักจึงทำให้มีผลจริง:
//   GET             → { hidden: [ids] }  สาธารณะ (ฟีดของลูกค้าใช้กรอง) · แคช edge 60 วิ
//   POST {hidden}   → บันทึก (ต้องมีรหัสหลังร้าน)
// เก็บที่ store gucut-coupon คีย์ video-pick — รายการ "ที่ซ่อน" ไม่ใช่ที่โชว์
// (ค่าเริ่มต้นเว็บโชว์ทุกคลิปแนวตั้งอยู่แล้ว เก็บส่วนต่างจึงสั้นและปลอดภัยกว่า)
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";

const store = () => getStore({ name: "gucut-coupon", consistency: "strong" });
const KEY = "video-pick";

const json = (data, status = 200, cache = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(cache
        ? { "Cache-Control": "public, max-age=30", "Netlify-CDN-Cache-Control": `public, s-maxage=${cache}` }
        : { "cache-control": "no-store" }),
    },
  });

export default async function handler(req, context) {
  if (req.method === "GET") {
    const hidden = await store().get(KEY, { type: "json" }).catch(() => null);
    return json({ hidden: Array.isArray(hidden) ? hidden : [] }, 200, 60);
  }
  if (req.method === "POST") {
    const gate = await adminGate(req, context);
    if (gate.deny) return gate.deny;
    if (!gate.ok) return json({ error: "unauthorized" }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const hidden = Array.isArray(body?.hidden)
      ? body.hidden.map((v) => String(v).replace(/[^a-f0-9]/gi, "").slice(0, 64)).filter(Boolean).slice(0, 1000)
      : [];
    await store().setJSON(KEY, hidden);
    return json({ ok: true, hidden: hidden.length });
  }
  return json({ error: "method not allowed" }, 405);
}
export const config = { path: "/api/video-pick" };
