// สุขภาพของฟีดสินค้าที่ AI อ่าน — /api/feed-health  (หลังร้านเท่านั้น)
//
// ตอบสามคำถามที่เจ้าของร้านต้องรู้
//   1. ตอนนี้ฟีดดึงสต็อกสดได้จริงไหม หรือกำลังใช้ของเก่าอยู่
//   2. มีสินค้าใน ZORT ที่ "เว็บยังไม่มีหน้า" กี่ตัว — พวกนี้ AI มองไม่เห็นเลย
//   3. มีสินค้าบนเว็บที่ "หาไม่เจอใน ZORT" กี่ตัว — พวกนี้ใช้สต็อกเก่าที่แช่ไว้ตอบ
//
// ⚠️ หนัก (โหลดฟีดทั้งก้อน + กวาด ZORT) เรียกจากหลังร้านตอนกดปุ่มเท่านั้น
import { adminGate } from "../lib/admin-gate.mjs";
import { liveStock } from "../lib/zort-stock.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async function handler(req, context) {
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  const origin = new URL(req.url).origin;

  let base;
  try {
    const r = await fetch(`${origin}/feed-base.json`, { signal: AbortSignal.timeout(8000) });
    base = await r.json();
  } catch {
    return json({ error: "โหลดข้อมูลสินค้าของเว็บไม่ได้" }, 502);
  }
  const list = Array.isArray(base?.list) ? base.list : [];
  const onSite = new Set(list.map((p) => p.sku));

  const { map, at, stale, partial } = await liveStock();
  if (!map) {
    /* 🔴 **อ่าน ZORT ไม่ได้ ≠ ZORT ไม่มีของ** (แก้ 28 ก.ย. 2569 · สเปกฝั่งจอ ข้อ 9)
       ของเดิมตอบ `inZort: 0` · `missing: []` · `notInZort: []` ⇒ อ่านบนจอได้ว่า
       **"ZORT มีสินค้า 0 ตัว และไม่มีอะไรตกหล่นเลย"** ซึ่งเป็นข่าวดีปลอมสองข้อในคำตอบเดียว
       ⇒ `0` คือ "วัดได้ว่าศูนย์" · `[]` คือ "ตรวจแล้วไม่มี" · ทั้งคู่เป็นคำอ้างที่เรายังไม่มีสิทธิ์พูด
       ✅ ใช้ `null` ทั้งสามคำถามตามกติกา "แยกสามสถานะ" ที่ตกลงกับฝั่งจอ
          และ `stockLive` เป็น `null` ด้วย — `false` แปลว่า "ใช้ของเก่าอยู่" ซึ่งคนละเรื่องกับ "ไม่รู้" */
    return json({
      stockLive: null,
      stockSource: "unreadable",
      partial: !!partial,
      at: null,
      onSite: list.length,          // ← ข้อนี้รู้จริง (มาจากไฟล์ของเว็บเอง) จึงคงเป็นตัวเลข
      inZort: null,
      matched: null,
      missingCount: null,
      missing: null,
      notInZortCount: null,
      notInZort: null,
      error: "ดึงข้อมูลจาก ZORT ไม่ได้",
      "⚠️ อ่านยังไง": "ช่องที่เป็น null = **ยังไม่รู้** ไม่ใช่ศูนย์ · ห้ามเอาไปวาดกราฟหรือสรุปว่าไม่มีของตกหล่น",
    });
  }

  // อยู่ใน ZORT มีของ แต่เว็บไม่มีหน้าสินค้า → AI มองไม่เห็นสินค้าตัวนี้เลย
  const missing = [];
  for (const [sku, [st, price]] of Object.entries(map)) {
    if (st > 0 && !onSite.has(sku)) missing.push({ sku, st, price });
  }
  missing.sort((a, b) => b.st - a.st);

  // อยู่บนเว็บ แต่หาไม่เจอใน ZORT → ฟีดต้องใช้สต็อกเก่าที่แช่ไว้ตอบ
  const notInZort = list.filter((p) => !map[p.sku]).map((p) => ({ sku: p.sku, t: p.t }));

  return json({
    stockLive: !stale,
    /* ทางปกติบอกที่มาด้วยเสมอ ⇒ จอแยก live / cached / unreadable ได้จากช่องเดียว
       (คีย์เดียวกับที่ /products.json ใช้ — ห้ามให้สองฟีดเรียกสถานะเดียวกันคนละชื่อ) */
    stockSource: stale ? "cached" : "live",
    partial: !!partial,
    at: at ? new Date(at).toISOString() : null,
    onSite: list.length,
    inZort: Object.keys(map).length,
    matched: list.filter((p) => map[p.sku]).length,
    missingCount: missing.length,
    missing: missing.slice(0, 40),
    notInZortCount: notInZort.length,
    notInZort: notInZort.slice(0, 20),
  });
}

export const config = { path: "/api/feed-health" };
