// Beam แจ้งว่ามีการจ่ายเงินเข้ามา — /api/beam/webhook
//
// ⚠️ ห้ามเชื่อเนื้อความที่ส่งมาเด็ดขาด
//    ใครก็ยิงเข้ามาบอกว่า "ออเดอร์นี้จ่ายแล้ว" ได้ ถ้าเชื่อตรง ๆ = แจกของฟรี
//    เราเอาแค่ "เลขรายการ" จากข้อความ แล้วถามกลับไปที่ Beam เองว่าจ่ายจริงไหม
//    ปลอดภัยกว่าการตรวจลายเซ็น และไม่ต้องดูแลความลับเพิ่มอีกตัว
//
// ⚠️ ต้องตอบ 200 เสมอแม้จะทำอะไรไม่ได้
//    ระบบ webhook ทุกเจ้าจะยิงซ้ำเมื่อเจอ error ถ้าเราตอบ 500 มันจะยิงวนไม่หยุด
//    ของที่ผิดพลาดจริงให้ไปดูที่ log แทน
import { getStore } from "@netlify/blobs";
import { chargePaid, getCharge } from "../lib/beam.mjs";
import { markOrderPaid } from "./orders.mjs";

const ok = (note) =>
  new Response(JSON.stringify({ received: true, note }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// เลขรายการอาจอยู่คนละที่กันแล้วแต่รูปแบบที่ Beam ส่งมา — ไล่หาให้ครบ
function findChargeId(b) {
  return (
    b?.chargeId || b?.charge?.chargeId || b?.data?.chargeId ||
    b?.data?.charge?.chargeId || b?.object?.chargeId || ""
  );
}

export default async function handler(req, context) {
  if (req.method !== "POST") return ok("ต้องเป็น POST");

  let body = null;
  try { body = await req.json(); } catch { return ok("อ่านข้อความไม่ออก"); }

  const chargeId = String(findChargeId(body) || "").trim();
  if (!chargeId) return ok("ไม่มีเลขรายการในข้อความ");

  try {
    // ถามกลับไปที่ Beam — นี่คือแหล่งความจริงเดียวที่เชื่อได้
    const charge = await getCharge(chargeId);
    if (!chargePaid(charge)) return ok("ยังไม่จ่าย");

    const orderId = String(charge?.referenceId || "").trim();
    if (!orderId) return ok("รายการนี้ไม่มีเลขออเดอร์ติดมา");

    const store = getStore({ name: "gucut-orders", consistency: "strong" });
    const order = await store.get(`o/${orderId}`, { type: "json" }).catch(() => null);
    if (!order) return ok(`ไม่พบออเดอร์ ${orderId}`);

    // ⚠️ ต้องเช็คว่ายอดที่จ่ายมาตรงกับยอดออเดอร์
    //    ไม่งั้นคนที่แก้ยอดตอนสร้างรายการจ่ายจะได้ของครบโดยจ่ายไม่ครบ
    const paidBaht = Math.round(Number(charge?.amount || 0)) / 100;
    if (order.total && Math.abs(paidBaht - order.total) > 1) {
      return ok(`ยอดไม่ตรง (จ่าย ฿${paidBaht} · ออเดอร์ ฿${order.total})`);
    }

    await markOrderPaid(order, store, req, context);
    return ok(`ออเดอร์ ${orderId} จ่ายแล้ว`);
  } catch (e) {
    // ตอบ 200 ไว้ก่อน ไม่งั้น Beam จะยิงซ้ำไม่หยุด
    return ok(`ผิดพลาด: ${String(e?.message || e).slice(0, 150)}`);
  }
}

export const config = { path: "/api/beam/webhook" };
