// รูป/ราคา/สต็อก ของอะไหล่ที่จับคู่ไว้แล้ว — /api/parts-skus?model=f440 (12 ต.ค. 2569)
//
// คุณส้มขอมา และเหตุผลของเขาแข็งกว่าเรื่อง "หน้าช้า":
//   F440 มี 368 แถว ⇒ ถ้าจอยิง /api/stock?sku= รายชิ้น = ลูกค้าหนึ่งคนเปิดหน้าเดียว
//   เท่ากับ **ยิง ZORT 368 ครั้ง** ⇒ นี่คือค่าโควตาที่ท่านประธานจ่าย ไม่ใช่เรื่องความเร็ว
// ⇒ เส้นนี้ตอบ **ทีเดียวต่อรุ่น** และอ่านสต็อกจาก **แคชที่กวาดไว้แล้ว** (`liveStock`)
//   ไม่ยิง ZORT รายชิ้นเลยสักครั้ง
//
//   GET /api/parts-skus?model=f440
//     → { model, items: { "<รหัสอะไหล่>": {sku,title,price,image,handle,st} }, ... }
//
// 🔑 สัญญาที่ตกลงกับฝั่งจอ — **สามสถานะ ไม่ใช่สอง** ทุกช่องที่เป็นตัวเลข
//    `st`/`price` เป็นตัวเลข = รู้ · **`null` = ไม่รู้** ⇒ จอต้องเขียนว่า "ยังอ่านไม่ได้"
//    🚫 **ห้ามจอแปลง null เป็น 0 หรือเป็น "สินค้าหมด"** — คนละเรื่องกันคนละทิศ
//    (คลาสที่กัดเราทั้งวัน 12 ต.ค.: "ไม่รู้" ถูกพูดออกไปเป็นคำยืนยัน)
import { getStore } from "@netlify/blobs";
import { liveStock } from "../lib/zort-stock.mjs";
import { licensedStock } from "../lib/licensed-stock.mjs";

const จำกัด = 200;   // คุณส้มขอไม่เกิน 200 รายการต่อคำตอบ

const ล้างรุ่น = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);

const json = (data, status = 200, cache = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      /* 🔑 เส้นนี้ **อ่านอย่างเดียว ลูกค้าเรียก** ⇒ แคชได้ แต่สั้น เพราะสต็อกเปลี่ยนได้ทุกครึ่งชั่วโมง
         ⚠️ และ **ห้ามแคชคำตอบที่แปลว่า "ไม่รู้"** (503) — ไม่งั้นการสะดุดครั้งเดียว
            ถูกแจกต่อให้ลูกค้าทุกคนนานเป็นนาที (บทเรียน clip-shop เช้านี้) */
      ...(cache
        ? { "Cache-Control": "public, max-age=30", "Netlify-CDN-Cache-Control": `public, s-maxage=${cache}` }
        : { "cache-control": "no-store", "Netlify-CDN-Cache-Control": "no-store" }),
    },
  });

