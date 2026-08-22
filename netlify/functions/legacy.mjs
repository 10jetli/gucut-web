// ประวัติลูกค้าเก่าสมัย Shopify — /api/legacy  (ต้องมีรหัสหลังร้าน)
//
//   GET ?q=<เบอร์โทร หรือ ชื่อ>   ค้นหา
//   GET                          สรุปภาพรวม
//
// ⚠️ ข้อมูลนี้เป็นชื่อ เบอร์โทร ที่อยู่ลูกค้า — ต้องผ่านด่านรหัสหลังร้านเสมอ
//    และห้ามย้ายไฟล์ข้อมูลไปไว้ใน public/ เด็ดขาด (ใครก็โหลดได้)
//
// ⚠️ ข้อมูลนิ่ง ไม่มีอะไรมาอัปเดตอีก — ร้าน Shopify ปิด 26 ส.ค. 2569
//    มีไว้ตอบคำถามเดียว: "ลูกค้าคนนี้เคยซื้ออะไรกับเราไปบ้าง"
import { adminGate } from "../lib/admin-gate.mjs";
import legacy from "../lib/legacy-data.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const digits = (v) => String(v || "").replace(/\D/g, "");

export default async function handler(req, context) {
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  const q = (new URL(req.url).searchParams.get("q") || "").trim();

  if (!q) {
    return json({
      note: legacy.note,
      orders: legacy.orders.length,
      customers: legacy.customers.length,
      revenue: Math.round(legacy.orders.reduce((s, o) => s + o.total, 0)),
    });
  }

  // ⚠️ ถ้าพิมพ์เป็นตัวเลขให้ค้นแบบเบอร์โทร (เทียบท้าย 9 หลัก)
  //    คนพิมพ์เบอร์ได้หลายแบบ 081-234-5678 · 0812345678 · 66812345678
  //    เทียบท้ายจึงเจอทุกแบบโดยไม่ต้องบังคับให้พิมพ์ให้ตรง
  const qd = digits(q);
  const byPhone = qd.length >= 6;
  const tail = qd.slice(-9);
  const low = q.toLowerCase();

  const hit = (v) => String(v || "").toLowerCase().includes(low);
  const phoneHit = (v) => digits(v).slice(-9) === tail;

  const orders = legacy.orders
    .filter((o) => (byPhone ? phoneHit(o.phone) : hit(o.name) || hit(o.id)))
    .slice(0, 60);

  const customers = legacy.customers
    .filter((c) => (byPhone ? phoneHit(c.phone) : hit(c.name) || hit(c.email)))
    .slice(0, 30);

  return json({ q, orders, customers, spent: Math.round(orders.reduce((s, o) => s + o.total, 0)) });
}

export const config = { path: "/api/legacy" };
