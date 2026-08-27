// รับสำเนาตะกร้าของลูกค้าที่ล็อกอิน — /api/cart-sync (28 ส.ค. 2569)
//
// มีไว้เพื่อระบบทวงตะกร้า (netlify/lib/remind.mjs) — เซิร์ฟเวอร์ไม่มีทางรู้ว่า
// ในตะกร้ามีอะไรเพราะตะกร้าอยู่ใน localStorage ล้วน ๆ จึงให้หน้าเว็บส่งสำเนาย่อมา
//
// ⚠️ รับเฉพาะคนที่ล็อกอิน (เบอร์มาจาก session ไม่ใช่จาก body — ปลอมเบอร์คนอื่นไม่ได้)
//    คนไม่ล็อกอิน = เว็บไม่รู้จักเขา ทวงไม่ได้อยู่แล้ว ไม่ต้องเก็บอะไร
// ⚠️ เก็บย่อ: ชื่อ/จำนวน/ราคา พอทวงได้ ไม่เก็บอะไรเกินจำเป็น · ตะกร้าว่าง = ลบทิ้ง
// ⚠️ แตะตะกร้าใหม่ = นับหนึ่งใหม่ (reminded กลับเป็น false) — ทวงครั้งเดียวต่อชุด

import { getStore } from "@netlify/blobs";
import { currentUser, store as usersStore } from "../lib/session.mjs";

const ok = () => new Response(null, { status: 204 });

export default async function handler(req) {
  if (req.method !== "POST") return ok();

  let me = null;
  try { me = await currentUser(req, usersStore()); } catch { /* ไม่ล็อกอิน */ }
  const phone = me?.user?.phone?.replace(/\D/g, "");
  if (!phone) return ok();

  let body;
  try { body = await req.json(); } catch { return ok(); }

  const s = getStore({ name: "gucut-orders", consistency: "strong" });
  const key = `cart/${phone}`;

  const items = Array.isArray(body?.items) ? body.items.slice(0, 20) : [];
  if (!items.length) {
    await s.delete(key).catch(() => {});
    return ok();
  }
  await s.setJSON(key, {
    items: items.map((i) => ({
      t: String(i?.t || "").slice(0, 60),
      q: Math.max(1, Math.min(99, Number(i?.q) || 1)),
      p: Math.max(0, Number(i?.p) || 0),
    })),
    count: items.length,
    total: Math.max(0, Number(body?.total) || 0),
    at: Date.now(),
    reminded: false,
  });
  return ok();
}

export const config = { path: "/api/cart-sync" };
