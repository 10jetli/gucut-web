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
      lines: (Array.isArray(o.items) ? o.items : []).map((i) => ({
        sku: String(i.sku || ""),
        name: String(i.title || ""),
        /* ⚠️ **`|| 1` แต่งจำนวนขึ้นเมื่ออ่านค่าไม่ได้** (บันทึกไว้ 19 ก.ย. 2569 · ยังไม่แก้โดยตั้งใจ)
           จำนวนอ่านไม่ได้/เป็น 0 ⇒ รายงานเป็น **1 ชิ้น** และคิดยอด = ราคา × 1
           ⇒ แต่งทั้งจำนวนและเงินบนฟีดใบคืนสินค้า [[blank-input-invents-output]]
           🚫 **ยังไม่แก้เพราะเปลี่ยนรูปคำตอบ** (จำนวนเป็น null) อาจทำให้ผู้อ่านเดิมพัง
              และผมยังไม่รู้ว่าใครอ่านฟีดนี้อยู่ ⇒ ต้องเช็คผู้อ่านก่อน ไม่ใช่แก้เงียบ ๆ
           ⏳ ของค้าง: เช็คผู้อ่าน → ถ้าปลอดภัยให้คืน null + ธง `qtyKnown:false` แบบเพิ่มอย่างเดียว
           🔴 **และทิศของบั๊กแรงกว่าที่ผมเขียนไว้รอบแรก** (ฝั่งจอชี้ 19 ก.ย. 2569)
              `0 || 1` ได้ `1` ⇒ มันไม่ได้กลืนแค่ค่าที่อ่านไม่ได้ **แต่กลืน qty ที่เป็น 0 จริงด้วย**
              ⇒ ถ้าเคยมีแถว qty 0 ในฐาน **ยอดเกินจริงอยู่แล้ว** โดยไม่มีใครรู้
              🔑 ไม่ใช่ "กรณีขอบที่ข้อมูลเสีย" แต่เป็น **"ข้อมูลที่ถูกต้องถูกเขียนทับ"** ⇒ อันตรายกว่า
              ⇒ ต้องนับ **สามกอง** ก่อนแก้: อ่านไม่ได้ (ไม่รู้) · เป็น 0 จริง (รู้ว่าศูนย์) · ติดลบ
                 [[three-states-not-two]] — กองแรกกับกองที่สองตัดสินคนละแบบ
           📌 เจอจากการกวาดคลาส `Number(x) || N` ทั้ง repo (13 จุด) — **12 จุดที่เหลือไม่ใช่บั๊ก**
              เพราะเป็นเพดาน/ขนาดหน้า ที่ค่า 0 ไม่มีความหมายอยู่แล้ว และมี Math.max คุมอีกชั้น
              🔑 grep เจอ = "ที่ต้องดู" ไม่ใช่ "ที่ต้องแก้" ⇒ ดูแล้วทุกจุด บันทึกเหตุผลไว้ที่นี่ */
        qty: Number(i.qty) || 1,
        total: (Number(i.price) || 0) * (Number(i.qty) || 1),
      })),
    });
  }

  list.sort((a, b) => (a.date < b.date ? 1 : -1));
  /* ⚠️ `unreadable` > 0 = อ่านบางใบไม่ได้ **ไม่ใช่ว่าไม่มีของคืนในช่วงนี้** */
  return json({ list, unreadable });
}

export const config = { path: "/api/returns-feed" };
