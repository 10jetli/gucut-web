// จับคู่ "รหัสอะไหล่ในคู่มือ" → "รหัสสินค้าในร้าน" — /api/parts-map (11 ต.ค. 2569)
//
// แผนผังอะไหล่ที่ /parts/ ดึงรหัสมาจากคู่มือ STIHL (เช่น 1123 020 1209)
// แต่รหัสสินค้าของร้านเป็นเลขลำดับ (00001, 04382) — **ไม่มีอะไรตรงกันเลยสักตัว**
// (ยิงเทียบจริง 11 ต.ค. 2569: 325 รหัสอะไหล่ F250 เทียบกับ 2,537 SKU ของร้าน = ตรง 0)
// ⇒ ต้องมีตารางจับคู่ที่ "คนกรอก" และเจ้าของร้านสั่งว่าจะกรอกเอง
//
//   GET  ?model=f250                      → { map: { "11230201209": "04382" } }  สาธารณะ
//   POST ?model=f250  { part, sku }       → จับคู่ทีละชิ้น (sku ว่าง = ลบคู่)
//   POST ?model=f250  { map: {...} }      → เขียนทับทั้งรุ่น (ใช้ตอนนำเข้าเป็นชุด)
//
// 🔑 ทำไมเก็บ "ทั้งรุ่นในคีย์เดียว" ทั้งที่กฎร้านบอกให้ใช้หนึ่งชิ้น-หนึ่งคีย์
//    กฎนั้นมีไว้กัน "คนเขียนพร้อมกันแล้วทับกัน" ซึ่งเกิดกับของที่ลูกค้าหลายคนยิง
//    ตารางนี้มีคนกรอกคนเดียว (เจ้าของร้าน) แต่ฝั่งอ่านคือลูกค้าทุกคน
//    ⇒ แลกเป็นอ่านเร็ว (คีย์เดียวจบ) ดีกว่าไล่ list คีย์ทุกครั้งที่มีคนเปิดหน้า
//    ⚠️ วันไหนมีคนกรอกพร้อมกันหลายคน ต้องเปลี่ยนเป็นหนึ่งชิ้น-หนึ่งคีย์ทันที
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";

const store = () => getStore({ name: "gucut-coupon", consistency: "strong" });
const คีย์ = (model) => `parts-map/${model}`;

const json = (data, status = 200, cache = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(cache
        ? {
            "Cache-Control": "public, max-age=30",
            "Netlify-CDN-Cache-Control": `public, s-maxage=${cache}`,
          }
        : { "cache-control": "no-store" }),
    },
  });

/** ชื่อรุ่นต้องเป็น slug สั้น ๆ เท่านั้น — กันคนยิงชื่อคีย์แปลก ๆ เข้ามา */
const ล้างรุ่น = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
/** รหัสอะไหล่เก็บแบบไม่มีช่องว่าง เพราะในคู่มือเว้นวรรคไม่เหมือนกันทุกที่ */
const ล้างรหัส = (v) => String(v || "").replace(/\s+/g, "").toUpperCase().slice(0, 24);
/** รหัสสินค้าของร้าน — ตัวอักษร/ตัวเลข/ขีด เท่านั้น */
const ล้างsku = (v) => String(v || "").trim().replace(/[^\w.-]/g, "").slice(0, 32);

export default async function handler(req, context) {
  const url = new URL(req.url);
  const model = ล้างรุ่น(url.searchParams.get("model"));
  if (!model) return json({ error: "ต้องระบุ model" }, 400);

  if (req.method === "GET") {
    const map = await store().get(คีย์(model), { type: "json" }).catch(() => null);
    // ⚠️ อ่านไม่ได้ = ถือว่ายังไม่จับคู่ ไม่ใช่หน้าเสีย — หน้าร้านต้องยังเปิดได้
    return json({ model, map: map && typeof map === "object" ? map : {} }, 200, 60);
  }

  if (req.method === "POST") {
    const gate = await adminGate(req, context);
    // ⚠️ adminGate คืน object ไม่ใช่ Response — เขียน `if (gate) return gate` ไม่ได้
    //    (เคยพลาดมาแล้ว 25 ส.ค. 2569 ทุกคำขอตอบ "unsupported value")
    if (gate.deny) return gate.deny;
    if (!gate.ok) return json({ error: "unauthorized" }, 401);

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }

    const เดิม = (await store().get(คีย์(model), { type: "json" }).catch(() => null)) || {};
    let ใหม่;

    if (body && typeof body.map === "object" && body.map) {
      ใหม่ = {};
      for (const [k, v] of Object.entries(body.map).slice(0, 5000)) {
        const a = ล้างรหัส(k);
        const b = ล้างsku(v);
        if (a && b) ใหม่[a] = b;
      }
    } else {
      const part = ล้างรหัส(body?.part);
      if (!part) return json({ error: "ต้องระบุ part" }, 400);
      const sku = ล้างsku(body?.sku);
      ใหม่ = { ...เดิม };
      // sku ว่าง = ตั้งใจลบคู่นี้ทิ้ง — ไม่ใช่ความผิดพลาด
      if (sku) ใหม่[part] = sku;
      else delete ใหม่[part];
    }

    await store().setJSON(คีย์(model), ใหม่);
    return json({ ok: true, model, จับคู่แล้ว: Object.keys(ใหม่).length });
  }

  return json({ error: "method not allowed" }, 405);
}

export const config = { path: "/api/parts-map" };