export default async function handler(req) {
  if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
  const url = new URL(req.url);
  const model = ล้างรุ่น(url.searchParams.get("model"));
  if (!model) return json({ error: "ต้องระบุ model" }, 400);

  /* ① ตารางจับคู่ที่ท่านประธานกรอกด้วยมือ — คีย์เดียวกับที่ /api/parts-map เขียน
     🔴 อ่านไม่ได้ ห้ามตอบ items ว่าง — จอจะเขียนว่า "ยังไม่ได้จับคู่" ทุกแถว
        ทั้งที่ของจริงอาจจับคู่ไว้ครบ 368 แถว (ตารางนี้พิมพ์มือ ไม่มีสำเนาที่อื่น) */
  let จับคู่;
  try {
    const s = getStore({ name: "gucut-coupon", consistency: "strong" });
    จับคู่ = (await s.get(`parts-map/${model}`, { type: "json" })) || {};
  } catch (e) {
    return json({ model, items: null, อ่านไม่ได้: true,
      เหตุ: `อ่านตารางจับคู่ไม่ได้ชั่วคราว — ของที่จับคู่ไว้ยังอยู่ครบ (${String(e?.message ?? e).slice(0, 80)})` }, 503);
  }
  const คู่ = Object.entries(จับคู่).filter(([, sku]) => sku);
  /* ยังไม่จับคู่เลย = **ความจริง** ⇒ 200 + items ว่าง (แคชได้) · จอเขียนว่า "ยังไม่ได้จับคู่" ถูกต้อง */
  if (!คู่.length) return json({ model, items: {}, ทั้งหมด: 0, จับคู่แล้ว: 0 }, 200, 60);

  /* ② ชื่อ/รูป/ลิงก์ — จาก feed-base.json ที่สร้างตอน deploy (ไม่ยิง ZORT) */
  let base = null;
  try {
    const r = await fetch(`${url.origin}/feed-base.json`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    base = await r.json();
  } catch (e) {
    return json({ model, items: null, อ่านไม่ได้: true,
      เหตุ: `โหลดข้อมูลสินค้าไม่ได้ (${String(e?.message ?? e).slice(0, 80)})` }, 503);
  }
  const ตามsku = new Map((Array.isArray(base?.list) ? base.list : []).map((p) => [String(p.sku), p]));

  /* ③ สต็อก/ราคาสด — จากแคชที่กวาดไว้ **ไม่ยิง ZORT รายชิ้น**
     ⚠️ `stale`/`partial` ต้องส่งต่อให้จอ — ของเก่าที่ไม่บอกว่าเก่า คือของที่โกหกเงียบ ๆ */
  let สด = { map: null, at: null, stale: true, partial: null };
  try { สด = await liveStock(); } catch { /* อ่านสต็อกไม่ได้ ⇒ st เป็น null รายตัว ไม่ล้มทั้งเส้น */ }

  const items = {};
  let ไม่รู้สต็อก = 0;
  let ไม่พบในคลัง = 0;
  for (const [รหัส, skuดิบ] of คู่.slice(0, จำกัด)) {
    const sku = String(skuดิบ);
    const p = ตามsku.get(sku) || null;
    if (!p) ไม่พบในคลัง++;
    const live = สด.map?.[sku];
    const lic = licensedStock(sku);
    /* 🔑 `st` สามสถานะ: ทะเบียนใบอนุญาตชนะ → สต็อกสด → ค่าที่แช่ไว้ตอน build → **null = ไม่รู้**
       🚫 ไม่มี `?? 0` ที่นี่โดยตั้งใจ — ศูนย์ทำให้คนสบายใจ ว่างทำให้คนสงสัย */
    const st = lic !== null ? lic
      : Array.isArray(live) ? live[0]
      : typeof p?.st === "number" ? p.st
      : null;
    if (st === null) ไม่รู้สต็อก++;
    const price = Array.isArray(live) && live[1] > 0 ? live[1]
      : typeof p?.p === "number" ? p.p
      : null;
    items[รหัส] = {
      sku,
      title: p?.t ?? null,
      price,
      image: p?.img ?? null,
      handle: p?.h ?? null,
      st,
    };
  }

  return json({
    model,
    items,
    /* 🔑 ป้ายขอบเขตมาก่อนตัวเลข — จอต้องรู้ว่าที่ได้ไปคือ "ทั้งหมด" หรือ "ถูกตัด"
       ไม่ส่งสองเลขนี้ = จอนับ items ได้ 200 แล้วเข้าใจว่าจับคู่ไว้ 200 คู่ */
    จับคู่แล้ว: คู่.length,
    ส่งมา: Object.keys(items).length,
    ตัดที่: คู่.length > จำกัด ? จำกัด : null,
    /* ตัวนับที่ส่งออกเสมอ (0 ได้) — ตัวนับที่ไม่มีใครเห็น คือตัวนับที่ไม่มีใครเชื่อ */
    ไม่รู้สต็อก,
    ไม่พบในคลัง,
    สต็อกเก่า: !!สด.stale,
    สต็อกไม่ครบ: สด.partial ?? null,
    สต็อกเมื่อ: สด.at ?? null,
    "🔎 อ่านยังไง":
      "st/price เป็นตัวเลข = รู้ · null = **ยังอ่านไม่ได้ ห้ามแปลว่า 0 หรือ 'สินค้าหมด'** · " +
      "สต็อกเก่า=true ⇒ เลขมาจากแคชเก่า ให้เขียนกำกับบนจอ",
  }, 200, 60);
}

export const config = { path: "/api/parts-skus" };
