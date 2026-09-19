// ใบคืนของจากเว็บหน้าร้าน — /api/returns-feed
//
// มีไว้ให้หลังร้านตัวเก่า (admin.gucut.com) ดึงไปรวมกับใบคืนจาก ZORT
// จะได้เห็นของที่ถูกคืน "ทุกช่องทาง" ในหน้าเดียว
//
// ⚠️ ทำไมต้องมีทางนี้ ทั้งที่ ZORT รวมทุกช่องทางอยู่แล้ว
//    ออเดอร์จากเว็บถูกส่งเข้า ZORT ตอนสั่งก็จริง
//    แต่ "การยกเลิก/คืนของ" บนเว็บไม่ได้ส่งไป ZORT (กติกาเดิมของระบบ)
//    ZORT จึงไม่มีวันรู้ว่าลูกค้าเว็บคืนของ ต้องดึงจากที่นี่เท่านั้น
//
// ⚠️ นับเฉพาะ "คืนของ" (returned) ไม่นับ "ยกเลิก" (cancelled)
//    ยกเลิกก่อนส่ง = ไม่เสียอะไร · คืนของหลังส่ง = เสียค่าส่งสองขา
//    รวมกันเมื่อไหร่ตัวเลขจะบวมจนเอาไปตัดสินใจไม่ได้
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async function handler(req, context) {
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  const days = Math.min(1095, Math.max(7, Number(new URL(req.url).searchParams.get("days")) || 365));
  const since = Date.now() - days * 86400_000;

  const store = getStore({ name: "gucut-orders", consistency: "strong" });
  let blobs = [];
  try { ({ blobs } = await store.list({ prefix: "o/" })); } catch { return json({ list: [] }); }

  const list = [];
  let unreadable = 0;
  /* 🔑 ตัวนับระดับฟีด — **ส่งออกเสมอ (0 ได้)** เพื่อให้จอแยก "ท่อยังไม่ส่ง" (ไม่มีคีย์)
     ออกจาก "ส่งแล้วและเป็นศูนย์" (มีคีย์ ค่า 0) — ฝั่งจอเตรียมช่องรับไว้แล้ว */
  let qtyUnreadableLines = 0;
  let qtyZeroLines = 0;
  let priceUnreadableLines = 0;
      /* 🔴 **แถวที่อ่านไม่ได้ต้องนับไว้ ห้ามหายเงียบ** (แก้ 6 ก.ย. 2569)
          `.catch(() => null)` แล้ว `continue` ⇒ แถวนั้นหายจากผลลัพธ์**โดยไม่มีตัวนับบอก**
          ⇒ ผลลัพธ์หน้าตาเหมือนครบทุกประการ · ต้องส่งจำนวนที่อ่านไม่ได้ออกไปด้วย
          (ท่าเดียวกับที่ lib/live.mjs ทำกับ READ_CAP อยู่แล้ว) */
  for (const b of blobs) {
    const o = await store.get(b.key, { type: "json" }).catch(() => null);
    if (!o) { unreadable++; continue; }
    if (o.status !== "returned") continue;
    // ⚠️ ใช้เวลาที่เปลี่ยนเป็นคืนของ ไม่ใช่เวลาที่สั่ง — ไม่งั้นของที่สั่งปีที่แล้ว
    //    แล้วเพิ่งคืนเดือนนี้จะไม่โผล่ในช่วง 30 วัน
    const at = Number(o.returnedAt || o.at) || 0;
    if (at < since) continue;

    list.push({
      number: String(o.id),
      ref: String(o.id),
      date: new Date(at + 7 * 3600_000).toISOString().slice(0, 10),   // วันแบบไทย
      channel: "GUCUT",
      status: "Success",
      amount: Number(o.total) || 0,
      customer: String(o.customer?.name || ""),
      phone: String(o.customer?.phone || ""),
      province: String(o.customer?.province || ""),
      tracking: String(o.tracking || ""),
      lines: (Array.isArray(o.items) ? o.items : []).map((i) => {
        /* ✅ **แก้แล้ว 19 ก.ย. 2569 — และแก้ได้ตอนนี้เพราะวัดแล้วว่าไม่กระทบตัวเลขใดเลย**
           ของเดิม: `qty: Number(i.qty) || 1` และ `total: ราคา × (qty || 1)`
           ⇒ `0 || 1` ได้ `1` ⇒ **ไม่ได้กลืนแค่ค่าที่อ่านไม่ได้ แต่กลืน qty ที่เป็น 0 จริงด้วย**
             = "ข้อมูลที่ถูกต้องถูกเขียนทับ" ไม่ใช่แค่ "กรณีขอบ" (ฝั่งจอชี้ทิศนี้ให้ 19 ก.ย.)
           📏 **วัดของจริงก่อนแก้** (ยิง `/api/orders` ด้วยรหัสหลังร้าน 19 ก.ย. 2569 11:2x):
              27 ใบ · 29 บรรทัดสินค้า · **qty > 0 ทั้ง 29 บรรทัด** ·
              อ่านไม่ได้ 0 · เป็น 0 จริง 0 · ติดลบ 0 · และใบสถานะ `returned` = **0 ใบ**
              ⇒ บั๊กนี้ **ยังไม่เคยออกฤทธิ์** ⇒ แก้วันนี้ ผลลัพธ์เท่าเดิมทุกตัวอักษร
              🔑 นี่คือเวลาที่ถูกที่สุดในการแก้: ถ้ารอให้มีแถว qty 0 เข้ามาก่อน
                 การแก้จะ **เปลี่ยนตัวเลขที่คนเคยเห็น** แล้วต้องอธิบายว่าทำไมยอดลด
           ⚠️ **ไม่เปลี่ยนชนิดของ `qty`** (ยังเป็นตัวเลขเสมอ) — เพิ่มธง `qtyKnown` แบบเพิ่มอย่างเดียว
              ⇒ ผู้อ่านเดิมไม่พัง · ฝั่งจอเลือกใช้ธงเมื่อพร้อม */
        const qtyดิบ = i.qty;
        const qtyอ่านได้ =
          qtyดิบ === null || qtyดิบ === undefined || qtyดิบ === ""
            ? null
            : (() => {
                const n = Number(String(qtyดิบ).replace(/,/g, "").trim());
                return Number.isFinite(n) ? n : null;
              })();
        if (qtyอ่านได้ === null) qtyUnreadableLines++;
        else if (qtyอ่านได้ === 0) qtyZeroLines++;
        const ราคา = (() => {
          const n = Number(String(i.price ?? "").replace(/,/g, "").trim());
          return Number.isFinite(n) ? n : null;
        })();
        if (ราคา === null) priceUnreadableLines++;
        return {
          sku: String(i.sku || ""),
          name: String(i.title || ""),
          /* อ่านไม่ได้ ⇒ 0 **พร้อมธงบอกว่าไม่รู้** — ห้ามแต่งเป็น 1 เหมือนเดิม */
          qty: qtyอ่านได้ ?? 0,
          qtyKnown: qtyอ่านได้ !== null,
          /* ⚠️ ยอดต้องคิดจากจำนวนจริง — อ่านไม่ได้ ⇒ 0 บาท **ห้ามคิดเป็นราคา × 1**
             (ของเดิมแต่งทั้งจำนวนและเงินพร้อมกัน ⇒ ยอดบนฟีดใบคืนเกินจริง) */
          total: (ราคา ?? 0) * (qtyอ่านได้ ?? 0),
          totalKnown: ราคา !== null && qtyอ่านได้ !== null,
        };
            }),
    });
  }

  list.sort((a, b) => (a.date < b.date ? 1 : -1));
  /* ⚠️ `unreadable` > 0 = อ่านบางใบไม่ได้ **ไม่ใช่ว่าไม่มีของคืนในช่วงนี้** */
  return json({
    list,
    unreadable,
    qtyUnreadableLines,
    qtyZeroLines,
    priceUnreadableLines,
    วัดเมื่อ: new Date().toISOString(),
  });
}

export const config = { path: "/api/returns-feed" };
