// ทดสอบว่าเชื่อม Beam สำเร็จไหม — /api/beam-test  (หลังร้านเท่านั้น)
//
// ขอ QR พร้อมเพย์จริงหนึ่งใบเพื่อพิสูจน์ว่ารหัสใช้ได้ ไม่ได้เป็นการเก็บเงินใคร
// ไม่มีใครจ่าย QR ใบนี้ มันก็หมดอายุไปเอง
//
// ⚠️ ใช้ตอนตั้งค่าครั้งแรกหรือตอนเปลี่ยนคีย์เท่านั้น ไม่ได้มีไว้เรียกบ่อย ๆ
import { adminGate } from "../lib/admin-gate.mjs";
import { beamMode, beamReady, createQrCharge } from "../lib/beam.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async function handler(req, context) {
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  if (!beamReady()) {
    return json({
      ok: false,
      reason: "ยังไม่ได้ใส่รหัส Beam ที่ Netlify (BEAM_MERCHANT_ID / BEAM_API_KEY)",
      merchantIdSet: !!process.env.BEAM_MERCHANT_ID,
      apiKeySet: !!process.env.BEAM_API_KEY,
    });
  }

  const url = new URL(req.url);
  const baht = Math.max(1, Number(url.searchParams.get("baht")) || 20);
  const origin = url.origin;

  // ให้ลองรูปแบบ paymentMethod อื่นได้โดยไม่ต้อง deploy ใหม่ทุกครั้ง
  // (เอกสารของ Beam เปิดไม่ได้ ต้องลองจากข้อความ error ที่มันตอบกลับมา)
  let paymentMethod;
  const pm = url.searchParams.get("pm");
  if (pm) {
    try { paymentMethod = JSON.parse(pm); } catch { return json({ ok: false, reason: "pm ไม่ใช่ JSON" }); }
  }

  try {
    const c = await createQrCharge({
      orderId: `TEST-${Date.now()}`,
      baht,
      returnUrl: `${origin}/account/orders/`,
      paymentMethod,
    });
    return json({
      ok: true,
      mode: beamMode(),
      baht,
      chargeId: c.chargeId,
      actionRequired: c.actionRequired,
      gotQr: !!c.qrBase64,
      qrBytes: c.qrBase64.length,
      expiry: c.expiry,
      // ส่งรูปกลับไปด้วย จะได้เอาไปโชว์ตรวจด้วยตาได้
      qrBase64: c.qrBase64,
    });
  } catch (e) {
    return json({ ok: false, mode: beamMode(), reason: String(e?.message || e).slice(0, 300) });
  }
}

export const config = { path: "/api/beam-test" };
